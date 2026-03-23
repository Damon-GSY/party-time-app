// 云函数 - 创建聚会活动
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { name, startDate, endDate, granularity = 'twoHours', expireType = '7days', note = '' } = event

  // 必填参数校验
  if (!name || !startDate || !endDate) {
    return {
      success: false,
      error: '缺少必填参数'
    }
  }

  // 日期范围校验
  const start = new Date(startDate)
  const end = new Date(endDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (start < today) {
    return {
      success: false,
      error: '开始日期不能早于今天'
    }
  }

  if (end < start) {
    return {
      success: false,
      error: '结束日期不能早于开始日期'
    }
  }

  // 限制日期范围最大31天
  const daysDiff = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1
  if (daysDiff > 31) {
    return {
      success: false,
      error: '日期范围不能超过31天'
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
        createdBy: cloud.getWXContext().OPENID,
        notifications: {
          creatorSubscribed: false,
          lastExpiringReminderAt: null
        }
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
