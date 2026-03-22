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
    submitting: false
  },

  onLoad() {
    // 设置今天的日期
    const today = util.formatDate(new Date())
    this.setData({ today })
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

        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })

        // 跳转到分享页面
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/result/result?id=${eventId}&created=1`
          })
        }, 1500)
      } else {
        throw new Error(res.result?.error || '创建失败')
      }
    } catch (err) {
      console.error('创建聚会失败', err)

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
    return {
      title: `来帮我选个时间：${this.data.name}`,
      path: '/pages/index/index'
    }
  }
})
