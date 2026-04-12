// 云函数 - 提交时间选择
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { eventId, nickname, slots } = event
  const openid = cloud.getWXContext().OPENID

  // 参数校验
  if (!eventId || !slots || !Array.isArray(slots)) {
    return {
      success: false,
      error: '参数错误'
    }
  }

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
    if (eventData.expireAt && new Date() > new Date(eventData.expireAt)) {
      return {
        success: false,
        error: '活动已过期'
      }
    }

    // 查找是否已有提交记录
    const existingRes = await db.collection('responses')
      .where({
        eventId,
        _openid: openid
      })
      .limit(1)
      .get()

    const responseName = nickname || '匿名用户'

    if (existingRes.data && existingRes.data.length > 0) {
      // 更新已有记录
      await db.collection('responses').doc(existingRes.data[0]._id).update({
        data: {
          nickname: responseName,
          slots,
          updatedAt: db.serverDate()
        }
      })
    } else {
      // 创建新记录
      await db.collection('responses').add({
        data: {
          eventId,
          nickname: responseName,
          slots,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      })
    }

    // 通知创建者：有人参与了投票
    try {
      const creatorOpenId = eventData.createdBy || eventData._openid
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
    console.error('提交失败', err)
    return {
      success: false,
      error: err.message || '提交失败'
    }
  }
}
