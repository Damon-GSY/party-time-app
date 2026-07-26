const util = require('../../utils/util')
const notificationUtil = require('../../utils/notification')

Page({
  data: {
    name: '',
    startDate: '',
    endDate: '',
    today: '',
    dateCount: 0,
    startHour: 10,
    endHour: 22,
    startHourOptions: [],
    endHourOptions: [],
    startHourIndex: 0,
    endHourIndex: 0,
    expireType: '7days',
    note: '',
    canSubmit: false,
    submitting: false,
    createdEventId: '',
    focusedField: '',
    formError: ''
  },

  onLoad() {
    // 设置今天的日期
    const today = util.formatDate(new Date())

    this.setData({ today, ...this.buildTimeWindowData(10, 22) })
  },

  buildTimeWindowData(startHour, endHour) {
    const aligned = util.alignTimeWindow(startHour, endHour, 'hour')
    const { startOptions, endOptions } = util.getTimeWindowOptions('hour')
    return {
      startHour: aligned.startHour,
      endHour: aligned.endHour,
      startHourOptions: startOptions,
      endHourOptions: endOptions,
      startHourIndex: Math.max(0, startOptions.findIndex(option => option.value === aligned.startHour)),
      endHourIndex: Math.max(0, endOptions.findIndex(option => option.value === aligned.endHour))
    }
  },

  // 输入聚会名称
  onNameInput(e) {
    const name = e.detail.value
    this.setData({ name }, () => this.checkCanSubmit())
  },

  // 选择开始日期
  onStartDateChange(e) {
    const startDate = e.detail.value
    let { endDate } = this.data

    // 如果结束日期早于开始日期，重置结束日期
    if (endDate && endDate < startDate) {
      endDate = startDate
    }

    this.setData({ startDate, endDate }, () => this.checkCanSubmit())
  },

  // 选择结束日期
  onEndDateChange(e) {
    const endDate = e.detail.value
    this.setData({ endDate }, () => this.checkCanSubmit())
  },

  onStartHourChange(e) {
    const option = this.data.startHourOptions[Number(e.detail.value)]
    if (!option) return
    const endHour = option.value >= this.data.endHour
      ? Math.min(24, option.value + 1)
      : this.data.endHour
    this.setData(this.buildTimeWindowData(option.value, endHour))
  },

  onEndHourChange(e) {
    const option = this.data.endHourOptions[Number(e.detail.value)]
    if (!option) return
    const startHour = option.value <= this.data.startHour
      ? Math.max(0, option.value - 1)
      : this.data.startHour
    this.setData(this.buildTimeWindowData(startHour, option.value))
  },

  // 选择过期时间
  selectExpire(e) {
    const expireType = e.currentTarget.dataset.value
    this.setData({ expireType })
  },

  // 输入备注
  onNoteInput(e) {
    const note = e.detail.value
    this.setData({ note })
  },

  // 输入框聚焦
  onInputFocus(e) {
    const field = e.currentTarget.dataset.field || 'unknown'
    this.setData({ focusedField: field })
  },

  // 输入框失焦
  onInputBlur() {
    this.setData({ focusedField: '' })
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/index/index' })
  },

  // 检查是否可以提交
  checkCanSubmit() {
    const { name, startDate, endDate } = this.data
    const startTimestamp = startDate ? Date.parse(`${startDate}T00:00:00Z`) : NaN
    const endTimestamp = endDate ? Date.parse(`${endDate}T00:00:00Z`) : NaN
    const dateCount = Number.isFinite(startTimestamp) && Number.isFinite(endTimestamp)
      ? Math.floor((endTimestamp - startTimestamp) / 86400000) + 1
      : 0
    let formError = ''
    if (startDate && endDate && endDate < startDate) formError = '结束日期不能早于开始日期'
    else if (dateCount > 31) formError = '日期范围最多 31 天'
    const canSubmit = Boolean(name.trim() && startDate && endDate && !formError)
    this.setData({ dateCount, canSubmit, formError })
  },

  // 提交表单
  async handleSubmit() {
    if (!this.data.canSubmit || this.data.submitting) {
      return
    }

    this.setData({ submitting: true })

    let awaitingRedirect = false
    try {
      const { name, startDate, endDate, startHour, endHour, expireType, note } = this.data

      // 调用云函数创建聚会
      const res = await wx.cloud.callFunction({
        name: 'createEvent',
        data: {
          name: name.trim(),
          startDate,
          endDate,
          granularity: 'hour',
          dailyTimeWindow: {
            startMinute: startHour * 60,
            endMinute: endHour * 60
          },
          expireType,
          note: note.trim()
        }
      })

      if (res.result && res.result.success) {
        awaitingRedirect = true
        const eventId = res.result.eventId

        // 存储活动ID用于分享
        this.setData({ createdEventId: eventId })

        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })

        // 引导创建者开启通知提醒
        notificationUtil.subscribeAll().catch(() => {})

        // 跳转到投票页面让创建者填写时间
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/vote/vote?id=${eventId}`
          })
        }, 1500)
      } else {
        throw new Error(res.result?.error || '创建失败')
      }
    } catch (err) {
      // 开发环境模拟成功
      if (!wx.cloud) {
        awaitingRedirect = true
        wx.showToast({
          title: '创建成功（模拟）',
          icon: 'success'
        })

        setTimeout(() => {
          wx.redirectTo({
            url: '/pages/result/result?id=demo123&created=1'
          })
        }, 1500)
        return
      }

      wx.showToast({
        title: err.message || '创建失败',
        icon: 'none'
      })
    } finally {
      if (!awaitingRedirect) this.setData({ submitting: false })
    }
  },

  // 分享
  onShareAppMessage() {
    const { name, createdEventId } = this.data
    return {
      title: `来帮我选个时间：${name}`,
      path: createdEventId
        ? `/pages/vote/vote?id=${createdEventId}`
        : '/pages/index/index'
    }
  }
})
