// 云函数 - 创建聚会活动
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { name, startDate, endDate, granularity = 'twoHours', expireType = '7days', note = '' } = event

  const openid = cloud.getWXContext().OPENID
  if (!openid) {
    return { success: false, error: '未授权' }
  }

  // 必填参数校验
  if (!name || !startDate || !endDate) {
    return {
      success: false,
      error: '缺少必填参数'
    }
  }

  // 枚举白名单
  const VALID_GRANULARITIES = ['hour', 'halfDay', 'twoHours']
  const VALID_EXPIRE_TYPES = ['24h', '3days', '7days', 'never']
  if (!VALID_GRANULARITIES.includes(granularity)) {
    return { success: false, error: '无效的时间粒度' }
  }
  if (!VALID_EXPIRE_TYPES.includes(expireType)) {
    return { success: false, error: '无效的过期类型' }
  }

  // 字符串长度限制
  if (name.length > 50) {
    return { success: false, error: '活动名称不能超过50个字符' }
  }
  if (note.length > 200) {
    return { success: false, error: '备注不能超过200个字符' }
  }

  // 日期格式校验
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { success: false, error: '日期格式无效' }
  }
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
    // NOTE: 使用本地服务器时间计算，存在与数据库时间时钟偏差的风险。
    // 云开发 db.serverDate() 不支持算术运算，此处为最佳可用方案。
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
        createdBy: cloud.getWXContext().OPENID, // 冗余字段，_openid 由平台自动注入；保留用于旧数据兼容
        notifications: {
          creatorSubscribed: false,  // 创建者是否已订阅通知，由前端更新
          lastExpiringReminderAt: null  // 上次发送过期提醒的时间
        }
      }
    })

    return {
      success: true,
      eventId: result._id
    }
  } catch (err) {
    console.error('createEvent failed:', err)
    return {
      success: false,
      error: '操作失败，请重试'
    }
  }
}
