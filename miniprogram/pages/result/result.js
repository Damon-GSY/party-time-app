const util = require('../../utils/util')
const notificationUtil = require('../../utils/notification')
const { animateNumber } = require('../../utils/ui-effects')
const app = getApp()

// 偏好归一化：旧格式 slots 数组 → 全部视为有空=2分
function normalizeSlots(slots) {
  if (Array.isArray(slots)) {
    const result = {}
    slots.forEach(id => { result[id] = 2 })
    return result
  }
  return slots || {}
}

Page({
  data: {
    eventId: '',
    event: null,
    loading: true,
    expired: false,
    isCreator: false,
    justCreated: false,

    dateRangeText: '',
    expireText: '',
    participantCount: 0,

    dates: [], // [{ date, weekday, day, slots: [{timeSlot, count, level, prefScore, hardCount, reluctantCount, slotId}] }]
    timeLabels: [],
    granularity: 'twoHours',
    slotsPerDay: 12,

    // 推荐数据
    topRecommendations: [], // Top 3
    bestSlot: { timeText: '', count: 0, percent: '' },

    // 共识度
    consensusLevel: 0, // 0-1
    consensusPercent: 0,
    consensusLabel: '',
    consensusColor: '',
    displayConsensus: 0,

    // 帕累托最优
    paretoSlotIds: [],

    participants: [],
    legendSteps: [],

    displayParticipantCount: 0,
    displayBestCount: 0,

    showSlotModal: false,
    selectedSlotInfo: { dateText: '', timeText: '', count: 0, prefScore: 0, hardUsers: [], reluctantUsers: [], unavailableUsers: [] },
    notifying: false,
    subscribeRequested: false,
    deleting: false
  },

  onLoad(options) {
    const { id, created } = options
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    this.setData({
      eventId: id,
      isCreator: created === '1',
      justCreated: created === '1'
    })
    this.loadResult(id)
  },

  async loadResult(eventId) {
    try {
      if (wx.cloud) {
        const db = wx.cloud.database()
        const eventRes = await db.collection('events').doc(eventId).get()
        if (!eventRes.data) throw new Error('活动不存在')
        const event = eventRes.data
        const expired = util.isExpired(event.expireAt)
        // 分页查询：db.get() 默认最多返回 20 条
        const MAX_LIMIT = 100
        const countRes = await db.collection('responses').where({ eventId }).count()
        const total = countRes.total
        const batchTimes = Math.ceil(total / MAX_LIMIT)
        const responses = []
        for (let i = 0; i < batchTimes; i++) {
          const res = await db.collection('responses').where({ eventId })
            .skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
          responses.push(...res.data)
        }
        this.processData(event, responses, expired)
      } else {
        this.loadMockData()
      }
    } catch (err) {
      this.loadMockData()
    }
  },

  loadMockData() {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const event = {
      _id: 'demo123',
      name: '周末聚餐',
      startDate: fmt(today),
      endDate: fmt(tomorrow),
      granularity: 'twoHours',
      note: '地点待定'
    }

    const responses = [
      { _id: 'r1', nickname: '小明', slots: [`${fmt(today)}_3`, `${fmt(today)}_4`, `${fmt(tomorrow)}_2`], createdAt: new Date().toISOString() },
      { _id: 'r2', nickname: '小红', slots: [`${fmt(today)}_3`, `${fmt(today)}_5`, `${fmt(tomorrow)}_3`], createdAt: new Date().toISOString() },
      { _id: 'r3', nickname: '小李', slots: [`${fmt(today)}_4`, `${fmt(tomorrow)}_2`, `${fmt(tomorrow)}_3`], createdAt: new Date().toISOString() }
    ]

    this.processData(event, responses, false)
  },

  processData(event, responses, expired) {
    const granularity = event.granularity || 'twoHours'
    let slotsPerDay = 12
    let timeLabels = []

    if (granularity === 'hour') {
      slotsPerDay = 24
      for (let i = 0; i < 24; i += 1) timeLabels.push(String(i))
    } else if (granularity === 'twoHours') {
      slotsPerDay = 12
      for (let i = 0; i < 24; i += 2) timeLabels.push(String(i))
    } else if (granularity === 'halfDay') {
      slotsPerDay = 4
      timeLabels = ['上午', '下午', '晚上', '深夜']
    }

    const N = responses.length

    // ===== 偏好加权聚合 =====
    const normalized = responses.map(resp => ({
      ...resp,
      _slots: normalizeSlots(resp.slots)
    }))

    const userTotals = normalized.map(resp =>
      Math.max(Object.values(resp._slots).reduce((s, v) => s + v, 0), 1)
    )

    const alpha = 0.5
    const slotDetails = {}
    const allSlotIds = []

    // 生成所有 slotId
    const startD = new Date(event.startDate)
    const endD = new Date(event.endDate)
    while (startD <= endD) {
      const dateStr = this.formatDate(startD)
      for (let i = 0; i < slotsPerDay; i++) {
        allSlotIds.push(`${dateStr}_${i}`)
      }
      startD.setDate(startD.getDate() + 1)
    }

    // 计算每个时段
    for (const slotId of allSlotIds) {
      let hardCount = 0
      let weightedScore = 0
      let prefConcentration = 0
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
          reluctantUsers.push(name)
        }
        weightedScore += score
        if (score > 0) {
          prefConcentration += score / userTotals[i]
        }
      })

      const totalScore = hardCount * (weightedScore + alpha * prefConcentration)
      const prefScore = N > 0 ? Math.round(weightedScore / (N * 2) * 100) : 0

      slotDetails[slotId] = {
        slotId, hardCount, weightedScore, totalScore, availableCount, reluctantCount, prefScore,
        availableUsers, hardUsers, reluctantUsers
      }
    }

    // 排序推荐
    const sorted = Object.values(slotDetails)
      .filter(s => s.availableCount > 0)
      .sort((a, b) => {
        if (a.hardCount !== b.hardCount) return b.hardCount - a.hardCount
        return b.totalScore - a.totalScore
      })

    // 满意度计算
    const recommendations = sorted.slice(0, 5).map((s, rank) => {
      let satNumer = 0
      let satDenom = 0
      normalized.forEach((resp, i) => {
        const score = resp._slots[s.slotId] || 0
        if (score > 0) {
          satNumer += score
          satDenom += userTotals[i]
        }
      })
      const satisfactionRate = satDenom > 0 ? satNumer / satDenom : 0
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      const [date, hour] = s.slotId.split('_')
      const d = new Date(date)
      const dateText = `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`
      const timeText = `${dateText} ${util.formatTimeSlot(parseInt(hour), granularity)}`
      return {
        ...s,
        rank: rank + 1,
        timeLabel: timeText,
        satisfactionRate,
        satisfactionPercent: Math.round(satisfactionRate * 100)
      }
    })

    // 帕累托最优
    const paretoSlotIds = this.findParetoOptimal(slotDetails)

    // 标记帕累托
    recommendations.forEach(r => {
      r.isPareto = paretoSlotIds.indexOf(r.slotId) >= 0
    })

    // Top 3 推荐
    const topRecommendations = recommendations.slice(0, 3)

    // 共识度 = 最佳时段满意度
    const consensusLevel = recommendations.length > 0 ? recommendations[0].satisfactionRate : 0
    const consensusPercent = Math.round(consensusLevel * 100)
    let consensusLabel = '低共识'
    let consensusColor = '#f87171'
    if (consensusLevel > 0.8) {
      consensusLabel = '高共识'
      consensusColor = '#4ade80'
    } else if (consensusLevel >= 0.5) {
      consensusLabel = '中等共识'
      consensusColor = '#fbbf24'
    }

    // 最佳时段（兼容旧引用）
    let bestSlot = { timeText: '', count: 0, percent: '', slotId: '' }
    if (recommendations.length > 0) {
      bestSlot = {
        timeText: recommendations[0].timeLabel,
        count: recommendations[0].availableCount,
        percent: consensusPercent,
        slotId: recommendations[0].slotId
      }
    }

    // 热力图数据
    const slotHeatData = {}
    for (const [slotId, detail] of Object.entries(slotDetails)) {
      const ratio = N > 0 ? detail.availableCount / N : 0
      const level = ratio <= 0 ? 0
        : ratio <= 0.2 ? 1
        : ratio <= 0.4 ? 2
        : ratio <= 0.6 ? 3
        : 4
      slotHeatData[slotId] = { ...detail, level }
    }

    // 生成日期列表
    const dates = this.generateDatesWithHeatmap(event.startDate, event.endDate, slotHeatData, slotsPerDay, paretoSlotIds)

    // 参与者列表
    const participants = responses.map(r => {
      const nickname = r.nickname || '匿名'
      const displayName = (r.nickname && r.nickname.trim() !== '') ? r.nickname : '匿名用户'
      const avatarColor = util.getAvatarColor(displayName)
      return {
        ...r,
        nickname: displayName,
        slotCount: (r.slots || r.availableSlots || []).length,
        avatarColor
      }
    })

    // 格式化显示
    const startDate = util.formatDateShort(event.startDate)
    const endDate = util.formatDateShort(event.endDate)
    const dateRangeText = startDate === endDate
      ? startDate
      : `${startDate.split(' ')[0]} ~ ${endDate.split(' ')[0]}`

    event.dateRangeText = dateRangeText
    event.expireText = util.formatExpireTime(event.expireAt)
    event.expired = expired

    // 新图例（偏好得分渐变）
    const legendSteps = [
      { value: '0%', color: '#1a1a2e' },
      { value: '25%', color: '#1e3a5f' },
      { value: '50%', color: '#2d6a4f' },
      { value: '75%', color: '#fbbf24' },
      { value: '100%', color: '#e94560' }
    ]

    this.setData({
      event,
      dates,
      granularity,
      slotsPerDay,
      timeLabels,
      bestSlot,
      topRecommendations,
      consensusLevel,
      consensusPercent,
      consensusLabel,
      consensusColor,
      paretoSlotIds,
      participants,
      participantCount: N,
      legendSteps,
      loading: false
    })

    // 保存详情到实例属性，避免 setData 传输大量数据
    this._slotDetails = slotDetails
    this._allNicknames = normalized.map(r => r.nickname || '匿名')

    // 动画
    animateNumber(this, 'displayParticipantCount', N, 1000)
    if (bestSlot.count > 0) {
      setTimeout(() => animateNumber(this, 'displayBestCount', bestSlot.count, 800), 300)
    }
    setTimeout(() => animateNumber(this, 'displayConsensus', consensusPercent, 800), 500)

    if (this.data.justCreated && N <= 1) {
      this.showSubscribeGuide()
    }
  },

  // 帕累托最优
  findParetoOptimal(slotDetails) {
    const candidates = Object.values(slotDetails).filter(s => s.availableCount > 0)
    const pareto = candidates.filter(s => {
      return !candidates.some(other =>
        other.slotId !== s.slotId &&
        other.hardCount >= s.hardCount &&
        other.weightedScore >= s.weightedScore &&
        (other.hardCount > s.hardCount || other.weightedScore > s.weightedScore)
      )
    })
    return pareto.map(s => s.slotId)
  },

  generateDatesWithHeatmap(startDate, endDate, slotHeatData, slotsPerDay, paretoSlotIds) {
    const dates = []
    const start = new Date(startDate)
    const end = new Date(endDate)
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const _pareto = paretoSlotIds || []

    while (start <= end) {
      const dateStr = this.formatDate(start)
      const slots = []

      for (let i = 0; i < slotsPerDay; i++) {
        const slotId = `${dateStr}_${i}`
        const heat = slotHeatData[slotId] || { availableCount: 0, level: 0, prefScore: 0, hardCount: 0, reluctantCount: 0 }
        slots.push({
          timeSlot: i,
          count: heat.availableCount || 0,
          level: heat.level || 0,
          prefScore: heat.prefScore || 0,
          hardCount: heat.hardCount || 0,
          reluctantCount: heat.reluctantCount || 0,
          slotId,
          date: dateStr,
          isPareto: _pareto.indexOf(slotId) >= 0
        })
      }

      dates.push({
        date: dateStr,
        weekday: weekDays[start.getDay()],
        day: start.getDate(),
        slots
      })
      start.setDate(start.getDate() + 1)
    }

    return dates
  },

  formatDate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  formatSubmitTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    return `${Math.floor(diff / 86400000)}天前`
  },

  // 显示时段详情（偏好版）
  showSlotDetail(e) {
    const { slotId } = e.currentTarget.dataset
    if (!slotId) return

    const detail = this._slotDetails && this._slotDetails[slotId]
    if (!detail) return

    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const [date, hour] = slotId.split('_')
    const d = new Date(date)
    const dateText = `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`
    const timeText = util.formatTimeSlot(parseInt(hour), this.data.granularity)

    // 计算不方便的人
    const allNicknames = this._allNicknames || []
    const availableSet = new Set(detail.availableUsers || [])
    const unavailableUsers = allNicknames.filter(n => !availableSet.has(n))

    this.setData({
      showSlotModal: true,
      selectedSlotInfo: {
        slotId,
        dateText,
        timeText,
        count: detail.availableCount,
        prefScore: detail.prefScore,
        hardUsers: detail.hardUsers || [],
        reluctantUsers: detail.reluctantUsers || [],
        unavailableUsers
      }
    })
  },

  closeSlotModal() {
    this.setData({ showSlotModal: false })
  },

  preventMove() {},

  editEvent() {
    wx.showToast({ title: '功能开发中', icon: 'none' })
  },

  async deleteEvent() {
    if (this.data.deleting) return
    const res = await wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？'
    })
    if (!res.confirm) return

    this.setData({ deleting: true })
    wx.showLoading({ title: '删除中...' })

    try {
      if (wx.cloud) {
        const db = wx.cloud.database()
        await db.collection('events').doc(this.data.eventId).remove()
        await db.collection('responses').where({ eventId: this.data.eventId }).remove()
      }
      wx.hideLoading()
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      wx.hideLoading()
      this.setData({ deleting: false })
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  goToVote() {
    wx.navigateTo({ url: `/pages/vote/vote?id=${this.data.eventId}` })
  },

  async notifyParticipants() {
    const { eventId, event, bestSlot, participants, notifying } = this.data
    if (notifying) return

    const res = await wx.showModal({
      title: '通知参与者',
      content: `将通知 ${participants.length} 位参与者：最佳时间为 ${bestSlot.timeText}`,
      confirmText: '发送通知',
      confirmColor: '#e94560'
    })
    if (!res.confirm) return

    this.setData({ notifying: true })
    wx.showLoading({ title: '发送中...' })

    try {
      if (!wx.cloud) throw new Error('云开发未初始化')
      const db = wx.cloud.database()
      const responsesRes = await db.collection('responses').where({ eventId }).get()
      const responses = responsesRes.data || []
      let successCount = 0
      let failCount = 0

      for (const response of responses) {
        if (response._openid === app.globalData.openId) continue
        try {
          const sendResult = await wx.cloud.callFunction({
            name: 'sendNotification',
            data: {
              type: 'result_ready',
              eventId,
              toOpenId: response._openid,
              data: {
                eventName: event?.name || '聚会',
                bestTime: bestSlot.timeText || '查看详情'
              }
            }
          })
          if (sendResult.result && sendResult.result.success) successCount++
          else failCount++
        } catch (e) { failCount++ }
      }

      wx.hideLoading()
      wx.showToast({ title: `通知已发送（成功${successCount}，失败${failCount}）`, icon: 'none', duration: 3000 })
      notificationUtil.saveLocalNotification('result_ready', {
        eventName: event?.name || '聚会',
        bestTime: bestSlot.timeText
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '发送失败', icon: 'none' })
    } finally {
      this.setData({ notifying: false })
    }
  },

  goToPoster() {
    wx.navigateTo({ url: `/pages/poster/poster?id=${this.data.eventId}` })
  },

  onShareAppMessage() {
    const { event, participantCount } = this.data
    return {
      title: `${participantCount}人正在选「${event?.name || '聚会'}」的时间，来投票吧！`,
      path: `/pages/vote/vote?id=${this.data.eventId}`
    }
  }
})
