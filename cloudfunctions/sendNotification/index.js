// 云函数 - 由活动创建者发送服务端计算后的结果通知
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const QUERY_PAGE_SIZE = 100
const TEMPLATE_RESULT_READY = 'your_template_id_result_ready'
const SLOT_RULES = {
  hour: { count: 24, hoursPerSlot: 1 },
  twoHours: { count: 12, hoursPerSlot: 2 },
  halfDay: { count: 4, hoursPerSlot: 6, periods: ['深夜', '上午', '下午', '晚上'] }
}

function isValidEventId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128 && !/[\/\\]/.test(value)
}

function truncate(value, maxLength) {
  const text = String(value || '')
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function formatNow() {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  return `${month}月${day}日 ${hour}:${minute}`
}

function isEventCreator(eventData, openid) {
  return Boolean(eventData && openid && (eventData.createdBy === openid || eventData._openid === openid))
}

function dedupeResponses(responses) {
  const byOpenId = new Map()
  for (const response of responses) {
    if (!response?._openid) continue
    const current = byOpenId.get(response._openid)
    const nextTime = new Date(response.updatedAt || response.createdAt || 0).getTime() || 0
    const currentTime = new Date(current?.updatedAt || current?.createdAt || 0).getTime() || 0
    if (!current || nextTime >= currentTime) byOpenId.set(response._openid, response)
  }
  return [...byOpenId.values()]
}

function normalizeDailyTimeWindow(eventData, rule) {
  if (eventData.dailyTimeWindow === undefined) return { startMinute: 0, endMinute: 1440 }
  const window = eventData.dailyTimeWindow
  if (
    !window ||
    typeof window !== 'object' ||
    !Number.isInteger(window.startMinute) ||
    !Number.isInteger(window.endMinute) ||
    window.startMinute < 0 ||
    window.endMinute > 1440 ||
    window.startMinute >= window.endMinute ||
    window.startMinute % (rule.hoursPerSlot * 60) !== 0 ||
    window.endMinute % (rule.hoursPerSlot * 60) !== 0
  ) {
    return null
  }
  return window
}

function calculateBestTime(eventData, responses) {
  const rule = SLOT_RULES[eventData?.granularity]
  if (!rule) return ''
  const dailyTimeWindow = normalizeDailyTimeWindow(eventData, rule)
  if (!dailyTimeWindow) return ''

  const counts = new Map()
  for (const response of dedupeResponses(responses)) {
    for (const slotId of new Set(Array.isArray(response.slots) ? response.slots : [])) {
      const match = /^(\d{4}-\d{2}-\d{2})_(\d+)$/.exec(slotId)
      if (
        !match ||
        (eventData.startDate && match[1] < eventData.startDate) ||
        (eventData.endDate && match[1] > eventData.endDate)
      ) continue
      const slotIndex = Number(match[2])
      const slotStartMinute = slotIndex * rule.hoursPerSlot * 60
      if (
        !Number.isInteger(slotIndex) ||
        slotIndex < 0 ||
        slotIndex >= rule.count ||
        slotStartMinute < dailyTimeWindow.startMinute ||
        slotStartMinute + rule.hoursPerSlot * 60 > dailyTimeWindow.endMinute
      ) continue
      counts.set(slotId, (counts.get(slotId) || 0) + 1)
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  if (!best) return ''

  const match = /^(\d{4}-\d{2}-\d{2})_(\d+)$/.exec(best[0])
  if (!match) return ''
  const slotIndex = Number(match[2])
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= rule.count) return ''

  const date = new Date(`${match[1]}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  const startHour = slotIndex * rule.hoursPerSlot
  const endHour = startHour + rule.hoursPerSlot
  const range = `${String(startHour).padStart(2, '0')}:00-${String(endHour).padStart(2, '0')}:00`
  const period = rule.periods ? `${rule.periods[slotIndex]} ` : ''
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${weekdays[date.getUTCDay()]} · ${period}${range}`
}

async function fetchAllResponses(eventId) {
  const rows = []
  let skip = 0
  while (true) {
    const result = await db.collection('responses').where({ eventId }).skip(skip).limit(QUERY_PAGE_SIZE).get()
    const page = result.data || []
    rows.push(...page)
    if (page.length < QUERY_PAGE_SIZE) break
    skip += page.length
  }
  return rows
}

async function sendOne({ eventId, toOpenId, eventName, bestTime }) {
  const result = await cloud.openapi.subscribeMessage.send({
    touser: toOpenId,
    templateId: TEMPLATE_RESULT_READY,
    page: `/pages/result/result?id=${eventId}`,
    data: {
      thing1: { value: truncate(eventName || '聚会', 20) },
      thing2: { value: truncate(bestTime, 20) },
      thing3: { value: formatNow() }
    }
  })

  if (result.errcode === 0 || result.errcode === 43101) {
    try {
      await db.collection('notification_logs').add({
        data: {
          eventId,
          type: 'result_ready',
          toOpenId,
          status: result.errcode === 0 ? 'sent' : 'not_subscribed',
          content: { eventName, bestTime },
          createdAt: db.serverDate()
        }
      })
    } catch (logError) {
      console.warn('[sendNotification] 记录通知日志失败', logError)
    }
  }

  return result.errcode === 0
}

exports.main = async (event = {}) => {
  const { eventId, type, broadcast } = event
  if (!isValidEventId(eventId) || type !== 'result_ready' || broadcast !== true) {
    return { success: false, error: '只支持创建者发送结果通知' }
  }

  try {
    const openid = cloud.getWXContext().OPENID
    const eventResult = await db.collection('events').doc(eventId).get()
    const eventData = eventResult.data
    if (!eventData) return { success: false, error: '活动不存在' }
    if (!isEventCreator(eventData, openid)) return { success: false, error: '只有创建者可以通知参与者' }
    if (TEMPLATE_RESULT_READY.startsWith('your_template_id')) return { success: false, error: '消息模板尚未配置' }

    const responses = await fetchAllResponses(eventId)
    const bestTime = calculateBestTime(eventData, responses)
    if (!bestTime) return { success: false, error: '还没有可通知的最佳时间' }
    const recipients = [...new Set(responses.map(response => response._openid).filter(target => target && target !== openid))]

    let successCount = 0
    let failCount = 0
    for (const recipient of recipients) {
      const sent = await sendOne({
        eventId,
        toOpenId: recipient,
        eventName: eventData.name || '聚会',
        bestTime
      })
      if (sent) successCount++
      else failCount++
    }
    return { success: true, successCount, failCount, bestTime }
  } catch (error) {
    console.error('[sendNotification] 异常', error)
    return { success: false, error: error.message || '发送失败' }
  }
}

exports._test = {
  isValidEventId,
  truncate,
  isEventCreator,
  dedupeResponses,
  normalizeDailyTimeWindow,
  calculateBestTime
}
