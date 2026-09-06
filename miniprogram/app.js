const user = require('./utils/user')

App({
  onLaunch() {
    if (wx.cloud) {
      const options = { traceUser: true }
      if (wx.cloud.DYNAMIC_CURRENT_ENV) options.env = wx.cloud.DYNAMIC_CURRENT_ENV
      wx.cloud.init(options)
      this.getOpenId()
    } else {
      this.generateFallbackId()
    }
    this.initUserInfo()
  },

  globalData: {
    openId: '',
    userInfo: null
  },

  // 初始化用户信息
  initUserInfo() {
    try {
      const info = wx.getStorageSync('userInfo')
      if (info) {
        this.globalData.userInfo = info
      }
    } catch (e) {
      // ignore
    }
  },

  // 更新用户信息（供其他页面调用）
  updateUserInfo(data) {
    return user.updateUserInfo(data)
  },

  async getOpenId() {
    try {
      const response = await wx.cloud.callFunction({ name: 'login' })
      if (!response.result?.openid) throw new Error('登录结果缺少 openid')
      this.globalData.openId = response.result.openid
    } catch (err) {
      console.warn('[app] cloud login failed', err)
      this.generateFallbackId()
    }
  },

  generateFallbackId() {
    this.globalData.openId = `temporary_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }
})
