const util = require('../../utils/util')

Page({
  data: {
    eventId: '',
    event: null,
    loading: true,
    expired: false,
    isCreator: false,
    justCreated: false,

    dateRangeText: '',
    expireText: '',
    participantCount: 0,

    dates: [], // [{ date, weekday, day, slots: [{timeSlot, count, level}] }]
    timeLabels: [], // 根据粒度动态生成
    slotCounts: {},
    slotUsers: {},
    granularity: 'twoHours', // 时段粒度
    slotsPerDay: 12, // 每天时段数

    bestSlot: { timeText: '', count: 0 },
    participants: [],

    showSlotModal: false,
    selectedSlotInfo: { dateText: '', timeText: '', count: 0, users: [] }
  },

  onLoad(options) {
    const { id, created } = options
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    this.setData({
      eventId: id,
      isCreator: created === '1',
      justCreated: created === '1'
    })
    this.loadResult(id)
  },

  // 加载统计结果
  async loadResult(eventId) {
    try {
      if (wx.cloud) {
        const db = wx.cloud.database()

        // 获取活动信息
        const eventRes = await db.collection('events').doc(eventId).get()
        if (!eventRes.data) {
          throw new Error('活动不存在')
        }

        const event = eventRes.data

        // 检查是否过期
        const expired = util.isExpired(event.expireAt)

        // 获取所有响应
        const responsesRes = await db.collection('responses')
          .where({ eventId })
          .get()

        const responses = responsesRes.data || []

        // 处理数据
        this.processData(event, responses, expired)

      } else {
        // 开发环境模拟数据
        this.loadMockData()
      }
    } catch (err) {
      console.error('加载结果失败', err)
      this.loadMockData()
    }
  },

  // 加载模拟数据
  loadMockData() {
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
      note: '地点待定'
    }

    const responses = [
      {
        _id: 'r1',
        nickname: '小明',
        slots: [`${formatDate(today)}_3`, `${formatDate(today)}_4`, `${formatDate(tomorrow)}_2`],
        createdAt: new Date().toISOString()
      },
      {
        _id: 'r2',
        nickname: '小红',
        slots: [`${formatDate(today)}_3`, `${formatDate(today)}_5`, `${formatDate(tomorrow)}_3`],
        createdAt: new Date().toISOString()
      },
      {
        _id: 'r3',
        nickname: '小李',
        slots: [`${formatDate(today)}_4`, `${formatDate(tomorrow)}_2`, `${formatDate(tomorrow)}_3`],
        createdAt: new Date().toISOString()
      }
    ]

    this.processData(event, responses, false)
  },

  // 处理数据
  processData(event, responses, expired) {
    const granularity = event.granularity || 'twoHours'

    // 根据粒度计算时段数量和时间标签
    let slotsPerDay = 12
    let timeLabels = []

    if (granularity === 'hour') {
      slotsPerDay = 24
      // 生成24小时标签（每2小时显示一个）
      for (let i = 0; i < 24; i += 2) {
        timeLabels.push(String(i))
      }
    } else if (granularity === 'twoHours') {
      slotsPerDay = 12
      // 生成12个时段标签（0, 2, 4, ..., 22）
      for (let i = 0; i < 24; i += 2) {
        timeLabels.push(String(i))
      }
    } else if (granularity === 'halfDay') {
      slotsPerDay = 4
      timeLabels = ['上午', '下午', '晚上', '深夜']
    }

    // 统计每个时段的人数和用户
    const slotCounts = {}
    const slotUsers = {}

    responses.forEach(response => {
      const slots = response.slots || response.availableSlots || []
      slots.forEach(slotId => {
        if (!slotCounts[slotId]) {
          slotCounts[slotId] = 0
          slotUsers[slotId] = []
        }
        slotCounts[slotId]++
        slotUsers[slotId].push(response.nickname || '匿名')
      })
    })

    // 找出最佳时段
    let bestSlot = { timeText: '', count: 0, slotId: '' }
    let maxCount = 0
    Object.keys(slotCounts).forEach(slotId => {
      if (slotCounts[slotId] > maxCount) {
        maxCount = slotCounts[slotId]
        const [date, hour] = slotId.split('_')
        const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
        const d = new Date(date)
        const dateText = `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`
        const timeText = `${dateText} ${util.formatTimeSlot(parseInt(hour), granularity)}`
        bestSlot = { timeText, count: slotCounts[slotId], slotId }
      }
    })

    // 生成日期列表（带热力数据）
    const dates = this.generateDatesWithHeatmap(event.startDate, event.endDate, slotCounts, responses.length, granularity, slotsPerDay)

    // 处理参与者列表
    const participants = responses.map(r => ({
      ...r,
      slotCount: (r.slots || r.availableSlots || []).length
    }))

    // 格式化显示文本
    const startDate = util.formatDateShort(event.startDate)
    const endDate = util.formatDateShort(event.endDate)
    const dateRangeText = startDate === endDate
      ? startDate
      : `${startDate.split(' ')[0]} ~ ${endDate.split(' ')[0]}`

    // 设置 event 的显示属性
    event.dateRangeText = dateRangeText
    event.expireText = util.formatExpireTime(event.expireAt)
    event.expired = expired

    this.setData({
      event,
      dates,
      slotCounts,
      slotUsers,
      granularity,
      slotsPerDay,
      timeLabels,
      bestSlot,
      participants,
      participantCount: responses.length,
      loading: false
    })
  },

  // 生成日期列表（带热力图数据）
  generateDatesWithHeatmap(startDate, endDate, slotCounts, totalUsers, granularity, slotsPerDay) {
    const dates = []
    const start = new Date(startDate)
    const end = new Date(endDate)
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

    // 使用传入的 slotsPerDay 或根据粒度计算
    const slotCount = slotsPerDay || (granularity === 'hour' ? 24 : (granularity === 'halfDay' ? 4 : 12))

    while (start <= end) {
      const dateStr = this.formatDate(start)
      const slots = []

      for (let i = 0; i < slotCount; i++) {
        const slotId = `${dateStr}_${i}`
        const count = slotCounts[slotId] || 0
        const level = totalUsers > 0 ? Math.min(4, Math.floor((count / totalUsers) * 5)) : 0
        slots.push({ timeSlot: i, count, level, slotId })
      }

      dates.push({
        date: dateStr,
        weekday: weekDays[start.getDay()],
        day: start.getDate(),
        slots
      })
      start.setDate(start.getDate() + 1)
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

  // 格式化提交时间
  formatSubmitTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date

    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    return `${Math.floor(diff / 86400000)}天前`
  },

  // 获取热力图颜色
  getHeatColor(date, hour) {
    const { slotCounts, participantCount } = this.data
    const dateStr = this.extractDate(date)
    const slotId = `${dateStr}_${hour}`
    const count = slotCounts[slotId] || 0

    if (count === 0 || participantCount === 0) {
      return 'rgba(233, 69, 96, 0.08)'
    }

    const intensity = count / participantCount

    if (intensity < 0.25) return 'rgba(233, 69, 96, 0.25)'
    if (intensity < 0.5) return 'rgba(233, 69, 96, 0.45)'
    if (intensity < 0.75) return 'rgba(233, 69, 96, 0.65)'
    return 'rgba(233, 69, 96, 0.85)'
  },

  // 获取时段人数
  getSlotCount(date, hour) {
    const { slotCounts } = this.data
    const dateStr = this.extractDate(date)
    const slotId = `${dateStr}_${hour}`
    return slotCounts[slotId] || 0
  },

  // 从格式化日期提取原始日期
  extractDate(formattedDate) {
    const [monthDay] = formattedDate.split('\n')
    const [month, day] = monthDay.split('/')
    const year = new Date().getFullYear()
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  },

  // 显示时段详情
  showSlotDetail(e) {
    const { date, hour } = e.currentTarget.dataset
    const dateStr = this.extractDate(date)
    const slotId = `${dateStr}_${hour}`
    const { slotCounts, slotUsers } = this.data

    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const d = new Date(dateStr)
    const dateText = `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`
    const timeText = util.formatTimeSlot(hour, this.data.event?.granularity || 'twoHours')

    this.setData({
      showSlotModal: true,
      selectedSlotInfo: {
        slotId,
        dateText,
        timeText,
        count: slotCounts[slotId] || 0,
        users: slotUsers[slotId] || []
      }
    })
  },

  // 关闭弹窗
  closeSlotModal() {
    this.setData({ showSlotModal: false })
  },

  // 阻止滚动穿透
  preventMove() {},

  // 编辑活动
  editEvent() {
    wx.showToast({ title: '功能开发中', icon: 'none' })
  },

  // 删除活动
  async deleteEvent() {
    const res = await wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？'
    })

    if (!res.confirm) return

    try {
      if (wx.cloud) {
        const db = wx.cloud.database()
        await db.collection('events').doc(this.data.eventId).remove()
        await db.collection('responses').where({
          eventId: this.data.eventId
        }).remove()
      }

      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  // 跳转到投票页
  goToVote() {
    wx.navigateTo({
      url: `/pages/vote/vote?id=${this.data.eventId}`
    })
  },

  // 分享
  onShareAppMessage() {
    const { event } = this.data
    return {
      title: `来选一下「${event?.name || '聚会'}」的时间吧`,
      path: `/pages/vote/vote?id=${this.data.eventId}`
    }
  }
})
