const util = require('../../utils/util')

Page({
  data: {
    name: '',
    startDate: '',
    endDate: '',
    today: '',
    dateCount: 0,
    granularity: 'twoHours',
    expireType: '7days',
    note: '',
    canSubmit: false,
    submitting: false,
    createdEventId: '', // 存储创建成功的活动ID，用于分享
    showForm: false,    // 控制入场动画
    focusedField: ''    // 当前聚焦的输入字段
  },

  onLoad() {
    // 设置今天的日期
    const today = util.formatDate(new Date())

    // 下一帧触发入场动画，确保 DOM 已渲染
    this.setData({ today }, () => {
      setTimeout(() => {
        this.setData({ showForm: true })
      }, 50)
    })
  },

  // 输入聚会名称
  onNameInput(e) {
    const name = e.detail.value
    this.setData({ name })
    this.checkCanSubmit()
  },

  // 选择开始日期
  onStartDateChange(e) {
    const startDate = e.detail.value
    let { endDate } = this.data

    // 如果结束日期早于开始日期，重置结束日期
    if (endDate && endDate < startDate) {
      endDate = startDate
    }

    this.setData({ startDate, endDate })
    this.calculateDateCount()
    this.checkCanSubmit()
  },

  // 选择结束日期
  onEndDateChange(e) {
    const endDate = e.detail.value
    this.setData({ endDate })
    this.calculateDateCount()
    this.checkCanSubmit()
  },

  // 计算日期天数
  calculateDateCount() {
    const { startDate, endDate } = this.data
    if (!startDate || !endDate) {
      this.setData({ dateCount: 0 })
      return
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    const diff = end - start
    const days = Math.floor(diff / (24 * 60 * 60 * 1000)) + 1

    this.setData({ dateCount: days })
  },

  // 选择时段粒度
  selectGranularity(e) {
    const granularity = e.currentTarget.dataset.value
    this.setData({ granularity })
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

  // 检查是否可以提交
  checkCanSubmit() {
    const { name, startDate, endDate } = this.data
    const canSubmit = name.trim() && startDate && endDate
    this.setData({ canSubmit })
  },

  // 提交表单
  async handleSubmit() {
    if (!this.data.canSubmit || this.data.submitting) {
      return
    }

    this.setData({ submitting: true })

    try {
      const { name, startDate, endDate, granularity, expireType, note } = this.data

      // 调用云函数创建聚会
      const res = await wx.cloud.callFunction({
        name: 'createEvent',
        data: {
          name: name.trim(),
          startDate,
          endDate,
          granularity,
          expireType,
          note: note.trim()
        }
      })

      if (res.result && res.result.success) {
        const eventId = res.result.eventId

        // 存储活动ID用于分享
        this.setData({ createdEventId: eventId })

        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })

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
      this.setData({ submitting: false })
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
