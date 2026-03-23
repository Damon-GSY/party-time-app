const STORAGE_KEY = 'notification_history'

const TYPE_CONFIG = {
  new_participant: {
    icon: '👤',
    title: '新参与通知',
    desc: (data) => `${data.participantName || '有人'}参与了你的聚会「${data.eventName || '聚会'}」`
  },
  expiring_soon: {
    icon: '⏰',
    title: '即将过期',
    desc: (data) => `你的聚会「${data.eventName || '聚会'}」${data.expireTime || '即将过期'}`
  },
  result_ready: {
    icon: '🎉',
    title: '时间已确定',
    desc: (data) => `聚会「${data.eventName || '聚会'}」的最佳时间：${data.bestTime || '查看详情'}`
  },
  subscribe_success: {
    icon: '✅',
    title: '订阅成功',
    desc: (data) => `已开启「${data.name || '通知'}」提醒`
  }
}

Page({
  data: {
    notifications: []
  },

  onShow() {
    this.loadNotifications()
  },

  loadNotifications() {
    try {
      const raw = wx.getStorageSync(STORAGE_KEY) || '[]'
      const notifications = JSON.parse(raw)
      const now = Date.now()
      notifications.forEach(n => {
        n.timeText = this.formatTime(n.timestamp, now)
      })
      this.setData({ notifications })
    } catch (e) {
      this.setData({ notifications: [] })
    }
  },

  markAsRead(e) {
    const { id } = e.currentTarget.dataset
    const notifications = this.data.notifications.map(n => {
      if (n.id === id) return { ...n, read: true }
      return n
    })
    this.setData({ notifications })

    try {
      const raw = wx.getStorageSync(STORAGE_KEY) || '[]'
      const stored = JSON.parse(raw)
      stored.forEach(n => { if (n.id === id) n.read = true })
      wx.setStorageSync(STORAGE_KEY, JSON.stringify(stored))
    } catch (e) {}
  },

  async clearAll() {
    const res = await wx.showModal({
      title: '确认清空',
      content: '确定要清空所有通知记录吗？',
      confirmText: '清空',
      confirmColor: '#e94560'
    })
    if (!res.confirm) return

    this.setData({ notifications: [] })
    try {
      wx.removeStorageSync(STORAGE_KEY)
    } catch (e) {}
    wx.showToast({ title: '已清空', icon: 'success' })
  },

  formatTime(timestamp, now) {
    const diff = now - timestamp
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
    const date = new Date(timestamp)
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }
})
