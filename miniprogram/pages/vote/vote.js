// 投票页面逻辑
const util = require('../../utils/util')
const userUtil = require('../../utils/user')
const app = getApp()

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

    // 时间标签（根据粒度动态计算）
    timeLabels: [],
    // 时段粒度
    granularity: 'twoHours',
    // 每个日期的时段数量
    slotsPerDay: 12,

    // 选择状态
    slots: {}, // { '2024-03-23_0': true, ... }
    selectedCount: 0,
    displayCount: 0, // 数字动画用的显示值

    // 提交状态
    submitting: false,
    showSuccess: false,
    countAnimated: false,
    subscribeRequested: false,  // 是否已请求订阅

    // 动画状态
    gridVisible: true,        // 日期切换过渡
    animatingSlotIndex: -1,   // 当前正在动画的格子索引
    animatingSlotAction: '',  // 'select' | 'deselect'
  },

  onLoad(options) {
    const { id } = options
    // 参数验证
    if (!id || typeof id !== 'string' || id.length < 5) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.redirectTo({ url: '/pages/index/index' })
        }
      }, 1500)
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

    // 根据粒度计算时段数量和时间标签
    const granularity = event.granularity || 'twoHours'
    let slotsPerDay = 12
    let timeLabels = []

    if (granularity === 'hour') {
      slotsPerDay = 24
      timeLabels = ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22']
    } else if (granularity === 'twoHours') {
      slotsPerDay = 12
      timeLabels = ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22']
    } else if (granularity === 'halfDay') {
      slotsPerDay = 4
      timeLabels = ['上午', '下午', '晚上', '深夜']
    }

    // 生成所有时段
    const allSlots = this.generateAllSlots(dates, granularity)

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
      displayCount: selectedCount, // 初始显示值
      participantCount,
      nickname,
      granularity,
      slotsPerDay,
      timeLabels,
      loading: false
    })

    // 如果用户没有设置过昵称，自动填充缓存的昵称
    if (!nickname) {
      const cachedNickname = userUtil.getNickname()
      if (cachedNickname && cachedNickname !== '匿名用户') {
        this.setData({ nickname: cachedNickname })
      }
    }

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
    else if (granularity === 'halfDay') slotCount = 4
    else slotCount = 12 // twoHours

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
    const { dates, slots, slotsPerDay, granularity } = this.data
    const date = dates[index]
    const currentSlots = []

    // 根据粒度生成时段，显示时间标签
    for (let i = 0; i < slotsPerDay; i++) {
      const id = `${date.date}_${i}`
      currentSlots.push({
        id,
        selected: slots[id] || false,
        timeLabel: util.formatTimeSlot(i, granularity)
      })
    }

    this.setData({
      currentDateIndex: index,
      currentSlots
    })
  },

  // 切换日期（带过渡动画）
  switchDate(e) {
    const { index } = e.currentTarget.dataset
    if (index === this.data.currentDateIndex) return

    // 先淡出
    this.setData({ gridVisible: false })

    // 100ms 后切换数据并淡入
    setTimeout(() => {
      this.setCurrentSlots(index)
      this.setData({ gridVisible: true })
    }, 100)
  },

  // 切换时段选择（带动画反馈）
  toggleSlot(e) {
    const { index } = e.currentTarget.dataset
    const { currentSlots, selectedCount } = this.data
    const slot = currentSlots[index]
    const newSelected = !slot.selected

    // 设置动画状态
    const animAction = newSelected ? 'select' : 'deselect'
    this.setData({
      [`slots.${slot.id}`]: newSelected,
      [`currentSlots[${index}].selected`]: newSelected,
      selectedCount: selectedCount + (newSelected ? 1 : -1),
      animatingSlotIndex: index,
      animatingSlotAction: animAction
    })

    // 延迟清除动画状态（让动画播放完）
    setTimeout(() => {
      this.setData({
        animatingSlotIndex: -1,
        animatingSlotAction: ''
      })
    }, 350)

    // 数字动画
    const oldCount = selectedCount
    const newCount = selectedCount + (newSelected ? 1 : -1)
    this.animateCount(oldCount, newCount)

    // 触觉反馈
    try {
      wx.vibrateShort({ type: 'light' })
    } catch (e) {}
  },

  // 数字动画：从旧值逐步变化到新值
  animateCount(from, to) {
    if (from === to) return

    const step = from < to ? 1 : -1
    const totalSteps = Math.abs(to - from)
    const interval = Math.max(30, Math.min(80, 300 / totalSteps))

    let current = from
    clearInterval(this._countTimer)
    this._countTimer = setInterval(() => {
      current += step
      this.setData({ displayCount: current })
      if (current === to) {
        clearInterval(this._countTimer)
        this._countTimer = null
      }
    }, interval)
  },

  // 清空选择（多米诺效果）
  clearSelection() {
    const { currentSlots } = this.data

    currentSlots.forEach((slot, index) => {
      if (slot.selected) {
        setTimeout(() => {
          this.setData({
            [`slots.${slot.id}`]: false,
            [`currentSlots[${index}].selected`]: false,
            animatingSlotIndex: index,
            animatingSlotAction: 'deselect'
          })
          setTimeout(() => {
            if (this.data.animatingSlotIndex === index) {
              this.setData({ animatingSlotIndex: -1, animatingSlotAction: '' })
            }
          }, 350)
        }, index * 30)
      }
    })

    const totalSelected = currentSlots.length
    setTimeout(() => {
      const newSlots = { ...this.data.slots }
      currentSlots.forEach(slot => { newSlots[slot.id] = false })
      const selectedCount = Object.keys(newSlots).filter(k => newSlots[k]).length
      const oldCount = this.data.selectedCount
      this.setData({ selectedCount })
      this.animateCount(oldCount, selectedCount)
    }, totalSelected * 30 + 50)
  },

  // 全选当前日期（波浪效果）
  selectAll() {
    const { currentSlots } = this.data

    currentSlots.forEach((slot, index) => {
      if (!slot.selected) {
        setTimeout(() => {
          this.setData({
            [`slots.${slot.id}`]: true,
            [`currentSlots[${index}].selected`]: true,
            animatingSlotIndex: index,
            animatingSlotAction: 'select'
          })
          setTimeout(() => {
            if (this.data.animatingSlotIndex === index) {
              this.setData({ animatingSlotIndex: -1, animatingSlotAction: '' })
            }
          }, 350)
        }, index * 30)
      }
    })

    const totalSlots = currentSlots.length
    setTimeout(() => {
      const newSlots = { ...this.data.slots }
      currentSlots.forEach(slot => { newSlots[slot.id] = true })
      const selectedCount = Object.keys(newSlots).filter(k => newSlots[k]).length
      const oldCount = this.data.selectedCount
      this.setData({ selectedCount })
      this.animateCount(oldCount, selectedCount)
    }, totalSlots * 30 + 50)
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

    // 记录本地通知（有人参与）
    notificationUtil.saveLocalNotification('new_participant', {
      participantName: this.data.nickname || '匿名用户',
      eventName: this.data.event?.name || '聚会'
    })
  },

  // 开启提醒
  async requestSubscribe() {
    this.setData({ subscribeRequested: true })
    const result = await notificationUtil.subscribeAll()
    if (result === 'accepted') {
      wx.showToast({ title: '已开启提醒', icon: 'success' })
    } else if (result === 'rejected') {
      wx.showToast({ title: '可在设置中开启', icon: 'none' })
    }
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
    const { event, participantCount } = this.data
    return {
      title: `${participantCount}人正在选「${event?.name || '聚会'}」的时间，来投票吧！`,
      path: `/pages/vote/vote?id=${this.data.eventId}`
    }
  },

  onUnload() {
    if (this._countTimer) {
      clearInterval(this._countTimer)
      this._countTimer = null
    }
  }
})
