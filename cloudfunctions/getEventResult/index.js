// 云函数 - 获取活动统计结果（服务端聚合并脱敏）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const QUERY_PAGE_SIZE = 100

function isValidEventId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128 && !/[\/\\]/.test(value)
}

function isEventCreator(event, openid) {
  return Boolean(event && openid && (event.createdBy === openid || event._openid === openid))
}

function sanitizeEvent(event) {
  return {
    _id: event._id,
    name: event.name,
    startDate: event.startDate,
    endDate: event.endDate,
    granularity: event.granularity,
    expireType: event.expireType,
    expireAt: event.expireAt || null,
    note: event.note || '',
    createdAt: event.createdAt
  }
}

function sanitizeResponse(response) {
  return {
    _id: response._id,
    nickname: response.nickname || '匿名用户',
    slots: Array.isArray(response.slots) ? [...new Set(response.slots)] : [],
    createdAt: response.createdAt,
    updatedAt: response.updatedAt
  }
}

function responseTimestamp(response) {
  const value = response.updatedAt || response.createdAt || 0
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function dedupeResponses(responses) {
  const byIdentity = new Map()
  for (const response of responses) {
    const key = response._openid ? `openid:${response._openid}` : `document:${response._id}`
    const current = byIdentity.get(key)
    if (!current || responseTimestamp(response) >= responseTimestamp(current)) {
      byIdentity.set(key, response)
    }
  }
  return [...byIdentity.values()]
}

function aggregateResponses(responses) {
  const slotStats = {}
  for (const response of responses) {
    const uniqueSlots = new Set(Array.isArray(response.slots) ? response.slots : [])
    for (const slotId of uniqueSlots) slotStats[slotId] = (slotStats[slotId] || 0) + 1
  }
  const bestSlots = Object.entries(slotStats)
    .map(([slotId, count]) => ({ slotId, count }))
    .sort((a, b) => b.count - a.count || a.slotId.localeCompare(b.slotId))
    .slice(0, 5)
  return { slotStats, bestSlots }
}

async function fetchAllResponses(eventId) {
  const rows = []
  let skip = 0
  while (true) {
    const result = await db.collection('responses')
      .where({ eventId })
      .skip(skip)
      .limit(QUERY_PAGE_SIZE)
      .get()
    const page = result.data || []
    rows.push(...page)
    if (page.length < QUERY_PAGE_SIZE) break
    skip += page.length
  }
  return rows
}

exports.main = async (event = {}) => {
  const { eventId } = event
  if (!isValidEventId(eventId)) return { success: false, error: '活动ID无效' }

  try {
    const eventRes = await db.collection('events').doc(eventId).get()
    if (!eventRes.data) return { success: false, error: '活动不存在' }

    const rawResponses = dedupeResponses(await fetchAllResponses(eventId))
    const openid = cloud.getWXContext().OPENID
    const myRawResponse = rawResponses.find(response => response._openid === openid)
    const responses = rawResponses.map(sanitizeResponse)
    const { slotStats, bestSlots } = aggregateResponses(responses)

    return {
      success: true,
      data: {
        event: sanitizeEvent(eventRes.data),
        responses,
        slotStats,
        bestSlots,
        participantCount: responses.length,
        isCreator: isEventCreator(eventRes.data, openid),
        myResponse: myRawResponse ? sanitizeResponse(myRawResponse) : null
      }
    }
  } catch (err) {
    console.error('获取结果失败', err)
    return { success: false, error: err.message || '获取失败' }
  }
}

exports._test = {
  isValidEventId,
  isEventCreator,
  sanitizeEvent,
  sanitizeResponse,
  dedupeResponses,
  aggregateResponses
}
