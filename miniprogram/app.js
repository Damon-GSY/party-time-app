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
  },

  globalData: {
    openId: '',
    userInfo: null
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
