/**
 * 用户信息工具模块
 */

const STORAGE_KEY = 'userInfo'

/**
 * 获取用户信息（先读缓存，没有则返回默认值）
 */
const getUserInfo = () => {
  try {
    const info = wx.getStorageSync(STORAGE_KEY)
    if (info && info.nickName) {
      return info
    }
  } catch (e) {
    // ignore
  }
  return {
    nickName: '',
    avatarUrl: '',
    customNickname: ''
  }
}

/**
 * 更新用户信息到缓存
 */
const updateUserInfo = (data) => {
  try {
    const existing = getUserInfo()
    const updated = { ...existing, ...data }
    wx.setStorageSync(STORAGE_KEY, updated)
    return updated
  } catch (e) {
    console.error('updateUserInfo failed:', e)
    return getUserInfo()
  }
}

/**
 * 获取昵称（优先用户自定义昵称，其次缓存昵称，最后「匿名用户」）
 */
const getNickname = () => {
  const info = getUserInfo()
  if (info.customNickname) return info.customNickname
  if (info.nickName) return info.nickName
  return '匿名用户'
}

/**
 * 获取用户头像 URL
 */
const getAvatarUrl = () => {
  const info = getUserInfo()
  return info.avatarUrl || ''
}

/**
 * 获取用户统计数据（从云开发查询）
 */
const getUserStats = async () => {
  if (!wx.cloud) {
    return { createdCount: 0, joinedCount: 0 }
  }

  try {
    const db = wx.cloud.database()

    // 查询创建的聚会数量
    const createdRes = await db.collection('events')
      .where({ _openid: '{openid}' })
      .count()

    // 查询参与的聚会数量
    const responsesRes = await db.collection('responses')
      .where({ _openid: '{openid}' })
      .field({ eventId: true })
      .get()

    // 去重
    const joinedEventIds = [...new Set(responsesRes.data.map(r => r.eventId))]
    // 减去自己创建的（避免重复计数）
    let joinedOnly = joinedEventIds.length
    if (createdRes.total > 0 && joinedEventIds.length > 0) {
      const createdIds = (await db.collection('events')
        .where({
          _openid: '{openid}',
          _id: db.command.in(joinedEventIds)
        })
        .field({ _id: true })
        .get()).data.map(e => e._id)
      joinedOnly = joinedEventIds.length - createdIds.length
    }

    return {
      createdCount: createdRes.total,
      joinedCount: joinedOnly
    }
  } catch (e) {
    console.error('getUserStats failed:', e)
    return { createdCount: 0, joinedCount: 0 }
  }
}

module.exports = {
  getUserInfo,
  updateUserInfo,
  getNickname,
  getAvatarUrl,
  getUserStats,
  STORAGE_KEY
}
