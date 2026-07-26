const user = require('../../utils/user')
const util = require('../../utils/util')
const { animateNumber } = require('../../utils/ui-effects')
const app = getApp()

Page({
  data: {
    userInfo: {},
    stats: { createdCount: 0, joinedCount: 0 },
    displayCreatedCount: 0,
    displayJoinedCount: 0,
    showOpenId: false,
    openIdText: '',
    aboutMounted: false,
    showAboutModal: false
  },

  onLoad() {
    this.loadUserInfo()
    this.loadStats()
  },

  onShow() {
    // 每次显示时刷新统计数据
    this.loadStats()
    this.loadUserInfo()
  },

  // 加载用户信息
  loadUserInfo() {
    const cached = app.globalData.userInfo || user.getUserInfo()
    this.setData({ userInfo: cached || {} })
  },

  // 加载统计数据
  async loadStats() {
    const stats = await user.getUserStats()
    this.setData({ stats })
    animateNumber(this, 'displayCreatedCount', this.data.stats.createdCount, 800)
    setTimeout(() => {
      animateNumber(this, 'displayJoinedCount', this.data.stats.joinedCount, 800)
    }, 200)
  },

  // 昵称输入
  onNicknameInput(e) {
    const customNickname = e.detail.value
    const userInfo = { ...this.data.userInfo, customNickname }
    this.setData({ userInfo })

    // 实时更新到全局和缓存
    app.updateUserInfo({ customNickname })
  },

  // 昵称失焦时保存
  saveNickname() {
    const { customNickname } = this.data.userInfo
    if (customNickname) {
      app.updateUserInfo({ customNickname })
      user.updateUserInfo({ customNickname })
    }
  },

  // 更换头像（使用微信头像）
  changeAvatar() {
    // 尝试获取用户头像
    wx.getUserProfile({
      desc: '用于显示你的头像',
      success: (res) => {
        const userInfo = res.userInfo
        const updated = app.updateUserInfo({
          avatarUrl: userInfo.avatarUrl,
          nickName: userInfo.nickName
        })
        user.updateUserInfo({
          avatarUrl: userInfo.avatarUrl,
          nickName: userInfo.nickName
        })
        this.setData({ userInfo: updated })
      },
      fail: () => {
        // 用户拒绝授权，不强制
      }
    })
  },

  // 跳转到历史聚会页面
  goToHistory(e) {
    const type = e.currentTarget.dataset.type || 'created'
    wx.navigateTo({
      url: `/pages/history/history?type=${type}`
    })
  },

  // 通知设置（预留）
  goToNotification() {
    wx.switchTab({ url: '/pages/notifications/notifications' })
  },

  // 显示关于弹窗
  showAbout() {
    if (this.aboutCloseTimer) clearTimeout(this.aboutCloseTimer)
    this.setData({ aboutMounted: true }, () => {
      wx.nextTick(() => this.setData({ showAboutModal: true }))
    })
  },

  // 隐藏关于弹窗
  hideAbout() {
    this.setData({ showAboutModal: false })
    if (this.aboutCloseTimer) clearTimeout(this.aboutCloseTimer)
    this.aboutCloseTimer = setTimeout(() => {
      this.setData({ aboutMounted: false })
      this.aboutCloseTimer = null
    }, 220)
  },

  onUnload() {
    if (this.aboutCloseTimer) clearTimeout(this.aboutCloseTimer)
  },

  // 阻止滚动穿透
  preventMove() {},

  // 分享
  onShareAppMessage() {
    return {
      title: '聚会时间 - 轻松找到大家都有空的时间',
      path: '/pages/index/index'
    }
  }
})
