App({
  onLaunch() {
    // 初始化云开发环境
    if (wx.cloud) {
      wx.cloud.init({
        env: 'party-time-xxx', // 替换为你的云开发环境ID
        traceUser: true
      })
    }

    // 获取用户openid
    this.getOpenId()

    // 获取用户信息（从缓存）
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
    const existing = this.globalData.userInfo || {}
    const updated = { ...existing, ...data }
    this.globalData.userInfo = updated
    try {
      wx.setStorageSync('userInfo', updated)
    } catch (e) {
      console.error('updateUserInfo failed:', e)
    }
    return updated
  },

  getOpenId() {
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        this.globalData.openId = res.result.openid
      },
      fail: () => {
        // 如果login云函数未创建，使用匿名ID
        this.globalData.openId = 'anonymous_' + Date.now()
      }
    })
  }
})
