/**
 * 用户信息工具模块
 */

const STORAGE_KEY = 'userInfo'
const { getAllMyEvents } = require('./events')

/**
 * 获取用户信息（先读内存，再读缓存，没有则返回默认值）
 */
const getUserInfo = () => {
  try {
    const app = typeof getApp === 'function' ? getApp() : null
    const info = app?.globalData?.userInfo || wx.getStorageSync(STORAGE_KEY)
    if (info && typeof info === 'object') {
      return {
        nickName: '',
        avatarUrl: '',
        customNickname: '',
        ...info
      }
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
 * 统一更新内存和缓存，投票页与个人页始终读取同一份用户信息。
 */
const updateUserInfo = (data) => {
  const updated = { ...getUserInfo(), ...data }
  const app = typeof getApp === 'function' ? getApp() : null
  if (app?.globalData) app.globalData.userInfo = updated
  try {
    wx.setStorageSync(STORAGE_KEY, updated)
  } catch (e) {
    console.error('updateUserInfo failed:', e)
  }
  return updated
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
    const events = await getAllMyEvents()
    return {
      createdCount: events.filter(event => event.type === 'created').length,
      joinedCount: events.filter(event => event.type === 'joined').length
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
