const util = require('../../utils/util')

Page({
  data: {
    activeTab: 'created',
    events: [],
    loading: false,
    loadError: false
  },

  onLoad(options) {
    this.setData({ activeTab: options.type === 'joined' ? 'joined' : 'created' })
    this.loadEvents()
  },

  onPullDownRefresh() {
    this.loadEvents().finally(() => wx.stopPullDownRefresh())
  },

  switchTab(e) {
    const activeTab = e.currentTarget.dataset.tab
    if (activeTab === this.data.activeTab) return
    this.setData({ activeTab, events: [] })
    this.loadEvents()
  },

  async loadEvents() {
    this.setData({ loading: true, loadError: false })
    try {
      const response = await wx.cloud.callFunction({
        name: 'getMyEvents',
        data: { limit: 50 }
      })
      if (!response.result?.success) throw new Error(response.result?.error || '加载失败')
      const events = this.processEvents((response.result.data || [])
        .filter(event => event.type === this.data.activeTab))
      this.setData({ events, loading: false })
    } catch (err) {
      console.error('[history] load events failed', err)
      this.setData({ loading: false, loadError: true })
    }
  },

  processEvents(events) {
    return events.map(event => {
      const date = new Date(event.startDate)
      const startText = util.formatDateShort(event.startDate)
      const endText = util.formatDateShort(event.endDate)
      const expired = util.isExpired(event.expireAt)
      return {
        ...event,
        startMonth: date.getMonth() + 1,
        startDay: date.getDate(),
        dateRangeText: startText === endText ? startText : `${startText} ~ ${endText}`,
        statusText: expired ? '已结束' : '进行中',
        expired
      }
    })
  },

  goToResult(e) {
    wx.navigateTo({ url: `/pages/result/result?id=${e.currentTarget.dataset.id}` })
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/create/create' })
  },

  goBack() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onShareAppMessage() {
    return { title: '聚会时间 — 找到大家都有空的时刻', path: '/pages/index/index' }
  }
})
