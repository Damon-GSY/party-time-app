// 云函数 - 删除聚会活动（带权限校验）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { eventId } = event
  const openid = cloud.getWXContext().OPENID

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
    if (eventRes.data.createdBy !== openid) {
      return {
        success: false,
        error: '无权删除此活动'
      }
    }

    // 删除活动
    await db.collection('events').doc(eventId).remove()

    // 删除所有相关响应
    await db.collection('responses').where({
      eventId
    }).remove()

    return {
      success: true
    }
  } catch (err) {
    console.error('删除活动失败', err)
    return {
      success: false,
      error: err.message || '删除失败'
    }
  }
}
