// 云函数 - 提交时间选择
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { eventId, nickname, slots } = event
  const openid = cloud.getWXContext().OPENID

  if (!openid) {
    return { success: false, error: '未授权' }
  }

  // 参数校验
  if (!eventId || !slots || typeof slots !== 'object' || Array.isArray(slots)) {
    return {
      success: false,
      error: '参数错误'
    }
  }

  // Slots 格式校验：key 为字符串，value 必须为 0/1/2，数量上限 200
  const slotEntries = Object.entries(slots)
  if (slotEntries.length > 200) {
    return { success: false, error: '参数错误' }
  }
  const validScores = new Set([0, 1, 2])
  for (const [key, val] of slotEntries) {
    if (typeof key !== 'string' || key.length > 64 || !validScores.has(val)) {
      return { success: false, error: '参数错误' }
    }
  }

  // 昵称 XSS 过滤：剥离 HTML 标签，截断长度
  const sanitizeName = (raw) => {
    if (typeof raw !== 'string') return ''
    return raw.replace(/<[^>]*>/g, '').trim().slice(0, 20)
  }
  const safeName = sanitizeName(nickname)
  const responseName = safeName || '匿名用户'

  try {
    // 检查活动是否存在且未过期
    const eventRes = await db.collection('events').doc(eventId).get()
    if (!eventRes.data) {
      return {
        success: false,
        error: '活动不存在'
      }
    }

    const eventData = eventRes.data
    // NOTE: 使用本地服务器时间比较，存在与数据库写入时间的时钟偏差风险
    if (eventData.expireAt && new Date() > new Date(eventData.expireAt)) {
      return {
        success: false,
        error: '活动已过期'
      }
    }

    await db.runTransaction(async transaction => {
      const existingRes = await transaction.collection('responses')
        .where({ eventId, _openid: openid })
        .limit(1)
        .get()

      if (existingRes.data && existingRes.data.length > 0) {
        await transaction.collection('responses').doc(existingRes.data[0]._id).update({
          data: {
            nickname: responseName,
            slots,
            updatedAt: db.serverDate()
          }
        })
      } else {
        await transaction.collection('responses').add({
          data: {
            _openid: openid,
            eventId,
            nickname: responseName,
            slots,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })
      }
    })

    // 通知创建者：有人参与了投票
    try {
      const creatorOpenId = eventData._openid
      // 排除自己通知自己
      if (creatorOpenId && creatorOpenId !== openid) {
        await cloud.callFunction({
          name: 'sendNotification',
          data: {
            type: 'new_participant',
            eventId,
            toOpenId: creatorOpenId,
            data: {
              participantName: responseName,
              eventName: eventData.name || '聚会'
            }
          }
        })
      }
    } catch (notifyErr) {
      // 通知失败不影响主流程
      console.warn('[submitResponse] 通知创建者失败', notifyErr)
    }

    return {
      success: true
    }
  } catch (err) {
    console.error('submitResponse failed:', err)
    return {
      success: false,
      error: '操作失败，请重试'
    }
  }
}
