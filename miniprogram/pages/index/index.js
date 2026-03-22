const util = require('../../utils/util')

Page({
  data: {
    events: [],
    loading: false,
    initialized: false
  },

  onLoad() {
    // onLoad 时加载一次
    this.loadEvents()
  },

  onShow() {
    // onShow 时只在已初始化的情况下刷新（从其他页面返回时）
    if (this.data.initialized) {
      this.loadEvents()
    }
  },

  onPullDownRefresh() {
    this.loadEvents().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 加载聚会列表
  async loadEvents() {
    this.setData({ loading: true })

    try {
      const db = wx.cloud.database()

      // 获取我创建的聚会
      const createdRes = await db.collection('events')
        .where({
          _openid: '{openid}' // 云开发会自动替换
        })
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()

      // 获取我参与的聚会
      const responsesRes = await db.collection('responses')
        .where({
          _openid: '{openid}'
        })
        .field({ eventId: true })
        .get()

      const joinedEventIds = [...new Set(responsesRes.data.map(r => r.eventId))]

      let joinedEvents = []
      if (joinedEventIds.length > 0) {
        // 批量获取参与的聚会
        const joinedRes = await db.collection('events')
          .where({
            _id: db.command.in(joinedEventIds)
          })
          .get()
        joinedEvents = joinedRes.data
      }

      // 合并并标记类型
      const allEvents = [
        ...createdRes.data.map(e => ({ ...e, type: 'created' })),
        ...joinedEvents.map(e => ({ ...e, type: 'joined' }))
      ]

      // 去重（如果同时是创建者和参与者）
      const eventMap = new Map()
      allEvents.forEach(e => {
        if (!eventMap.has(e._id) || e.type === 'created') {
          eventMap.set(e._id, e)
        }
      })

      // 处理数据
      const processedEvents = Array.from(eventMap.values()).map(event => {
        const startDate = util.formatDateShort(event.startDate)
        const endDate = util.formatDateShort(event.endDate)
        const dateRangeText = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`

        return {
          ...event,
          dateRangeText,
          expireText: util.formatExpireTime(event.expireAt),
          expired: util.isExpired(event.expireAt)
        }
      })

      // 按创建时间排序
      processedEvents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      this.setData({
        events: processedEvents,
        loading: false,
        initialized: true
      })
    } catch (err) {
      console.error('加载聚会列表失败', err)
      this.setData({ loading: false })

      // 开发环境使用模拟数据
      if (!wx.cloud) {
        this.setData({
          events: [
            {
              _id: 'demo1',
              name: '周末聚餐',
              startDate: '2024-03-23',
              endDate: '2024-03-24',
              dateRangeText: '3月23日 周六 ~ 3月24日 周日',
              expireText: '5天后过期',
              expired: false,
              participantCount: 5,
              type: 'created',
              createdAt: new Date().toISOString()
            }
          ]
        })
      }
    }
  },

  // 刷新
  refreshEvents() {
    this.loadEvents()
  },

  // 跳转到创建页面
  goToCreate() {
    wx.navigateTo({
      url: '/pages/create/create'
    })
  },

  // 跳转到聚会详情
  goToEvent(e) {
    const { id, type } = e.currentTarget.dataset

    // 如果已过期或是我创建的，跳转到结果页
    // 否则跳转到填写页
    const event = this.data.events.find(ev => ev._id === id)

    const targetUrl = (event.expired || type === 'created')
      ? `/pages/result/result?id=${id}`
      : `/pages/vote/vote?id=${id}`

    // 使用 redirectTo 防止页面栈溢出，失败时回退到 navigateTo
    wx.redirectTo({
      url: targetUrl,
      fail: () => {
        wx.navigateTo({ url: targetUrl })
      }
    })
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '聚会时间 - 轻松找到大家都有空的时间',
      path: '/pages/index/index'
    }
  }
})
