const util = require('../../utils/util')
const notificationUtil = require('../../utils/notification')

Page({
  data: {
    eventId: '',
    event: null,
    loading: true,
    loadError: false,
    isCreator: false,
    justCreated: false,
    participantCount: 0,
    bestSlot: { timeText: '', dateText: '', rangeText: '', count: 0, percent: 0, slotId: '' },
    dates: [],
    participants: [],
    slotModalMounted: false,
    showSlotModal: false,
    selectedSlotInfo: { dateText: '', timeText: '', count: 0, users: [] },
    notifying: false,
    deleting: false,
    notificationsConfigured: notificationUtil.isConfigured('result_ready')
  },

  onLoad(options) {
    const { id, created } = options
    if (!id || typeof id !== 'string' || id.length > 128) {
      wx.showToast({ title: '活动链接无效', icon: 'none' })
      setTimeout(() => this.goBack(), 1200)
      return
    }
    this.setData({ eventId: id, justCreated: created === '1' })
    this.loadResult(id)
  },

  async loadResult(eventId = this.data.eventId) {
    this.setData({ loading: true, loadError: false })
    try {
      if (!wx.cloud) {
        this.loadMockData()
        return
      }
      const response = await wx.cloud.callFunction({
        name: 'getEventResult',
        data: { eventId }
      })
      if (!response.result?.success) throw new Error(response.result?.error || '结果加载失败')
      this.processData(response.result.data)
    } catch (err) {
      console.error('[result] load result failed', err)
      this.setData({ loading: false, loadError: true })
    }
  },

  retryLoad() {
    this.loadResult(this.data.eventId)
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/index/index' })
  },

  loadMockData() {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const first = util.formatDate(today)
    const second = util.formatDate(tomorrow)
    const responses = [
      { _id: 'r1', nickname: '小明', slots: [`${first}_5`, `${first}_6`, `${second}_5`] },
      { _id: 'r2', nickname: '小红', slots: [`${first}_5`, `${first}_7`, `${second}_5`] },
      { _id: 'r3', nickname: '小李', slots: [`${first}_5`, `${second}_6`] }
    ]
    const slotStats = {}
    responses.forEach(response => response.slots.forEach(slotId => {
      slotStats[slotId] = (slotStats[slotId] || 0) + 1
    }))
    const bestSlots = Object.entries(slotStats)
      .map(([slotId, count]) => ({ slotId, count }))
      .sort((a, b) => b.count - a.count)
    this.processData({
      event: {
        _id: 'demo123',
        name: '周末聚餐',
        startDate: first,
        endDate: second,
        granularity: 'twoHours',
        dailyTimeWindow: { startMinute: 600, endMinute: 1320 },
        note: '地点待定，选好时间后一起确认。',
        expireAt: null
      },
      responses,
      slotStats,
      bestSlots,
      participantCount: responses.length,
      isCreator: true
    })
  },

  processData(result) {
    const { event, responses = [], slotStats = {}, bestSlots = [], participantCount = 0 } = result
    const granularity = event.granularity || 'twoHours'
    const slotConfig = util.getEventTimeSlotConfig(event)
    const slotUsers = {}
    responses.forEach(response => {
      ;(response.slots || []).forEach(slotId => {
        if (!slotUsers[slotId]) slotUsers[slotId] = []
        slotUsers[slotId].push(response.nickname || '匿名用户')
      })
    })

    const dates = util.generateDateRange(event.startDate, event.endDate).map(date => {
      const parsed = new Date(date)
      return {
        date,
        dateText: `${parsed.getMonth() + 1}月${parsed.getDate()}日`,
        weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parsed.getDay()],
        slots: slotConfig.map(slot => {
          const slotId = util.generateSlotId(date, slot.index)
          const count = slotStats[slotId] || 0
          return {
            slotId,
            date,
            slotIndex: slot.index,
            timeLabel: slot.label,
            shortLabel: slot.shortLabel,
            count,
            level: participantCount === 0 ? 0 : Math.min(4, Math.ceil(count / participantCount * 4)),
            users: slotUsers[slotId] || []
          }
        })
      }
    })

    let bestSlot = { timeText: '', dateText: '', rangeText: '', count: 0, percent: 0, slotId: '' }
    if (bestSlots[0]) {
      const parsedSlot = util.parseSlotId(bestSlots[0].slotId)
      const date = new Date(parsedSlot.date)
      const dateText = `${date.getMonth() + 1}月${date.getDate()}日 ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]}`
      const rangeText = util.formatTimeSlot(parsedSlot.hour, granularity).replace('-', '–')
      bestSlot = {
        slotId: bestSlots[0].slotId,
        count: bestSlots[0].count,
        percent: participantCount ? Math.round(bestSlots[0].count / participantCount * 100) : 0,
        dateText,
        rangeText,
        timeText: `${dateText} · ${rangeText}`
      }
    }

    const participants = responses.map(response => ({
      ...response,
      nickname: response.nickname || '匿名用户',
      initial: (response.nickname || '匿名用户').slice(0, 1),
      slotCount: (response.slots || []).length,
      avatarColor: util.getAvatarColor(response.nickname || '匿名用户')
    }))
    const startText = util.formatDateShort(event.startDate)
    const endText = util.formatDateShort(event.endDate)

    this.setData({
      event: {
        ...event,
        expired: util.isExpired(event.expireAt),
        expireText: util.formatExpireTime(event.expireAt),
        dateRangeText: `${startText === endText ? startText : `${startText} ~ ${endText}`} · 每天 ${util.formatEventTimeWindow(event)}`
      },
      participantCount,
      bestSlot,
      dates,
      participants,
      isCreator: Boolean(result.isCreator),
      loading: false,
      loadError: false
    })
  },

  showSlotDetail(e) {
    const { slotId, date } = e.currentTarget.dataset
    const dateEntry = this.data.dates.find(item => item.date === date)
    const slot = dateEntry?.slots.find(item => item.slotId === slotId)
    if (!slot) return
    if (this.slotCloseTimer) clearTimeout(this.slotCloseTimer)
    this.setData({
      slotModalMounted: true,
      selectedSlotInfo: {
        slotId,
        dateText: `${dateEntry.dateText} ${dateEntry.weekday}`,
        timeText: slot.timeLabel,
        count: slot.count,
        users: slot.users
      }
    }, () => {
      wx.nextTick(() => this.setData({ showSlotModal: true }))
    })
  },

  closeSlotModal() {
    this.setData({ showSlotModal: false })
    if (this.slotCloseTimer) clearTimeout(this.slotCloseTimer)
    this.slotCloseTimer = setTimeout(() => {
      this.setData({ slotModalMounted: false })
      this.slotCloseTimer = null
    }, 220)
  },

  onUnload() {
    if (this.slotCloseTimer) clearTimeout(this.slotCloseTimer)
  },

  preventMove() {},

  goToVote() {
    wx.redirectTo({ url: `/pages/vote/vote?id=${this.data.eventId}` })
  },

  goToPoster() {
    wx.navigateTo({ url: `/pages/poster/poster?id=${this.data.eventId}` })
  },

  async notifyParticipants() {
    if (this.data.notifying || !this.data.bestSlot.timeText) return
    const modal = await wx.showModal({
      title: '通知参与者？',
      content: `最佳时间是 ${this.data.bestSlot.timeText}`,
      confirmText: '发送',
      confirmColor: '#b83a2d'
    })
    if (!modal.confirm) return

    this.setData({ notifying: true })
    try {
      const response = await wx.cloud.callFunction({
        name: 'sendNotification',
        data: {
          type: 'result_ready',
          eventId: this.data.eventId,
          broadcast: true
        }
      })
      if (!response.result?.success) throw new Error(response.result?.error || '发送失败')
      const { successCount = 0, failCount = 0 } = response.result
      wx.showToast({ title: `成功 ${successCount}，失败 ${failCount}`, icon: 'none' })
      notificationUtil.saveLocalNotification('result_notified', {
        eventName: this.data.event?.name || '聚会',
        bestTime: this.data.bestSlot.timeText,
        successCount,
        failCount
      })
    } catch (err) {
      wx.showToast({ title: err.message || '发送失败', icon: 'none' })
    } finally {
      this.setData({ notifying: false })
    }
  },

  async deleteEvent() {
    if (this.data.deleting) return
    const modal = await wx.showModal({
      title: '删除聚会？',
      content: '删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#b83a2d'
    })
    if (!modal.confirm) return

    this.setData({ deleting: true })
    try {
      const response = await wx.cloud.callFunction({
        name: 'deleteEvent',
        data: { eventId: this.data.eventId }
      })
      if (!response.result?.success) throw new Error(response.result?.error || '删除失败')
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 800)
    } catch (err) {
      wx.showToast({ title: err.message || '删除失败', icon: 'none' })
    } finally {
      this.setData({ deleting: false })
    }
  },

  onShareAppMessage() {
    return {
      title: `${this.data.participantCount} 人正在选「${this.data.event?.name || '聚会'}」的时间`,
      path: `/pages/vote/vote?id=${this.data.eventId}`
    }
  }
})
