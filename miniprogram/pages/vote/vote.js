// 投票页面逻辑 - 三态偏好版本
const util = require('../../utils/util')
const userUtil = require('../../utils/user')
const { animateNumber } = require('../../utils/ui-effects')
const app = getApp()

// 偏好分值常量
const SCORE_NONE = 0    // 未选
const SCORE_RELUCTANT = 1 // 勉强
const SCORE_AVAILABLE = 2 // 有空

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

    // 选择状态 - 三态：0=未选, 1=勉强, 2=有空
    slots: {},
    availableCount: 0,   // 有空数量
    reluctantCount: 0,   // 勉强数量
    displayCount: 0,     // 数字动画用的显示值（总数）
    counterPercent: 0,

    // 提交状态
    submitting: false,
    showSuccess: false,
    countAnimated: false,
    subscribeRequested: false,

    // 动画状态
    gridVisible: true,
    animatingSlotIndex: -1,
    animatingSlotAction: '',  // 'select' | 'deselect'

    // 浮现状态文字
    floatingSlotIndex: -1,
    floatingText: '',

    // 首次使用引导
    showGuide: false,
    guideAnimStep: 0,
  },

  onLoad(options) {
    const { id } = options
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
      if (wx.cloud) {
        const db = wx.cloud.database()
        const eventRes = await db.collection('events').doc(eventId).get()

        if (!eventRes.data) {
          throw new Error('活动不存在')
        }

        const event = eventRes.data

        if (util.isExpired(event.expireAt)) {
          this.setData({ loading: false, expired: true, event })
          return
        }

        const countRes = await db.collection('responses')
          .where({ eventId })
          .count()

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
          // 兼容旧格式：数组 → { slotId: 2 }
          if (userData.slots) {
            if (Array.isArray(userData.slots)) {
              userData.slots.forEach(slot => {
                existingSlots[slot] = SCORE_AVAILABLE
              })
            } else if (typeof userData.slots === 'object') {
              // 新格式已经是 { slotId: score }
              existingSlots = { ...userData.slots }
            }
          }
        }

        this.initEventData(event, countRes.total, existingNickname, existingSlots)
      } else {
        this.initMockData()
      }
    } catch (err) {
      this.initMockData()
    }
  },

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
      name: '周末聚餐',
      startDate: formatDate(today),
      endDate: formatDate(tomorrow),
      granularity: 'twoHours',
      note: '地点待定，选好时间后大家一起商量~'
    }

    this.initEventData(event, 5, '', {})
  },

  initEventData(event, participantCount, nickname, existingSlots) {
    const dates = this.generateDates(event.startDate, event.endDate)

    const granularity = event.granularity || 'twoHours'
    let slotsPerDay = 12
    let timeLabels = []

    if (granularity === 'hour') {
      slotsPerDay = 24
      timeLabels = []
      for (let i = 0; i < 24; i++) timeLabels.push(String(i))
    } else if (granularity === 'twoHours') {
      slotsPerDay = 12
      timeLabels = ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22']
    } else if (granularity === 'halfDay') {
      slotsPerDay = 4
      timeLabels = ['上午', '下午', '晚上', '深夜']
    }

    const slots = { ...existingSlots }

    // 统计有空和勉强数量
    const counts = this._countSlots(slots)

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
      availableCount: counts.available,
      reluctantCount: counts.reluctant,
      displayCount: counts.available + counts.reluctant,
      participantCount,
      nickname,
      granularity,
      slotsPerDay,
      timeLabels,
      loading: false
    })

    if (!nickname) {
      const cachedNickname = userUtil.getNickname()
      if (cachedNickname && cachedNickname !== '匿名用户') {
        this.setData({ nickname: cachedNickname })
      }
    }

    this.setCurrentSlots(0)

    // 首次使用引导
    this._checkShowGuide()
  },

  // 统计 slots 中的有空/勉强数量
  _countSlots(slots) {
    let available = 0
    let reluctant = 0
    Object.values(slots).forEach(score => {
      if (score === SCORE_AVAILABLE) available++
      else if (score === SCORE_RELUCTANT) reluctant++
    })
    return { available, reluctant }
  },

  // 检查是否显示首次引导
  _checkShowGuide() {
    try {
      const seen = wx.getStorageSync('vote_guide_seen')
      if (!seen) {
        this.setData({ showGuide: true, guideAnimStep: 0 })
        // 启动引导动画序列
        this._runGuideAnimation()
      }
    } catch (e) {}
  },

  // 引导动画序列
  _runGuideAnimation() {
    const steps = [1, 2, 3]
    let i = 0
    const run = () => {
      if (i >= steps.length) {
        // 循环演示
        i = 0
      }
      this.setData({ guideAnimStep: steps[i] })
      i++
      this._guideTimer = setTimeout(run, 1200)
    }
    this._guideTimer = setTimeout(run, 600)
  },

  // 关闭引导
  closeGuide() {
    if (this._guideTimer) {
      clearTimeout(this._guideTimer)
      this._guideTimer = null
    }
    this.setData({ showGuide: false })
    try {
      wx.setStorageSync('vote_guide_seen', true)
    } catch (e) {}
  },

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

  formatDate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  generateAllSlots(dates, granularity) {
    const slots = {}
    let slotCount = 12

    if (granularity === 'hour') slotCount = 24
    else if (granularity === 'halfDay') slotCount = 4
    else slotCount = 12

    dates.forEach(date => {
      for (let i = 0; i < slotCount; i++) {
        const key = `${date.date}_${i}`
        slots[key] = SCORE_NONE
      }
    })

    return slots
  },

  setCurrentSlots(index) {
    const { dates, slots, slotsPerDay, granularity } = this.data
    const date = dates[index]
    const currentSlots = []

    for (let i = 0; i < slotsPerDay; i++) {
      const id = `${date.date}_${i}`
      const score = slots[id] || SCORE_NONE
      currentSlots.push({
        id,
        score,
        timeLabel: util.formatTimeSlot(i, granularity)
      })
    }

    this.setData({
      currentDateIndex: index,
      currentSlots
    })
  },

  switchDate(e) {
    const { index } = e.currentTarget.dataset
    if (index === this.data.currentDateIndex) return

    this.setData({ gridVisible: false })

    setTimeout(() => {
      this.setCurrentSlots(index)
      this.setData({ gridVisible: true })
    }, 100)
  },

  // 三态循环点击：0 → 2 → 1 → 0
  toggleSlot(e) {
    if (this._animating) return
    const { index } = e.currentTarget.dataset
    const { currentSlots, slots, availableCount, reluctantCount } = this.data
    const slot = currentSlots[index]
    const currentScore = slot.score || SCORE_NONE

    // 循环：未选(0) → 有空(2) → 勉强(1) → 未选(0)
    let newScore
    if (currentScore === SCORE_NONE) newScore = SCORE_AVAILABLE
    else if (currentScore === SCORE_AVAILABLE) newScore = SCORE_RELUCTANT
    else newScore = SCORE_NONE

    // 更新计数
    let newAvailable = availableCount
    let newReluctant = reluctantCount

    if (currentScore === SCORE_AVAILABLE) newAvailable--
    if (currentScore === SCORE_RELUCTANT) newReluctant--
    if (newScore === SCORE_AVAILABLE) newAvailable++
    if (newScore === SCORE_RELUCTANT) newReluctant++

    const animAction = newScore > 0 ? 'select' : 'deselect'
    const floatingText = newScore === SCORE_AVAILABLE ? '有空' : (newScore === SCORE_RELUCTANT ? '勉强' : '')

    this.setData({
      [`slots.${slot.id}`]: newScore,
      [`currentSlots[${index}].score`]: newScore,
      availableCount: newAvailable,
      reluctantCount: newReluctant,
      animatingSlotIndex: index,
      animatingSlotAction: animAction,
      floatingSlotIndex: index,
      floatingText
    })

    // 清除动画状态
    setTimeout(() => {
      this.setData({
        animatingSlotIndex: -1,
        animatingSlotAction: '',
        floatingSlotIndex: -1,
        floatingText: ''
      })
    }, 800)

    // Ripple 效果
    if (e.changedTouches || e.touches) {
      const touch = e.changedTouches ? e.changedTouches[0] : e.touches[0]
      this.setData({
        [`currentSlots[${index}].rippleShow`]: true,
        [`currentSlots[${index}].rippleX`]: touch ? 44 : 0,
        [`currentSlots[${index}].rippleY`]: touch ? 44 : 0,
      })
      setTimeout(() => {
        this.setData({ [`currentSlots[${index}].rippleShow`]: false })
      }, 600)
    }

    // 数字动画
    const finalCount = newAvailable + newReluctant
    animateNumber(this, 'displayCount', finalCount, 400)

    // 进度条 - 双色（绿+黄）
    const total = this.data.currentSlots.length
    const greenPercent = Math.round(newAvailable / total * 100)
    const yellowPercent = Math.round(newReluctant / total * 100)
    this.setData({
      counterPercent: greenPercent + yellowPercent,
      counterGreenPercent: greenPercent,
      counterYellowPercent: yellowPercent
    })

    // 触觉反馈
    try {
      if (newScore === SCORE_AVAILABLE) {
        wx.vibrateShort({ type: 'light' })
      } else if (newScore === SCORE_RELUCTANT) {
        wx.vibrateShort({ type: 'medium' })
      }
    } catch (e) {}
  },

  // 清空当天（多米诺效果）
  clearSelection() {
    if (this._animating) return
    this._animating = true
    const { currentSlots } = this.data

    currentSlots.forEach((slot, index) => {
      const score = slot.score || SCORE_NONE
      if (score > SCORE_NONE) {
        setTimeout(() => {
          this.setData({
            [`slots.${slot.id}`]: SCORE_NONE,
            [`currentSlots[${index}].score`]: SCORE_NONE,
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

    const totalAnimated = currentSlots.length
    setTimeout(() => {
      const newSlots = { ...this.data.slots }
      currentSlots.forEach(slot => { newSlots[slot.id] = SCORE_NONE })
      const counts = this._countSlots(newSlots)
      const oldCount = this.data.availableCount + this.data.reluctantCount
      this.setData({
        availableCount: counts.available,
        reluctantCount: counts.reluctant
      })
      this._animateCount(oldCount, counts.available + counts.reluctant)
    }, totalAnimated * 30 + 50)
    setTimeout(() => { this._animating = false }, totalAnimated * 30 + 100)
  },

  // 全选当天为"有空"（波浪效果）
  selectAll() {
    if (this._animating) return
    this._animating = true
    const { currentSlots } = this.data

    currentSlots.forEach((slot, index) => {
      const score = slot.score || SCORE_NONE
      if (score !== SCORE_AVAILABLE) {
        setTimeout(() => {
          this.setData({
            [`slots.${slot.id}`]: SCORE_AVAILABLE,
            [`currentSlots[${index}].score`]: SCORE_AVAILABLE,
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
      currentSlots.forEach(slot => { newSlots[slot.id] = SCORE_AVAILABLE })
      const counts = this._countSlots(newSlots)
      const oldCount = this.data.availableCount + this.data.reluctantCount
      this.setData({
        availableCount: counts.available,
        reluctantCount: counts.reluctant
      })
      this._animateCount(oldCount, counts.available + counts.reluctant)
    }, totalSlots * 30 + 50)
    setTimeout(() => { this._animating = false }, totalSlots * 30 + 100)
  },

  // 数字动画
  _animateCount(from, to) {
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

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  // 提交 - 发送 { slotId: score } 格式
  async handleSubmit() {
    const { availableCount, reluctantCount, submitting, eventId, nickname, slots } = this.data
    const totalCount = availableCount + reluctantCount

    if (submitting || totalCount === 0) return

    this.setData({ submitting: true })

    // 只发送 score > 0 的时段
    const slotsObj = {}
    Object.entries(slots).forEach(([id, score]) => {
      if (score > 0) slotsObj[id] = score
    })

    try {
      if (wx.cloud) {
        const res = await wx.cloud.callFunction({
          name: 'submitResponse',
          data: {
            eventId,
            nickname: nickname.trim() || '匿名用户',
            slots: slotsObj  // 新格式：{ slotId: score }
          }
        })

        if (res.result && res.result.success) {
          this.showSuccessModal()
        } else {
          throw new Error(res.result?.error || '提交失败')
        }
      } else {
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

  showSuccessModal() {
    const { availableCount, reluctantCount } = this.data
    this.setData({
      showSuccess: true,
      successAvailable: availableCount,
      successReluctant: reluctantCount
    })
    wx.vibrateShort({ type: 'medium' })
  },

  async requestSubscribe() {
    this.setData({ subscribeRequested: true })
    try {
      const result = await new Promise((resolve) => {
        wx.requestSubscribeMessage({
          tmplIds: ['your_template_id'],
          success: res => resolve('accepted'),
          fail: () => resolve('rejected')
        })
      })
      if (result === 'accepted') {
        wx.showToast({ title: '已开启提醒', icon: 'success' })
      }
    } catch (e) {}
  },

  closeSuccess() {
    this.setData({ showSuccess: false })
  },

  preventMove() {},

  goToResult() {
    const { eventId } = this.data
    wx.redirectTo({
      url: `/pages/result/result?id=${eventId}`
    })
  },

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
    if (this._guideTimer) {
      clearTimeout(this._guideTimer)
      this._guideTimer = null
    }
  }
})
