const util = require('../../utils/util')

Page({
  data: {
    events: [],
    loading: false,
    initialized: false,
    guideExpanded: true, // 使用说明默认展开
    swipeStartX: 0,
    swipeStartY: 0,
    activeSwipeId: null // 当前滑开的卡片ID
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
    // 重置滑动状态
    this.closeAllSwipe()
  },

  onPullDownRefresh() {
    this.closeAllSwipe()
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
        ...createdRes.data.map(e => ({ ...e, type: 'created', translateX: 0 })),
        ...joinedEvents.map(e => ({ ...e, type: 'joined', translateX: 0 }))
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
              createdAt: new Date().toISOString(),
              translateX: 0
            }
          ]
        })
      }
    }
  },

  // 刷新
  refreshEvents() {
    this.closeAllSwipe()
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

    // 如果正在滑动，不触发点击
    const event = this.data.events.find(ev => ev._id === id)
    if (event && event.translateX !== 0) {
      this.closeSwipe(id)
      return
    }

    // 如果已过期或是我创建的，跳转到结果页
    // 否则跳转到填写页
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

  // 折叠/展开使用说明
  toggleGuide() {
    this.setData({
      guideExpanded: !this.data.guideExpanded
    })
  },

  // 左滑开始
  onSwipeStart(e) {
    const { clientX, clientY } = e.touches[0]
    this.setData({
      swipeStartX: clientX,
      swipeStartY: clientY
    })
  },

  // 左滑结束
  onSwipeEnd(e) {
    const { id, type } = e.currentTarget.dataset
    const { swipeStartX, swipeStartY, activeSwipeId } = this.data
    const { clientX, clientY } = e.changedTouches[0]

    // 计算滑动距离
    const deltaX = clientX - swipeStartX
    const deltaY = clientY - swipeStartY

    // 如果垂直滑动大于水平滑动，忽略（滚动手势）
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return
    }

    // 只有创建者创建的聚会才能删除
    if (type !== 'created') {
      return
    }

    // 左滑超过 60rpx 显示删除按钮
    if (deltaX < -60) {
      this.openSwipe(id)
    } else if (deltaX > 30) {
      // 右滑关闭
      this.closeSwipe(id)
    } else if (activeSwipeId && activeSwipeId !== id) {
      // 点击其他卡片时关闭已打开的
      this.closeAllSwipe()
    }
  },

  // 打开滑动
  openSwipe(id) {
    const events = this.data.events.map(e => {
      if (e._id === id) {
        return { ...e, translateX: -140 }
      }
      return { ...e, translateX: 0 }
    })
    this.setData({ events, activeSwipeId: id })
  },

  // 关闭滑动
  closeSwipe(id) {
    const events = this.data.events.map(e => {
      if (e._id === id) {
        return { ...e, translateX: 0 }
      }
      return e
    })
    this.setData({ events, activeSwipeId: null })
  },

  // 关闭所有滑动
  closeAllSwipe() {
    const events = this.data.events.map(e => ({ ...e, translateX: 0 }))
    this.setData({ events, activeSwipeId: null })
  },

  // 删除聚会
  async deleteEvent(e) {
    const { id } = e.currentTarget.dataset

    const res = await wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这个聚会吗？',
      confirmText: '删除',
      confirmColor: '#ef4444'
    })

    if (!res.confirm) {
      this.closeSwipe(id)
      return
    }

    try {
      wx.showLoading({ title: '删除中...' })

      if (wx.cloud) {
        const db = wx.cloud.database()
        // 删除活动
        await db.collection('events').doc(id).remove()
        // 删除所有响应
        await db.collection('responses').where({
          eventId: id
        }).remove()
      }

      wx.hideLoading()
      wx.showToast({
        title: '已删除',
        icon: 'success'
      })

      // 从列表中移除
      const events = this.data.events.filter(e => e._id !== id)
      this.setData({ events, activeSwipeId: null })

    } catch (err) {
      wx.hideLoading()
      console.error('删除失败', err)
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      })
      this.closeSwipe(id)
    }
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '聚会时间 - 轻松找到大家都有空的时间',
      path: '/pages/index/index'
    }
  }
})
