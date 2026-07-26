// 云函数 - 提交时间选择
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})_(\d+)$/
const VALID_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SLOT_RULES = {
  hour: { count: 24, durationMinutes: 60 },
  twoHours: { count: 12, durationMinutes: 120 },
  halfDay: { count: 4, durationMinutes: 360 }
}
const TEMPLATE_NEW_PARTICIPANT = 'your_template_id_new_participant'

function isValidEventId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128 && !/[\/\\]/.test(value)
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !VALID_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function normalizeNickname(value) {
  const nickname = typeof value === 'string' ? value.trim() : ''
  if (nickname.length > 20) return { ok: false, error: '昵称不能超过20个字符' }
  return { ok: true, value: nickname || '匿名用户' }
}

function getResponseDocumentId(eventId, openid) {
  return crypto.createHash('sha256').update(`${eventId}\0${openid}`).digest('hex')
}

function normalizeDailyTimeWindow(eventData) {
  const rule = SLOT_RULES[eventData?.granularity]
  if (!rule) return null
  if (eventData.dailyTimeWindow === undefined) return { startMinute: 0, endMinute: 1440 }
  const window = eventData.dailyTimeWindow
  if (
    !window ||
    typeof window !== 'object' ||
    Array.isArray(window) ||
    !Number.isInteger(window.startMinute) ||
    !Number.isInteger(window.endMinute) ||
    window.startMinute < 0 ||
    window.endMinute > 1440 ||
    window.startMinute >= window.endMinute ||
    window.startMinute % rule.durationMinutes !== 0 ||
    window.endMinute % rule.durationMinutes !== 0
  ) {
    return null
  }
  return { startMinute: window.startMinute, endMinute: window.endMinute }
}

async function persistResponse({
  responseId,
  responseData,
  existing,
  collection = db.collection('responses'),
  serverDate = () => db.serverDate()
}) {
  const existingCreatedAt = existing.find(item => item._id === responseId)?.createdAt || existing[0]?.createdAt
  const document = {
    ...responseData,
    createdAt: existingCreatedAt || serverDate()
  }

  let action = 'updated'
  if (existing.length > 0) {
    await collection.doc(responseId).set({ data: document })
  } else {
    try {
      await collection.add({ data: { _id: responseId, ...document } })
      action = 'created'
    } catch (addError) {
      // 并发首次提交时只有一个 add 能创建确定性 ID；其余请求转为更新。
      try {
        await collection.doc(responseId).get()
      } catch (getError) {
        throw addError
      }
      await collection.doc(responseId).update({ data: responseData })
    }
  }

  await Promise.all(existing
    .filter(item => item._id !== responseId)
    .map(item => collection.doc(item._id).remove()))
  return action
}

function truncate(value, maxLength) {
  const text = String(value || '')
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

async function notifyCreator({ eventId, creatorOpenId, participantName, eventName }) {
  if (!creatorOpenId || TEMPLATE_NEW_PARTICIPANT.startsWith('your_template_id')) return
  const now = new Date()
  const result = await cloud.openapi.subscribeMessage.send({
    touser: creatorOpenId,
    templateId: TEMPLATE_NEW_PARTICIPANT,
    page: `/pages/result/result?id=${eventId}`,
    data: {
      thing1: { value: truncate(participantName || '有人', 20) },
      thing2: { value: truncate(eventName || '聚会', 20) },
      time3: { value: `${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` }
    }
  })
  try {
    await db.collection('notification_logs').add({
      data: {
        eventId,
        type: 'new_participant',
        toOpenId: creatorOpenId,
        status: result.errcode === 0 ? 'sent' : (result.errcode === 43101 ? 'not_subscribed' : 'failed'),
        content: { eventName, participantName },
        createdAt: db.serverDate()
      }
    })
  } catch (logError) {
    console.warn('[submitResponse] 记录通知日志失败', logError)
  }
}

function validateSubmission(eventData, submittedSlots, now = new Date()) {
  if (!eventData || !isValidDateOnly(eventData.startDate) || !isValidDateOnly(eventData.endDate)) {
    return { ok: false, error: '活动日期配置无效' }
  }

  const rule = SLOT_RULES[eventData.granularity]
  if (!rule) return { ok: false, error: '活动时段粒度无效' }
  const dailyTimeWindow = normalizeDailyTimeWindow(eventData)
  if (!dailyTimeWindow) return { ok: false, error: '活动每日可选时段配置无效' }
  if (eventData.expireAt) {
    const expireAt = new Date(eventData.expireAt)
    if (Number.isNaN(expireAt.getTime())) return { ok: false, error: '活动过期时间无效' }
    if (now > expireAt) return { ok: false, error: '活动已过期' }
  }

  if (!Array.isArray(submittedSlots) || submittedSlots.length === 0) {
    return { ok: false, error: '请至少选择一个时段' }
  }

  const uniqueSlots = [...new Set(submittedSlots)]
  const startTimestamp = Date.parse(`${eventData.startDate}T00:00:00Z`)
  const endTimestamp = Date.parse(`${eventData.endDate}T00:00:00Z`)
  const dailySlotCount = (dailyTimeWindow.endMinute - dailyTimeWindow.startMinute) / rule.durationMinutes
  const maxSlots = ((endTimestamp - startTimestamp) / 86400000 + 1) * dailySlotCount
  if (uniqueSlots.length > maxSlots) return { ok: false, error: '选择的时段数量超出活动范围' }

  for (const slotId of uniqueSlots) {
    if (typeof slotId !== 'string') return { ok: false, error: '时段格式无效' }
    const match = DATE_PATTERN.exec(slotId)
    if (!match || !isValidDateOnly(match[1])) return { ok: false, error: `时段格式无效：${slotId}` }
    const slotDate = match[1]
    const slotIndex = Number(match[2])
    if (slotDate < eventData.startDate || slotDate > eventData.endDate) {
      return { ok: false, error: `时段日期超出活动范围：${slotId}` }
    }
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= rule.count) {
      return { ok: false, error: `时段索引超出范围：${slotId}` }
    }
    const slotStartMinute = slotIndex * rule.durationMinutes
    const slotEndMinute = slotStartMinute + rule.durationMinutes
    if (slotStartMinute < dailyTimeWindow.startMinute || slotEndMinute > dailyTimeWindow.endMinute) {
      return { ok: false, error: `时段超出每日可选范围：${slotId}` }
    }
  }

  return { ok: true, slots: uniqueSlots }
}

exports.main = async (event = {}) => {
  const { eventId, nickname, slots } = event
  if (!isValidEventId(eventId)) return { success: false, error: '活动ID无效' }

  const nicknameResult = normalizeNickname(nickname)
  if (!nicknameResult.ok) return { success: false, error: nicknameResult.error }

  const openid = cloud.getWXContext().OPENID
  if (!openid) return { success: false, error: '无法识别当前用户' }

  try {
    const eventRes = await db.collection('events').doc(eventId).get()
    if (!eventRes.data) return { success: false, error: '活动不存在' }

    const validation = validateSubmission(eventRes.data, slots)
    if (!validation.ok) return { success: false, error: validation.error }

    const existingRes = await db.collection('responses')
      .where({ eventId, _openid: openid })
      .get()
    const existing = existingRes.data || []
    const responseData = {
      eventId,
      _openid: openid,
      nickname: nicknameResult.value,
      slots: validation.slots,
      updatedAt: db.serverDate()
    }

    const responseId = getResponseDocumentId(eventId, openid)
    const action = await persistResponse({ responseId, responseData, existing })

    try {
      const creatorOpenId = eventRes.data.createdBy || eventRes.data._openid
      if (action === 'created' && creatorOpenId && creatorOpenId !== openid) {
        await notifyCreator({
          eventId,
          creatorOpenId,
          participantName: nicknameResult.value,
          eventName: eventRes.data.name || '聚会'
        })
      }
    } catch (notifyErr) {
      console.warn('[submitResponse] 通知创建者失败', notifyErr)
    }

    return { success: true, action, selectedCount: validation.slots.length }
  } catch (err) {
    console.error('提交失败', err)
    return { success: false, error: err.message || '提交失败' }
  }
}

exports._test = {
  isValidEventId,
  isValidDateOnly,
  normalizeNickname,
  getResponseDocumentId,
  persistResponse,
  truncate,
  normalizeDailyTimeWindow,
  validateSubmission
}
