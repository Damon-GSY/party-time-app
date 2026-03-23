const util = require('../../utils/util')

Page({
  data: {
    activeTab: 'created',
    events: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    page: 0,
    pageSize: 10
  },

  onLoad(options) {
    const type = options.type || 'created'
    this.setData({ activeTab: type })
    this.loadEvents()
  },

  onPullDownRefresh() {
    this.setData({ page: 0, events: [] })
    this.loadEvents().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMore()
    }
  },

  // 切换 Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return

    this.setData({
      activeTab: tab,
      events: [],
      page: 0,
      hasMore: false
    })
    this.loadEvents()
  },

  // 加载聚会列表
  async loadEvents() {
    this.setData({ loading: true })

    try {
      const db = wx.cloud.database()
      const { activeTab, pageSize } = this.data

      if (activeTab === 'created') {
        const countRes = await db.collection('events')
          .where({ _openid: '{openid}' })
          .count()

        const res = await db.collection('events')
          .where({ _openid: '{openid}' })
          .orderBy('createdAt', 'desc')
          .limit(pageSize)
          .get()

        const events = this.processEvents(res.data)
        this.setData({
          events,
          loading: false,
          hasMore: events.length < countRes.total,
          page: 1
        })
      } else {
        // 我参与的：先获取 response 中的 eventId 列表
        const responsesRes = await db.collection('responses')
          .where({ _openid: '{openid}' })
          .field({ eventId: true })
          .limit(100)
          .get()

        const joinedEventIds = [...new Set(responsesRes.data.map(r => r.eventId))]

        if (joinedEventIds.length === 0) {
          this.setData({ events: [], loading: false, hasMore: false })
          return
        }

        // 排除自己创建的
        const createdRes = await db.collection('events')
          .where({ _openid: '{openid}' })
          .field({ _id: true })
          .get()
        const createdIds = createdRes.data.map(e => e._id)

        const joinedOnlyIds = joinedEventIds.filter(id => !createdIds.includes(id))

        if (joinedOnlyIds.length === 0) {
          this.setData({ events: [], loading: false, hasMore: false })
          return
        }

        const res = await db.collection('events')
          .where({ _id: db.command.in(joinedOnlyIds) })
          .orderBy('createdAt', 'desc')
          .limit(pageSize)
          .get()

        const events = this.processEvents(res.data)
        this.setData({
          events,
          loading: false,
          hasMore: events.length < joinedOnlyIds.length,
          page: 1
        })
      }
    } catch (err) {
      console.error('loadEvents failed:', err)
      this.setData({ loading: false })
    }
  },

  // 加载更多
  async loadMore() {
    this.setData({ loadingMore: true })

    try {
      const db = wx.cloud.database()
      const { activeTab, page, pageSize, events: oldEvents } = this.data
      const skip = page * pageSize

      if (activeTab === 'created') {
        const res = await db.collection('events')
          .where({ _openid: '{openid}' })
          .orderBy('createdAt', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get()

        const newEvents = this.processEvents(res.data)
        this.setData({
          events: [...oldEvents, ...newEvents],
          loadingMore: false,
          hasMore: newEvents.length >= pageSize,
          page: page + 1
        })
      } else {
        // For joined, fetch all then slice (simpler for small datasets)
        const responsesRes = await db.collection('responses')
          .where({ _openid: '{openid}' })
          .field({ eventId: true })
          .limit(100)
          .get()

        const joinedEventIds = [...new Set(responsesRes.data.map(r => r.eventId))]
        const createdRes = await db.collection('events')
          .where({ _openid: '{openid}' })
          .field({ _id: true })
          .get()
        const createdIds = createdRes.data.map(e => e._id)
        const joinedOnlyIds = joinedEventIds.filter(id => !createdIds.includes(id))

        if (joinedOnlyIds.length === 0) {
          this.setData({ loadingMore: false, hasMore: false })
          return
        }

        const res = await db.collection('events')
          .where({ _id: db.command.in(joinedOnlyIds) })
          .orderBy('createdAt', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get()

        const newEvents = this.processEvents(res.data)
        this.setData({
          events: [...oldEvents, ...newEvents],
          loadingMore: false,
          hasMore: (skip + newEvents.length) < joinedOnlyIds.length,
          page: page + 1
        })
      }
    } catch (err) {
      console.error('loadMore failed:', err)
      this.setData({ loadingMore: false })
    }
  },

  // 处理聚会数据
  processEvents(rawEvents) {
    return rawEvents.map(event => {
      const startDate = util.formatDateShort(event.startDate)
      const endDate = util.formatDateShort(event.endDate)
      const dateRangeText = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`
      const expired = util.isExpired(event.expireAt)

      let statusText = '进行中'
      let statusType = 'active'
      if (expired) {
        statusText = '已过期'
        statusType = 'expired'
      } else if (event.expireAt) {
        statusText = '进行中'
        statusType = 'confirmed'
      }

      return {
        ...event,
        dateRangeText,
        statusText,
        statusType,
        expired
      }
    })
  },

  // 跳转到结果页
  goToResult(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/result/result?id=${id}`
    })
  },

  // 创建聚会
  goCreate() {
    wx.navigateTo({
      url: '/pages/create/create'
    })
  },

  // 返回首页
  goBack() {
    wx.navigateBack()
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '聚会时间 - 轻松找到大家都有空的时间',
      path: '/pages/index/index'
    }
  }
})
