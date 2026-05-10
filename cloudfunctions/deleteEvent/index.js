// 云函数 - 删除聚会活动（带权限校验）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { eventId } = event
  const openid = cloud.getWXContext().OPENID

  if (!openid) {
    return { success: false, error: '未授权' }
  }

  if (!eventId) {
    return {
      success: false,
      error: '缺少活动ID'
    }
  }

  try {
    // 验证活动存在
    const eventRes = await db.collection('events').doc(eventId).get()
    if (!eventRes.data) {
      return {
        success: false,
        error: '活动不存在'
      }
    }

    // 验证权限：只有创建者可以删除
    if (eventRes.data._openid !== openid) {
      return {
        success: false,
        error: '无权删除此活动'
      }
    }

    // 先删除所有相关响应，再删除活动（避免孤立数据）
    await db.collection('responses').where({
      eventId
    }).remove()

    await db.collection('events').doc(eventId).remove()

    return {
      success: true
    }
  } catch (err) {
    console.error('deleteEvent failed:', err)
    return {
      success: false,
      error: '操作失败，请重试'
    }
  }
}
