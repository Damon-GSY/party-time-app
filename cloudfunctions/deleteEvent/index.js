// 云函数 - 删除聚会活动（带服务端权限校验）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function isValidEventId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128 && !/[\/\\]/.test(value)
}

function isEventCreator(event, openid) {
  return Boolean(event && openid && (event.createdBy === openid || event._openid === openid))
}

exports.main = async (event = {}) => {
  const { eventId } = event
  const openid = cloud.getWXContext().OPENID
  if (!isValidEventId(eventId)) return { success: false, error: '活动ID无效' }
  if (!openid) return { success: false, error: '无法识别当前用户' }

  try {
    const eventRes = await db.collection('events').doc(eventId).get()
    if (!eventRes.data) return { success: false, error: '活动不存在' }
    if (!isEventCreator(eventRes.data, openid)) return { success: false, error: '无权删除此活动' }

    await db.collection('events').doc(eventId).remove()
    const responsesResult = await db.collection('responses').where({ eventId }).remove()
    return {
      success: true,
      removedResponses: responsesResult.stats ? responsesResult.stats.removed : undefined
    }
  } catch (err) {
    console.error('删除活动失败', err)
    return { success: false, error: err.message || '删除失败' }
  }
}

exports._test = { isValidEventId, isEventCreator }
