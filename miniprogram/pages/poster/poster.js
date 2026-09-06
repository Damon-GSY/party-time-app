// 海报页面逻辑 - Canvas 2D API
const util = require('../../utils/util')

// 海报设计尺寸（CSS像素）
const POSTER_WIDTH = 375
const POSTER_HEIGHT = 667

Page({
  data: {
    eventId: '',
    loading: true,
    posterError: false,
    event: null,
    participantCount: 0,
    bestSlot: null
  },

  onReady() {
    this._canvasReady = true
    if (this.data.event) this.drawPoster()
  },

  onLoad(options) {
    const { id } = options
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.setData({ eventId: id })
    this.loadEventData(id)
  },

  // 加载活动数据
  async loadEventData(eventId) {
    try {
      if (wx.cloud) {
        const response = await wx.cloud.callFunction({
          name: 'getEventResult',
          data: { eventId }
        })
        if (!response.result?.success) throw new Error(response.result?.error || '活动不存在')
        const { event, participantCount, bestSlots = [] } = response.result.data
        let bestSlot = null
        if (bestSlots[0]) {
          const parsed = util.parseSlotId(bestSlots[0].slotId)
          const date = new Date(parsed.date)
          const dateText = `${date.getMonth() + 1}月${date.getDate()}日 ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]}`
          bestSlot = `${dateText} ${util.formatTimeSlot(parsed.hour, event.granularity || 'twoHours')}`
        }

        // 格式化日期范围
        const startDate = util.formatDateShort(event.startDate)
        const endDate = util.formatDateShort(event.endDate)
        const dateRangeText = startDate === endDate ? startDate : `${startDate.split(' ')[0]} ~ ${endDate.split(' ')[0]}`

        this.setData({
          event: { ...event, dateRangeText },
          participantCount,
          bestSlot
        }, () => {
          this.drawPoster()
        })
      } else {
        // 模拟数据
        this.setData({
          event: {
            name: '周末聚餐',
            dateRangeText: '3月23日 ~ 3月24日',
            note: '地点待定，选好时间后大家一起商量～'
          },
          participantCount: 5,
          bestSlot: '3月23日 周六 14:00-16:00'
        }, () => {
          this.drawPoster()
        })
      }
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false, posterError: true })
    }
  },

  // 绘制海报
  drawPoster() {
    if (!this._canvasReady) return
    try {
      const query = wx.createSelectorQuery()
      query.select('#posterCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          try {
            if (!res[0] || !res[0].node) {
              console.error('Canvas node not found')
              this.setData({ loading: false, posterError: true })
              return
            }

            const canvas = res[0].node
            const ctx = canvas.getContext('2d')
            const dpr = wx.getWindowInfo().pixelRatio || 2

            // 设置 canvas 实际大小
            canvas.width = POSTER_WIDTH * dpr
            canvas.height = POSTER_HEIGHT * dpr
            ctx.scale(dpr, dpr)

            const { event, participantCount, bestSlot } = this.data

            // 1. 绘制背景
            this.drawBackground(ctx)

            // 2. 绘制结构线
            this.drawDecorations(ctx)

            // 3. 右上角小程序名称
            this.drawSingleText(ctx, '聚会时间', POSTER_WIDTH - 20, 36, 14, '#6e756c', 'right')

            // 4. 顶部装饰线条
            ctx.strokeStyle = 'rgba(184, 58, 45, 0.48)'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(32, 70)
            ctx.lineTo(120, 70)
            ctx.stroke()

            // 5. 活动名称
            this.drawEventName(ctx, event.name)

            // 6. 日期范围
            this.drawSingleText(ctx, event.dateRangeText, 32, 240, 16, '#6e756c', 'left')

            // 7. 分隔线
            ctx.strokeStyle = 'rgba(184, 58, 45, 0.36)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(32, 270)
            ctx.lineTo(POSTER_WIDTH - 32, 270)
            ctx.stroke()

            // 8. 统计信息
            this.drawStats(ctx, participantCount)

            // 9. 最佳时段推荐
            if (bestSlot) {
              this.drawBestSlot(ctx, bestSlot, participantCount)
            }

            // 10. 备注
            if (event.note) {
              this.drawNote(ctx, event.note)
            }

            // 11. 底部提示
            this.drawBottomText(ctx)

            this.setData({ loading: false, posterError: false })
          } catch (err) {
            console.error('drawPoster error:', err)
            wx.showToast({ title: '海报生成失败', icon: 'none' })
            this.setData({ loading: false, posterError: true })
          }
        })
    } catch (err) {
      console.error('drawPoster error:', err)
      wx.showToast({ title: '海报生成失败', icon: 'none' })
      this.setData({ loading: false, posterError: true })
    }
  },

  // 绘制背景
  drawBackground(ctx) {
    this.roundRect(ctx, 0, 0, POSTER_WIDTH, POSTER_HEIGHT, 0)
    ctx.fillStyle = '#fffcf6'
    ctx.fill()
  },

  // 绘制装饰元素
  drawDecorations(ctx) {
    ctx.strokeStyle = '#d9d9cc'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(32, 72)
    ctx.lineTo(POSTER_WIDTH - 32, 72)
    ctx.stroke()
  },

  // 绘制活动名称
  drawEventName(ctx, name) {
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#26382e'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    // 文字换行处理
    const maxWidth = POSTER_WIDTH - 64
    const lines = this.wrapText(ctx, name, maxWidth)
    let y = 100
    lines.forEach(line => {
      ctx.fillText(line, 32, y)
      y += 40
    })
  },

  // 绘制统计数据
  drawStats(ctx, participantCount) {
    const y = 300
    const cardWidth = (POSTER_WIDTH - 76) / 2
    const cardHeight = 80

    // 参与人数卡片
    this.roundRect(ctx, 32, y, cardWidth, cardHeight, 12)
    ctx.fillStyle = '#f5e3da'
    ctx.fill()
    ctx.strokeStyle = 'rgba(184, 58, 45, 0.36)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#b83a2d'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(participantCount), 32 + cardWidth / 2, y + 36)

    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#6e756c'
    ctx.fillText('参与人数', 32 + cardWidth / 2, y + 62)

    // 投票状态卡片
    const card2X = 32 + cardWidth + 12
    this.roundRect(ctx, card2X, y, cardWidth, cardHeight, 12)
    ctx.fillStyle = '#e8ecdf'
    ctx.fill()
    ctx.strokeStyle = 'rgba(78, 104, 81, 0.44)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#4e6851'
    const statusText = util.isExpired(this.data.event?.expireAt) ? '已结束' : '进行中'
    ctx.fillText(statusText, card2X + cardWidth / 2, y + cardHeight / 2)
  },

  // 绘制最佳时段推荐
  drawBestSlot(ctx, bestSlot, participantCount) {
    const y = 410
    const cardWidth = POSTER_WIDTH - 64
    const cardHeight = 100

    // 推荐卡片背景
    this.roundRect(ctx, 32, y, cardWidth, cardHeight, 16)
    ctx.fillStyle = '#f5e3da'
    ctx.fill()
    ctx.strokeStyle = 'rgba(184, 58, 45, 0.5)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#b83a2d'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('最佳推荐时段', 52, y + 20)

    // 时段文字
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#26382e'
    ctx.fillText(bestSlot, 52, y + 42)

    // 人数
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#6e756c'
    ctx.fillText(`${participantCount}人参与`, 52, y + 70)
  },

  // 绘制备注
  drawNote(ctx, note) {
    const y = 530
    const maxWidth = POSTER_WIDTH - 100

    ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#6e756c'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    const lines = this.wrapText(ctx, `"${note}"`, maxWidth)
    let lineY = y
    lines.forEach(line => {
      ctx.fillText(line, POSTER_WIDTH / 2, lineY)
      lineY += 22
    })
  },

  // 绘制底部提示文字
  drawBottomText(ctx) {
    // 分隔线
    ctx.strokeStyle = '#d9d9cc'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(60, POSTER_HEIGHT - 48)
    ctx.lineTo(POSTER_WIDTH - 60, POSTER_HEIGHT - 48)
    ctx.stroke()

    ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = '#6e756c'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('在聚会时间小程序中参与投票', POSTER_WIDTH / 2, POSTER_HEIGHT - 24)
  },

  // 绘制文字（封装）
  drawSingleText(ctx, text, x, y, fontSize, color, align) {
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
    ctx.fillStyle = color
    ctx.textAlign = align || 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(text, x, y)
  },

  // 文字换行
  wrapText(ctx, text, maxWidth) {
    const lines = []
    let currentLine = ''
    for (let i = 0; i < text.length; i++) {
      const testLine = currentLine + text[i]
      const metrics = ctx.measureText(testLine)
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine)
        currentLine = text[i]
      } else {
        currentLine = testLine
      }
    }
    lines.push(currentLine)
    return lines
  },

  // 圆角矩形
  roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, r)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  },

  // 保存到相册
  saveToAlbum() {
    wx.showLoading({ title: '保存中...' })

    const query = wx.createSelectorQuery()
    query.select('#posterCanvas')
      .fields({ node: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          wx.hideLoading()
          wx.showToast({ title: '保存失败', icon: 'none' })
          return
        }

        const canvas = res[0].node
        wx.canvasToTempFilePath({
          canvas,
          fileType: 'png',
          quality: 1,
          success: (res) => {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.hideLoading()
                wx.showToast({ title: '已保存到相册', icon: 'success' })
              },
              fail: (err) => {
                wx.hideLoading()
                if (err.errMsg && err.errMsg.includes('auth deny')) {
                  wx.showModal({
                    title: '需要相册权限',
                    content: '请在设置中开启「保存到相册」权限',
                    confirmText: '去设置',
                    success: (modalRes) => {
                      if (modalRes.confirm) {
                        wx.openSetting()
                      }
                    }
                  })
                } else {
                  wx.showToast({ title: '保存失败', icon: 'none' })
                }
              }
            })
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '生成图片失败', icon: 'none' })
          }
        })
      })
  },

  // 分享
  onShareAppMessage() {
    const { event, participantCount } = this.data
    return {
      title: `${participantCount}人正在选「${event?.name || '聚会'}」的时间，来投票吧！`,
      path: `/pages/vote/vote?id=${this.data.eventId}`
    }
  }
})
