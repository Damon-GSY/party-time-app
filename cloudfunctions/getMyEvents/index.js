// 云函数 - 获取用户创建或参与的活动列表
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const QUERY_PAGE_SIZE = 100

function normalizePagination(event = {}) {
  const rawLimit = Number(event.limit)
  const rawSkip = Number(event.skip)
  return {
    limit: Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20,
    skip: Number.isInteger(rawSkip) ? Math.max(rawSkip, 0) : 0
  }
}

function eventTimestamp(value) {
  const timestamp = new Date(value || 0).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function mergeEvents(createdEvents, joinedEvents, openid) {
  const eventMap = new Map()
  for (const event of [...createdEvents, ...joinedEvents]) {
    if (!event || !event._id) continue
    const owned = event.createdBy === openid || event._openid === openid
    const next = { ...event, type: owned ? 'created' : 'joined' }
    const current = eventMap.get(event._id)
    if (!current || next.type === 'created') eventMap.set(event._id, next)
  }
  return [...eventMap.values()].sort((a, b) => eventTimestamp(b.createdAt) - eventTimestamp(a.createdAt))
}

function toListEvent(event, participantCount) {
  return {
    _id: event._id,
    name: event.name,
    startDate: event.startDate,
    endDate: event.endDate,
    granularity: event.granularity,
    expireType: event.expireType,
    expireAt: event.expireAt || null,
    note: event.note || '',
    createdAt: event.createdAt,
    type: event.type,
    participantCount
  }
}

async function fetchAll(collectionName, where, fields) {
  const rows = []
  let skip = 0
  while (true) {
    let query = db.collection(collectionName).where(where).skip(skip).limit(QUERY_PAGE_SIZE)
    if (fields) query = query.field(fields)
    const result = await query.get()
    const page = result.data || []
    rows.push(...page)
    if (page.length < QUERY_PAGE_SIZE) break
    skip += page.length
  }
  return rows
}

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID
  if (!openid) return { success: false, error: '无法识别当前用户' }
  const { limit, skip } = normalizePagination(event)

  try {
    const [createdByRows, legacyOpenIdRows, responses] = await Promise.all([
      fetchAll('events', { createdBy: openid }),
      fetchAll('events', { _openid: openid }),
      fetchAll('responses', { _openid: openid }, { eventId: true })
    ])

    const joinedEventIds = [...new Set(responses.map(item => item.eventId).filter(Boolean))]
    let joinedEvents = []
    for (let index = 0; index < joinedEventIds.length; index += 10) {
      const batchIds = joinedEventIds.slice(index, index + 10)
      const result = await db.collection('events').where({ _id: _.in(batchIds) }).get()
      joinedEvents.push(...(result.data || []))
    }

    const merged = mergeEvents([...createdByRows, ...legacyOpenIdRows], joinedEvents, openid)
    const page = merged.slice(skip, skip + limit)
    const events = await Promise.all(page.map(async item => {
      const countResult = await db.collection('responses').where({ eventId: item._id }).count()
      return toListEvent(item, countResult.total || 0)
    }))

    return {
      success: true,
      data: events,
      pagination: { limit, skip, total: merged.length, hasMore: skip + events.length < merged.length }
    }
  } catch (err) {
    console.error('获取活动列表失败', err)
    return { success: false, error: err.message || '获取活动列表失败' }
  }
}

exports._test = {
  normalizePagination,
  mergeEvents,
  toListEvent
}
