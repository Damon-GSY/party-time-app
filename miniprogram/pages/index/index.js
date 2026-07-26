const util = require('../../utils/util')
const user = require('../../utils/user')
const app = getApp()

function getEventIcon(name = '') {
  if (/生日|蛋糕|周年/.test(name)) return '/assets/icons/cake-slice-coral.png'
  if (/派对|庆祝|团建|年会/.test(name)) return '/assets/icons/party-popper-coral.png'
  if (/聚餐|晚餐|午餐|火锅|烧烤/.test(name)) return '/assets/icons/utensils-coral.png'
  return '/assets/icons/calendar-days-coral.png'
}

Page({
  data: {
    events: [],
    pendingEvents: [],
    recentEvents: [],
    loading: false,
    loadError: false,
    initialized: false,
    currentMonth: '',
    calendarDays: [],
    swipeStartX: 0,
    swipeStartY: 0,
    activeSwipeId: null,
    cardPressedId: null,
    userAvatar: ''
  },

  onLoad() {
    this.initCalendar()
    this.loadUserAvatar()
    this.loadEvents()
  },

  onShow() {
    this.loadUserAvatar()
    if (this.data.initialized) this.loadEvents()
    this.closeAllSwipe()
  },

  initCalendar() {
    const today = new Date()
    const mondayOffset = (today.getDay() + 6) % 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - mondayOffset)
    const weekNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const calendarDays = weekNames.map((weekday, index) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + index)
      return {
        weekday,
        day: date.getDate(),
        current: util.formatDate(date) === util.formatDate(today)
      }
    })

    this.setData({ currentMonth: `${today.getMonth() + 1}月`, calendarDays })
  },

  loadUserAvatar() {
    const info = app.globalData.userInfo || user.getUserInfo()
    this.setData({ userAvatar: info.avatarUrl || '' })
  },

  onPullDownRefresh() {
    this.closeAllSwipe()
    this.loadEvents().finally(() => wx.stopPullDownRefresh())
  },

  async loadEvents() {
    this.setData({ loading: true, loadError: false })

    try {
      if (!wx.cloud) throw new Error('cloud unavailable')
      const response = await wx.cloud.callFunction({
        name: 'getMyEvents',
        data: { limit: 20 }
      })
      if (!response.result?.success) {
        throw new Error(response.result?.error || '活动加载失败')
      }

      const events = (response.result.data || []).map(event => {
        const startDate = util.formatDateShort(event.startDate)
        const endDate = util.formatDateShort(event.endDate)
        const date = new Date(event.startDate)
        return {
          ...event,
          startMonth: date.getMonth() + 1,
          startDay: date.getDate(),
          dateRangeText: startDate === endDate ? startDate : `${startDate} ~ ${endDate}`,
          expireText: util.formatExpireTime(event.expireAt),
          expired: util.isExpired(event.expireAt),
          iconPath: getEventIcon(event.name),
          translateX: 0
        }
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      const pendingEvents = events.filter(event => event.type === 'joined' && !event.expired)
      const pendingIds = new Set(pendingEvents.map(event => event._id))
      const recentEvents = events.filter(event => !pendingIds.has(event._id))

      this.setData({
        events,
        pendingEvents,
        recentEvents,
        loading: false,
        initialized: true
      })
    } catch (err) {
      if (!wx.cloud) {
        const today = new Date()
        const demo = {
          _id: 'demo1',
          name: '周末聚餐',
          startMonth: today.getMonth() + 1,
          startDay: today.getDate(),
          dateRangeText: util.formatDateShort(today),
          expireText: '5天后过期',
          expired: false,
          participantCount: 3,
          type: 'joined',
          createdAt: today.toISOString(),
          iconPath: getEventIcon('周末聚餐'),
          translateX: 0
        }
        this.setData({
          events: [demo],
          pendingEvents: [demo],
          recentEvents: [],
          loading: false,
          loadError: false,
          initialized: true
        })
        return
      }

      console.error('[index] load events failed', err)
      this.setData({ loading: false, loadError: true, initialized: true })
    }
  },

  refreshEvents() {
    this.closeAllSwipe()
    return this.loadEvents()
  },

  goToCreate() {
    wx.navigateTo({ url: '/pages/create/create' })
  },

  goToProfile() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  goToNotifications() {
    wx.switchTab({ url: '/pages/notifications/notifications' })
  },

  goToEvent(e) {
    const { id, type } = e.currentTarget.dataset
    const event = this.data.events.find(item => item._id === id)
    if (!event) return
    if (event.translateX !== 0) {
      this.closeSwipe(id)
      return
    }

    const url = event.expired || type === 'created'
      ? `/pages/result/result?id=${id}`
      : `/pages/vote/vote?id=${id}`
    wx.navigateTo({ url })
  },

  onCardTouchStart(e) {
    this.setData({ cardPressedId: e.currentTarget.dataset.id })
  },

  onCardTouchEnd() {
    this.setData({ cardPressedId: null })
  },

  onSwipeStart(e) {
    const { clientX, clientY } = e.touches[0]
    this.setData({ swipeStartX: clientX, swipeStartY: clientY })
  },

  onSwipeEnd(e) {
    const { id, type } = e.currentTarget.dataset
    if (type !== 'created') return
    const { clientX, clientY } = e.changedTouches[0]
    const deltaX = clientX - this.data.swipeStartX
    const deltaY = clientY - this.data.swipeStartY
    if (Math.abs(deltaY) > Math.abs(deltaX)) return
    if (deltaX < -60) this.openSwipe(id)
    else if (deltaX > 30) this.closeSwipe(id)
  },

  openSwipe(id) {
    const translate = event => ({
      ...event,
      translateX: event._id === id ? -140 : 0
    })
    this.setData({
      events: this.data.events.map(translate),
      pendingEvents: this.data.pendingEvents.map(translate),
      recentEvents: this.data.recentEvents.map(translate),
      activeSwipeId: id
    })
  },

  closeSwipe(id) {
    const translate = event => event._id === id
      ? { ...event, translateX: 0 }
      : event
    this.setData({
      events: this.data.events.map(translate),
      pendingEvents: this.data.pendingEvents.map(translate),
      recentEvents: this.data.recentEvents.map(translate),
      activeSwipeId: null
    })
  },

  closeAllSwipe() {
    const translate = event => ({ ...event, translateX: 0 })
    this.setData({
      events: this.data.events.map(translate),
      pendingEvents: this.data.pendingEvents.map(translate),
      recentEvents: this.data.recentEvents.map(translate),
      activeSwipeId: null
    })
  },

  async deleteEvent(e) {
    const { id } = e.currentTarget.dataset
    const modal = await wx.showModal({
      title: '删除聚会？',
      content: '删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#ff7668'
    })
    if (!modal.confirm) {
      this.closeSwipe(id)
      return
    }

    try {
      wx.showLoading({ title: '删除中' })
      const response = await wx.cloud.callFunction({
        name: 'deleteEvent',
        data: { eventId: id }
      })
      if (!response.result?.success) throw new Error(response.result?.error || '删除失败')
      const events = this.data.events.filter(event => event._id !== id)
      const pendingEvents = this.data.pendingEvents.filter(event => event._id !== id)
      const recentEvents = this.data.recentEvents.filter(event => event._id !== id)
      this.setData({ events, pendingEvents, recentEvents, activeSwipeId: null })
      wx.showToast({ title: '已删除', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '删除失败', icon: 'none' })
      this.closeSwipe(id)
    } finally {
      wx.hideLoading()
    }
  },

  onCardLongPress(e) {
    const { id, type } = e.currentTarget.dataset
    const itemList = ['复制邀请路径', '生成海报']
    if (type === 'created') itemList.push('删除')
    wx.showActionSheet({
      itemList,
      success: ({ tapIndex }) => {
        if (tapIndex === 0) wx.setClipboardData({ data: `pages/vote/vote?id=${id}` })
        if (tapIndex === 1) wx.navigateTo({ url: `/pages/poster/poster?id=${id}` })
        if (tapIndex === 2) this.deleteEvent({ currentTarget: { dataset: { id } } })
      }
    })
  },

  onShareAppMessage() {
    return {
      title: '聚会时间 — 找到大家都有空的时刻',
      path: '/pages/index/index'
    }
  }
})
