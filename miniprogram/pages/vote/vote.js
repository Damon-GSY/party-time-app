// 投票页面逻辑
const util = require('../../utils/util')

Page({
  data: {
    eventId: '',
    event: null,
    loading: true,
    expired: false,
    participantCount: 0,

    // 用户输入
    nickname: '',

    // 日期数据
    dates: [],
    currentDateIndex: 0,
    currentSlots: [],

    // 时间标签
    timeLabels: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22'],

    // 选择状态
    slots: {}, // { '2024-03-23_0': true, ... }
    selectedCount: 0,

    // 提交状态
    submitting: false,
    showSuccess: false
  },

  onLoad(options) {
    const { id } = options
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    this.setData({ eventId: id })
    this.loadEvent(id)
  },

  // 加载活动数据
  async loadEvent(eventId) {
    try {
      // 尝试从云开发获取数据
      if (wx.cloud) {
        const db = wx.cloud.database()
        const eventRes = await db.collection('events').doc(eventId).get()

        if (!eventRes.data) {
          throw new Error('活动不存在')
        }

        const event = eventRes.data

        // 检查是否过期
        if (util.isExpired(event.expireAt)) {
          this.setData({ loading: false, expired: true, event })
          return
        }

        // 获取参与人数
        const countRes = await db.collection('responses')
          .where({ eventId })
          .count()

        // 检查用户是否已填写
        const userRes = await db.collection('responses')
          .where({
            eventId,
            _openid: '{openid}'
          })
          .get()

        let existingSlots = {}
        let existingNickname = ''

        if (userRes.data && userRes.data.length > 0) {
          const userData = userRes.data[0]
          existingNickname = userData.nickname || ''
          if (userData.slots) {
            userData.slots.forEach(slot => {
              existingSlots[slot] = true
            })
          }
        }

        this.initEventData(event, countRes.total, existingNickname, existingSlots)
      } else {
        // 开发环境使用模拟数据
        this.initMockData()
      }
    } catch (err) {
      console.error('加载活动失败', err)
      // 使用模拟数据
      this.initMockData()
    }
  },

  // 初始化模拟数据
  initMockData() {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const formatDate = (d) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    const event = {
      _id: 'demo123',
      name: '周末聚餐 🍲',
      startDate: formatDate(today),
      endDate: formatDate(tomorrow),
      granularity: 'twoHours',
      note: '地点待定，选好时间后大家一起商量～'
    }

    this.initEventData(event, 5, '', {})
  },

  // 初始化活动数据
  initEventData(event, participantCount, nickname, existingSlots) {
    // 生成日期数组
    const dates = this.generateDates(event.startDate, event.endDate)

    // 生成所有时段
    const allSlots = this.generateAllSlots(dates, event.granularity)

    // 合并已有选择
    const slots = { ...existingSlots }

    // 计算已选数量
    const selectedCount = Object.keys(slots).filter(k => slots[k]).length

    // 日期范围文本
    const startDateText = util.formatDateShort(event.startDate)
    const endDateText = util.formatDateShort(event.endDate)
    const dateRangeText = startDateText === endDateText
      ? startDateText
      : `${startDateText} ~ ${endDateText}`

    this.setData({
      event: {
        ...event,
        dateRangeText
      },
      dates,
      slots,
      selectedCount,
      participantCount,
      nickname,
      loading: false
    })

    // 设置当前显示的时段
    this.setCurrentSlots(0)
  },

  // 生成日期数组
  generateDates(startDate, endDate) {
    const dates = []
    const start = new Date(startDate)
    const end = new Date(endDate)
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

    let current = new Date(start)
    while (current <= end) {
      dates.push({
        date: this.formatDate(current),
        weekday: weekdays[current.getDay()],
        day: current.getDate()
      })
      current.setDate(current.getDate() + 1)
    }

    return dates
  },

  // 格式化日期
  formatDate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  // 生成所有时段
  generateAllSlots(dates, granularity) {
    const slots = {}
    let slotCount = 12 // 默认2小时粒度，12个时段

    if (granularity === 'hour') slotCount = 24
    if (granularity === 'halfDay') slotCount = 4

    dates.forEach(date => {
      for (let i = 0; i < slotCount; i++) {
        const key = `${date.date}_${i}`
        slots[key] = false
      }
    })

    return slots
  },

  // 设置当前显示的时段
  setCurrentSlots(index) {
    const { dates, slots } = this.data
    const date = dates[index]
    const currentSlots = []

    // 根据粒度生成时段（默认2小时，12个时段）
    for (let i = 0; i < 12; i++) {
      const id = `${date.date}_${i}`
      currentSlots.push({
        id,
        selected: slots[id] || false
      })
    }

    this.setData({
      currentDateIndex: index,
      currentSlots
    })
  },

  // 切换日期
  switchDate(e) {
    const { index } = e.currentTarget.dataset
    this.setCurrentSlots(index)
  },

  // 切换时段选择
  toggleSlot(e) {
    const { index } = e.currentTarget.dataset
    const { currentSlots, slots } = this.data
    const slot = currentSlots[index]

    // 切换状态
    const newSelected = !slot.selected
    const newSlots = { ...slots, [slot.id]: newSelected }
    const newCurrentSlots = [...currentSlots]
    newCurrentSlots[index] = { ...slot, selected: newSelected }

    // 计算新的选中数量
    const selectedCount = Object.keys(newSlots).filter(k => newSlots[k]).length

    this.setData({
      slots: newSlots,
      currentSlots: newCurrentSlots,
      selectedCount
    })

    // 触觉反馈
    wx.vibrateShort({ type: 'light' })
  },

  // 清空选择
  clearSelection() {
    const { currentSlots, dates } = this.data

    // 清空当前日期的选择
    const newSlots = { ...this.data.slots }
    currentSlots.forEach(slot => {
      newSlots[slot.id] = false
    })

    const newCurrentSlots = currentSlots.map(s => ({ ...s, selected: false }))
    const selectedCount = Object.keys(newSlots).filter(k => newSlots[k]).length

    this.setData({
      slots: newSlots,
      currentSlots: newCurrentSlots,
      selectedCount
    })
  },

  // 全选当前日期
  selectAll() {
    const { currentSlots } = this.data

    const newSlots = { ...this.data.slots }
    currentSlots.forEach(slot => {
      newSlots[slot.id] = true
    })

    const newCurrentSlots = currentSlots.map(s => ({ ...s, selected: true }))
    const selectedCount = Object.keys(newSlots).filter(k => newSlots[k]).length

    this.setData({
      slots: newSlots,
      currentSlots: newCurrentSlots,
      selectedCount
    })
  },

  // 昵称输入
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  // 提交
  async handleSubmit() {
    const { selectedCount, submitting, eventId, nickname, slots } = this.data

    if (submitting || selectedCount === 0) return

    this.setData({ submitting: true })

    // 收集选中的时段
    const selectedSlots = Object.keys(slots).filter(k => slots[k])

    try {
      if (wx.cloud) {
        // 调用云函数提交
        const res = await wx.cloud.callFunction({
          name: 'submitResponse',
          data: {
            eventId,
            nickname: nickname.trim() || '匿名用户',
            slots: selectedSlots
          }
        })

        if (res.result && res.result.success) {
          this.showSuccessModal()
        } else {
          throw new Error(res.result?.error || '提交失败')
        }
      } else {
        // 模拟成功
        this.showSuccessModal()
      }
    } catch (err) {
      console.error('提交失败', err)
      wx.showToast({
        title: err.message || '提交失败',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 显示成功弹窗
  showSuccessModal() {
    this.setData({ showSuccess: true })
    wx.vibrateShort({ type: 'medium' })
  },

  // 关闭成功弹窗
  closeSuccess() {
    this.setData({ showSuccess: false })
  },

  // 阻止滚动穿透
  preventMove() {},

  // 跳转到结果页
  goToResult() {
    const { eventId } = this.data
    wx.redirectTo({
      url: `/pages/result/result?id=${eventId}`
    })
  },

  // 分享
  onShareAppMessage() {
    const { event } = this.data
    return {
      title: `来选一下「${event?.name || '聚会'}」的时间吧`,
      path: `/pages/vote/vote?id=${this.data.eventId}`
    }
  }
})
