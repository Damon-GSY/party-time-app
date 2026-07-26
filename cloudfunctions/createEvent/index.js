// 云函数 - 创建聚会活动
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const VALID_GRANULARITIES = new Set(['hour', 'twoHours', 'halfDay'])
const VALID_EXPIRE_TYPES = new Set(['24h', '3days', '7days', 'never'])

function parseDateOnly(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }
  return timestamp
}

function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function validateCreateInput(input, now = new Date()) {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  const startDate = input.startDate
  const endDate = input.endDate
  const granularity = input.granularity || 'twoHours'
  const expireType = input.expireType || '7days'

  if (!name || !startDate || !endDate) {
    return { ok: false, error: '缺少必填参数' }
  }
  if (name.length > 30) return { ok: false, error: '聚会名称不能超过30个字符' }
  if (note.length > 200) return { ok: false, error: '备注不能超过200个字符' }
  if (!VALID_GRANULARITIES.has(granularity)) return { ok: false, error: '无效的时段粒度' }
  if (!VALID_EXPIRE_TYPES.has(expireType)) return { ok: false, error: '无效的过期类型' }

  const startTimestamp = parseDateOnly(startDate)
  const endTimestamp = parseDateOnly(endDate)
  if (startTimestamp === null || endTimestamp === null) {
    return { ok: false, error: '日期格式无效' }
  }
  if (startDate < formatLocalDate(now)) return { ok: false, error: '开始日期不能早于今天' }
  if (endTimestamp < startTimestamp) return { ok: false, error: '结束日期不能早于开始日期' }

  const dayCount = Math.floor((endTimestamp - startTimestamp) / DAY_MS) + 1
  if (dayCount > 31) return { ok: false, error: '日期范围不能超过31天' }

  return {
    ok: true,
    value: { name, note, startDate, endDate, granularity, expireType, dayCount }
  }
}

function calculateExpireAt(expireType, now = new Date()) {
  const durations = {
    '24h': DAY_MS,
    '3days': 3 * DAY_MS,
    '7days': 7 * DAY_MS
  }
  return expireType === 'never' ? null : new Date(now.getTime() + durations[expireType])
}

function buildEventDocument(value, openid, createdAt, now = new Date()) {
  const expireAt = calculateExpireAt(value.expireType, now)
  return {
    name: value.name,
    startDate: value.startDate,
    endDate: value.endDate,
    granularity: value.granularity,
    expireType: value.expireType,
    expireAt: expireAt ? expireAt.toISOString() : null,
    note: value.note,
    createdAt,
    // 云函数写入不会可靠地自动补充 _openid；两个字段并存以兼容旧查询与新权限逻辑。
    createdBy: openid,
    _openid: openid,
    notifications: {
      creatorSubscribed: false,
      lastExpiringReminderAt: null
    }
  }
}

exports.main = async (event = {}) => {
  const validation = validateCreateInput(event)
  if (!validation.ok) return { success: false, error: validation.error }

  try {
    const openid = cloud.getWXContext().OPENID
    if (!openid) return { success: false, error: '无法识别当前用户' }

    const document = buildEventDocument(validation.value, openid, db.serverDate())
    const result = await db.collection('events').add({ data: document })
    return { success: true, eventId: result._id }
  } catch (err) {
    console.error('创建活动失败', err)
    return { success: false, error: err.message || '创建失败' }
  }
}

exports._test = {
  parseDateOnly,
  validateCreateInput,
  calculateExpireAt,
  buildEventDocument
}
