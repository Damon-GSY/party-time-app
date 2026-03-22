// 云函数 - 创建聚会活动
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { name, startDate, endDate, granularity = 'twoHours', expireType = '7days', note = '' } = event

  // 韶必填参数校验
  if (!name || !startDate || !endDate) {
    return {
      success: false,
      error: '缺少必填参数'
    }
  }

  try {
    // 计算过期时间
    let expireAt = null
    const now = new Date()

    switch (expireType) {
      case '24h':
        expireAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
        break
      case '3days':
        expireAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
        break
      case '7days':
        expireAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        break
      case 'never':
        expireAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // 一年后过期
        break
      default:
        expireAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    }

    // 创建活动记录
    const result = await db.collection('events').add({
      data: {
        name: name.trim(),
        startDate,
        endDate,
        granularity,
        expireType,
        expireAt: expireAt.toISOString(),
        note: note.trim(),
        createdAt: db.serverDate(),
        createdBy: cloud.getWXContext().OPENID
      }
    })

    return {
      success: true,
      eventId: result._id
    }
  } catch (err) {
    console.error('创建活动失败', err)
    return {
      success: false,
      error: err.message || '创建失败'
    }
  }
}
