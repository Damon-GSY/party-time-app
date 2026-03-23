/**
 * 通知工具函数 - 供前端页面使用
 */
const { TEMPLATE_NEW_PARTICIPANT, TEMPLATE_EXPIRING_SOON, TEMPLATE_RESULT_READY } = require('../config/notification')
const STORAGE_KEY = 'notification_history'

/**
 * 请求订阅消息
 * @param {string[]} tmplIds - 模板 ID 列表
 * @returns {Promise<string|null>} 成功返回 'accepted'，用户拒绝返回 'rejected'，失败返回 null
 */
function requestSubscribe(tmplIds) {
  return new Promise((resolve) => {
    if (!wx.requestSubscribeMessage) {
      console.warn('[notification] wx.requestSubscribeMessage 不可用')
      resolve(null)
      return
    }

    wx.requestSubscribeMessage({
      tmplIds,
      success(res) {
        const accepted = Object.keys(res).some(key => key !== 'errMsg' && res[key] === 'accept')
        resolve(accepted ? 'accepted' : 'rejected')
      },
      fail(err) {
        console.warn('[notification] 请求订阅失败', err)
        resolve(null)
      }
    })
  })
}

/**
 * 一次性请求所有通知模板
 */
async function subscribeAll() {
  const result = await requestSubscribe([
    TEMPLATE_NEW_PARTICIPANT,
    TEMPLATE_EXPIRING_SOON,
    TEMPLATE_RESULT_READY
  ])
  if (result === 'accepted') {
    saveLocalNotification('subscribe_success', { name: '全部通知' })
  }
  return result
}

/**
 * 保存通知到本地存储（供通知中心读取）
 */
function saveLocalNotification(type, data = {}) {
  const TYPE_CONFIG = {
    new_participant: { icon: '👤', title: '新参与通知', desc: () => `${data.participantName || '有人'}参与了你的聚会「${data.eventName || '聚会'}」` },
    expiring_soon: { icon: '⏰', title: '即将过期', desc: () => `你的聚会「${data.eventName || '聚会'}」${data.expireTime || '即将过期'}` },
    result_ready: { icon: '🎉', title: '时间已确定', desc: () => `聚会「${data.eventName || '聚会'}」的最佳时间：${data.bestTime || '查看详情'}` },
    subscribe_success: { icon: '✅', title: '订阅成功', desc: () => `已开启「${data.name || '通知'}」提醒` }
  }

  const config = TYPE_CONFIG[type] || { icon: '📢', title: '通知', desc: () => '' }
  const notification = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type,
    icon: config.icon,
    title: config.title,
    description: config.desc(),
    data,
    timestamp: Date.now(),
    timeText: '刚刚',
    read: false
  }

  try {
    const raw = wx.getStorageSync(STORAGE_KEY) || '[]'
    const notifications = JSON.parse(raw)
    notifications.unshift(notification)
    if (notifications.length > 50) notifications.splice(50)
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(notifications))
  } catch (e) {
    console.error('[notification] 保存本地通知失败', e)
  }

  return notification
}

/**
 * 获取未读通知数量
 */
function getUnreadCount() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY) || '[]'
    const notifications = JSON.parse(raw)
    return notifications.filter(n => !n.read).length
  } catch (e) {
    return 0
  }
}

module.exports = {
  requestSubscribe,
  subscribeAll,
  saveLocalNotification,
  getUnreadCount
}
