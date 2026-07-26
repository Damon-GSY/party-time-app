// 通知中心页面
const STORAGE_KEY = 'notification_history'

// 通知类型配置
const TYPE_CONFIG = {
  new_participant: {
    label: '参与',
    title: '新参与通知',
    desc: (data) => `${data.participantName || '有人'}参与了你的聚会「${data.eventName || '聚会'}」`
  },
  vote_submitted: {
    label: '投票',
    title: '时间已提交',
    desc: (data) => `你已提交「${data.eventName || '聚会'}」的可用时间`
  },
  expiring_soon: {
    label: '到期',
    title: '即将过期',
    desc: (data) => `你的聚会「${data.eventName || '聚会'}」${data.expireTime || '即将过期'}`
  },
  result_ready: {
    label: '结果',
    title: '时间已确定',
    desc: (data) => `聚会「${data.eventName || '聚会'}」的最佳时间：${data.bestTime || '查看详情'}`
  },
  result_notified: {
    label: '发送',
    title: '结果通知已处理',
    desc: (data) => `「${data.eventName || '聚会'}」通知成功 ${data.successCount || 0} 人，失败 ${data.failCount || 0} 人`
  },
  subscribe_success: {
    label: '系统',
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

  // 从本地存储加载通知
  loadNotifications() {
    try {
      const raw = wx.getStorageSync(STORAGE_KEY) || '[]'
      const notifications = JSON.parse(raw)
      // 格式化时间显示
      const now = Date.now()
      notifications.forEach(n => {
        n.label = n.label || TYPE_CONFIG[n.type]?.label || '通知'
        n.timeText = this.formatTime(n.timestamp, now)
      })
      this.setData({ notifications })
    } catch (e) {
      this.setData({ notifications: [] })
    }
  },

  // 添加通知记录（供其他页面调用）
  addNotification(type, data = {}) {
    const config = TYPE_CONFIG[type] || { label: '通知', title: '通知', desc: () => '' }
    const notification = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type,
      label: config.label,
      title: config.title,
      description: config.desc(data),
      data,
      timestamp: Date.now(),
      timeText: '刚刚',
      read: false
    }

    try {
      const raw = wx.getStorageSync(STORAGE_KEY) || '[]'
      const notifications = JSON.parse(raw)
      // 最多保留 50 条
      notifications.unshift(notification)
      if (notifications.length > 50) {
        notifications.splice(50)
      }
      wx.setStorageSync(STORAGE_KEY, JSON.stringify(notifications))
    } catch (e) {
      console.error('[notifications] 保存通知失败', e)
    }

    return notification
  },

  // 标记已读
  markAsRead(e) {
    const { id } = e.currentTarget.dataset
    const notifications = this.data.notifications
    const updated = notifications.map(n => {
      if (n.id === id) return { ...n, read: true }
      return n
    })

    this.setData({ notifications: updated })

    // 更新本地存储
    try {
      const raw = wx.getStorageSync(STORAGE_KEY) || '[]'
      const stored = JSON.parse(raw)
      stored.forEach(n => { if (n.id === id) n.read = true })
      wx.setStorageSync(STORAGE_KEY, JSON.stringify(stored))
    } catch (e) {}
  },

  // 清空通知
  async clearAll() {
    const res = await wx.showModal({
      title: '确认清空',
      content: '确定要清空所有通知记录吗？',
      confirmText: '清空',
      confirmColor: '#b83a2d'
    })

    if (!res.confirm) return

    this.setData({ notifications: [] })
    try {
      wx.removeStorageSync(STORAGE_KEY)
    } catch (e) {}
    wx.showToast({ title: '已清空', icon: 'success' })
  },

  // 格式化时间
  formatTime(timestamp, now) {
    const diff = now - timestamp
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`

    const date = new Date(timestamp)
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}月${day}日`
  }
})
