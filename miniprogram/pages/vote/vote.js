const util = require('../../utils/util')
const userUtil = require('../../utils/user')
const notificationUtil = require('../../utils/notification')

Page({
  data: {
    eventId: '',
    event: null,
    loading: true,
    loadError: false,
    expired: false,
    isCreator: false,
    participantCount: 0,
    nickname: '',
    dates: [],
    currentDateIndex: 0,
    currentSlots: [],
    granularity: 'twoHours',
    slotsPerDay: 12,
    slots: {},
    selectedCount: 0,
    currentSelectedCount: 0,
    allCurrentSelected: false,
    submitting: false,
    showSuccess: false,
    subscribeRequested: false,
    notificationsConfigured: notificationUtil.isConfigured('result_ready'),
    gridVisible: true
  },

  onLoad(options) {
    const { id } = options
    if (!id || typeof id !== 'string' || id.length > 128) {
      wx.showToast({ title: '活动链接无效', icon: 'none' })
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) wx.navigateBack()
        else wx.switchTab({ url: '/pages/index/index' })
      }, 1200)
      return
    }

    this.setData({ eventId: id })
    this.loadEvent(id)
  },

  async loadEvent(eventId) {
    this.setData({ loading: true, loadError: false })
    try {
      if (!wx.cloud) {
        this.initMockData()
        return
      }

      const response = await wx.cloud.callFunction({
        name: 'getEventResult',
        data: { eventId }
      })
      if (!response.result?.success) {
        throw new Error(response.result?.error || '活动加载失败')
      }

      const result = response.result.data
      const existingSlots = {}
      ;(result.myResponse?.slots || []).forEach(slotId => { existingSlots[slotId] = true })
      this.initEventData(
        result.event,
        result.participantCount || 0,
        result.myResponse?.nickname || '',
        existingSlots,
        Boolean(result.isCreator)
      )
    } catch (err) {
      console.error('[vote] load event failed', err)
      this.setData({ loading: false, loadError: true })
    }
  },

  retryLoad() {
    this.loadEvent(this.data.eventId)
  },

  initMockData() {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    this.initEventData({
      _id: 'demo123',
      name: '周末聚餐',
      startDate: util.formatDate(today),
      endDate: util.formatDate(tomorrow),
      granularity: 'twoHours',
      note: '地点待定，选好时间后一起确认。'
    }, 3, '', {}, false)
  },

  initEventData(event, participantCount, nickname, existingSlots, isCreator) {
    if (util.isExpired(event.expireAt)) {
      this.setData({ event, participantCount, expired: true, loading: false })
      return
    }

    const granularity = event.granularity || 'twoHours'
    const slotConfig = util.getTimeSlotConfig(granularity)
    const dates = util.generateDateRange(event.startDate, event.endDate).map(date => {
      const parsed = new Date(date)
      return {
        date,
        weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parsed.getDay()],
        day: parsed.getDate()
      }
    })
    const startText = util.formatDateShort(event.startDate)
    const endText = util.formatDateShort(event.endDate)
    const selectedCount = Object.values(existingSlots).filter(Boolean).length
    const cachedNickname = userUtil.getNickname()

    this.setData({
      event: {
        ...event,
        dateRangeText: startText === endText ? startText : `${startText} ~ ${endText}`
      },
      dates,
      granularity,
      slotsPerDay: slotConfig.length,
      slots: existingSlots,
      selectedCount,
      participantCount,
      nickname: nickname || (cachedNickname === '匿名用户' ? '' : cachedNickname),
      isCreator,
      loading: false,
      expired: false
    })
    this.setCurrentSlots(0)
  },

  setCurrentSlots(index) {
    const date = this.data.dates[index]
    if (!date) return
    const currentSlots = util.getTimeSlotConfig(this.data.granularity).map(slot => {
      const id = util.generateSlotId(date.date, slot.index)
      return {
        id,
        index: slot.index,
        selected: Boolean(this.data.slots[id]),
        timeLabel: slot.label,
        shortLabel: slot.shortLabel
      }
    })
    const currentSelectedCount = currentSlots.filter(slot => slot.selected).length
    this.setData({
      currentDateIndex: Number(index),
      currentSlots,
      currentSelectedCount,
      allCurrentSelected: currentSlots.length > 0 && currentSelectedCount === currentSlots.length
    })
  },

  switchDate(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === this.data.currentDateIndex) return
    this.setData({ gridVisible: false })
    setTimeout(() => {
      this.setCurrentSlots(index)
      this.setData({ gridVisible: true })
    }, 100)
  },

  toggleSlot(e) {
    const index = Number(e.currentTarget.dataset.index)
    const slot = this.data.currentSlots[index]
    if (!slot) return
    const slots = { ...this.data.slots, [slot.id]: !slot.selected }
    this.setData({ slots })
    this.updateSelectionState()
    try { wx.vibrateShort({ type: 'light' }) } catch (err) {}
  },

  selectAll() {
    const slots = { ...this.data.slots }
    this.data.currentSlots.forEach(slot => { slots[slot.id] = true })
    this.setData({ slots })
    this.updateSelectionState()
  },

  clearSelection() {
    const slots = { ...this.data.slots }
    this.data.currentSlots.forEach(slot => { slots[slot.id] = false })
    this.setData({ slots })
    this.updateSelectionState()
  },

  updateSelectionState() {
    const selectedCount = Object.values(this.data.slots).filter(Boolean).length
    this.setCurrentSlots(this.data.currentDateIndex)
    this.setData({ selectedCount })
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  async handleSubmit() {
    const { selectedCount, submitting, eventId, nickname, slots } = this.data
    if (submitting || selectedCount === 0) return
    const selectedSlots = Object.keys(slots).filter(slotId => slots[slotId])
    this.setData({ submitting: true })

    try {
      if (wx.cloud) {
        const response = await wx.cloud.callFunction({
          name: 'submitResponse',
          data: {
            eventId,
            nickname: nickname.trim() || '匿名用户',
            slots: selectedSlots
          }
        })
        if (!response.result?.success) throw new Error(response.result?.error || '提交失败')
      }
      if (nickname.trim()) userUtil.updateUserInfo({ customNickname: nickname.trim() })
      this.showSuccessModal()
    } catch (err) {
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  showSuccessModal() {
    this.setData({ showSuccess: true })
    try { wx.vibrateShort({ type: 'medium' }) } catch (err) {}
    notificationUtil.saveLocalNotification('vote_submitted', {
      eventName: this.data.event?.name || '聚会'
    })
  },

  async requestSubscribe() {
    this.setData({ subscribeRequested: true })
    const result = await notificationUtil.subscribeAll()
    if (result === 'accepted') wx.showToast({ title: '已开启提醒', icon: 'success' })
    else if (result === 'rejected') wx.showToast({ title: '可在设置中开启', icon: 'none' })
  },

  closeSuccess() {
    this.setData({ showSuccess: false })
  },

  preventMove() {},

  goToResult() {
    const created = this.data.isCreator ? '&created=1' : ''
    wx.redirectTo({ url: `/pages/result/result?id=${this.data.eventId}${created}` })
  },

  onShareAppMessage() {
    return {
      title: `${this.data.participantCount} 人正在选「${this.data.event?.name || '聚会'}」的时间`,
      path: `/pages/vote/vote?id=${this.data.eventId}`
    }
  }
})
