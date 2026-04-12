// 云函数 - 获取活动统计结果（偏好加权版）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 分页查询：db.get() 默认最多返回 20 条，超过会丢数据
async function getAllResponses(eventId) {
  const MAX_LIMIT = 100
  const countRes = await db.collection('responses').where({ eventId }).count()
  const total = countRes.total
  const batchTimes = Math.ceil(total / MAX_LIMIT)
  const allData = []
  for (let i = 0; i < batchTimes; i++) {
    const res = await db.collection('responses').where({ eventId })
      .skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
    allData.push(...res.data)
  }
  return allData
}

function normalizeSlots(slots) {
  if (Array.isArray(slots)) {
    const result = {}
    slots.forEach(id => { result[id] = 2 }) // 旧格式兼容：视为有空=2分
    return result
  }
  return slots || {}
}

function generateAllSlotIds(startDate, endDate, granularity) {
  const ids = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  const slotsPerDay = granularity === 'hour' ? 24 : (granularity === 'halfDay' ? 4 : 12)

  while (start <= end) {
    const dateStr = formatDate(start)
    for (let i = 0; i < slotsPerDay; i++) {
      ids.push(`${dateStr}_${i}`)
    }
    start.setDate(start.getDate() + 1)
  }
  return ids
}

// 本地 formatDate：云函数环境无法 require 前端 utils，故在此独立定义
function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatSlotLabel(slotId, granularity) {
  const [date, hour] = slotId.split('_')
  const d = new Date(date)
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dateText = `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`
  const h = parseInt(hour)
  let timeText
  if (granularity === 'halfDay') {
    const labels = ['上午 00:00-12:00', '下午 12:00-18:00', '晚上 18:00-24:00', '深夜 00:00-06:00']
    timeText = labels[h] || labels[0]
  } else {
    const span = granularity === 'hour' ? 1 : 2
    const endHour = Math.min(h + span, 24)
    timeText = `${String(h).padStart(2, '0')}:00-${String(endHour).padStart(2, '0')}:00`
  }
  return `${dateText} ${timeText}`
}

function findParetoOptimal(slotDetails) {
  const candidates = Object.values(slotDetails).filter(s => s.availableCount > 0)
  return candidates.filter(s => {
    return !candidates.some(other =>
      other.slotId !== s.slotId &&
      other.hardCount >= s.hardCount &&
      other.weightedScore >= s.weightedScore &&
      (other.hardCount > s.hardCount || other.weightedScore > s.weightedScore)
    )
  })
}

exports.main = async (event, context) => {
  const { eventId } = event

  if (!eventId) {
    return { success: false, error: '缺少活动ID' }
  }

  try {
    const eventRes = await db.collection('events').doc(eventId).get()
    if (!eventRes.data) {
      return { success: false, error: '活动不存在' }
    }

    const eventData = eventRes.data
    const responses = await getAllResponses(eventId)
    const granularity = eventData.granularity || 'twoHours'
    const N = responses.length

    if (N === 0) {
      return {
        success: true,
        data: {
          event: eventData,
          responses,
          recommendations: [],
          summary: { participantCount: 0, totalSlots: 0, consensusLevel: 0, paretoOptimalSlots: [] },
          heatmap: {},
          bestSlots: []
        }
      }
    }

    const allSlotIds = generateAllSlotIds(eventData.startDate, eventData.endDate, granularity)

    // 归一化
    const normalized = responses.map(resp => ({
      ...resp,
      _slots: normalizeSlots(resp.slots)
    }))

    // 预计算每用户总偏好值
    const userTotals = normalized.map(resp =>
      Math.max(Object.values(resp._slots).reduce((s, v) => s + v, 0), 1)
    )

    const alpha = 0.5
    const heatmap = {}
    const slotDetails = {}

    for (const slotId of allSlotIds) {
      let hardCount = 0
      let weightedScore = 0
      let preferenceConcentration = 0
      let availableCount = 0
      let reluctantCount = 0
      const availableUsers = []
      const hardUsers = []
      const reluctantUsers = []

      normalized.forEach((resp, i) => {
        const score = resp._slots[slotId] || 0
        const name = resp.nickname || '匿名'
        if (score === 2) {
          hardCount++
          availableCount++
          availableUsers.push(name)
          hardUsers.push(name)
        } else if (score === 1) {
          reluctantCount++
          availableCount++
          availableUsers.push(name)
          reluctantUsers.push(name)
        }
        weightedScore += score
        if (score > 0) {
          preferenceConcentration += score / userTotals[i]
        }
      })

      const totalScore = hardCount * (weightedScore + alpha * preferenceConcentration)
      const ratio = N > 0 ? availableCount / N : 0
      const level = ratio <= 0 ? 0
        : ratio <= 0.2 ? 1
        : ratio <= 0.4 ? 2
        : ratio <= 0.6 ? 3
        : 4

      // 偏好得分归一化（最高=N*2）
      const prefScore = N > 0 ? Math.round(weightedScore / (N * 2) * 100) : 0

      heatmap[slotId] = { count: availableCount, level, score: totalScore, hardCount, reluctantCount, prefScore }
      slotDetails[slotId] = {
        slotId, hardCount, weightedScore, preferenceConcentration,
        totalScore, availableCount, reluctantCount,
        availableUsers, hardUsers, reluctantUsers
      }
    }

    // 排序推荐
    const recommendations = Object.values(slotDetails)
      .filter(s => s.availableCount > 0)
      .sort((a, b) => {
        if (a.hardCount !== b.hardCount) return b.hardCount - a.hardCount
        return b.totalScore - a.totalScore
      })
      .slice(0, 5)
      .map((s, rank) => ({
        ...s,
        rank: rank + 1,
        timeLabel: formatSlotLabel(s.slotId, granularity)
      }))

    // 满意度
    recommendations.forEach(rec => {
      let satNumer = 0
      let satDenom = 0
      normalized.forEach((resp, i) => {
        const score = resp._slots[rec.slotId] || 0
        if (score > 0) {
          satNumer += score
          satDenom += userTotals[i]
        }
      })
      rec.satisfactionRate = satDenom > 0 ? satNumer / satDenom : 0
    })

    // 帕累托最优
    const paretoOptimal = findParetoOptimal(slotDetails)
    const paretoIds = paretoOptimal.map(s => s.slotId)

    // 共识度
    const consensusLevel = recommendations.length > 0 ? recommendations[0].satisfactionRate : 0

    return {
      success: true,
      data: {
        event: eventData,
        responses,
        recommendations,
        summary: {
          participantCount: N,
          totalSlots: allSlotIds.length,
          consensusLevel,
          paretoOptimalSlots: paretoIds
        },
        heatmap,
        bestSlots: recommendations.slice(0, 5).map(r => ({
          slotId: r.slotId,
          count: r.availableCount,
          score: r.totalScore
        }))
      }
    }
  } catch (err) {
    console.error('获取结果失败', err)
    return { success: false, error: err.message || '获取失败' }
  }
}
