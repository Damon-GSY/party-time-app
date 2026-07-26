/**
 * 日期时间工具函数
 */

/**
 * 格式化日期为 YYYY-MM-DD
 */
const formatDate = (date) => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 格式化日期为 MM月DD日
 */
const formatDateShort = (date) => {
  const d = new Date(date)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekDay = weekDays[d.getDay()]
  return `${month}月${day}日 ${weekDay}`
}

const SLOT_RULES = {
  hour: { count: 24, hoursPerSlot: 1 },
  twoHours: { count: 12, hoursPerSlot: 2 },
  halfDay: {
    count: 4,
    hoursPerSlot: 6,
    periods: ['深夜', '上午', '下午', '晚上']
  }
}

/**
 * 返回统一的时段配置。
 * slotId 始终保存 0 开始的 index；startHour 只负责显示，避免两小时粒度
 * 把 index=5 错误显示成 05:00。
 */
const getTimeSlotConfig = (granularity = 'twoHours') => {
  const normalized = SLOT_RULES[granularity] ? granularity : 'twoHours'
  const rule = SLOT_RULES[normalized]

  return Array.from({ length: rule.count }, (_, index) => {
    const startHour = index * rule.hoursPerSlot
    const endHour = startHour + rule.hoursPerSlot
    const range = `${String(startHour).padStart(2, '0')}:00-${String(endHour).padStart(2, '0')}:00`
    const period = rule.periods ? `${rule.periods[index]} ` : ''

    return {
      index,
      startHour,
      label: `${period}${range}`,
      shortLabel: rule.periods ? rule.periods[index] : `${String(startHour).padStart(2, '0')}:00`
    }
  })
}

const formatHour = hour => `${String(hour).padStart(2, '0')}:00`

/**
 * 规范化活动每天的可选时间窗口。
 * 旧活动没有 startHour/endHour 时继续按全天处理，避免破坏既有投票。
 */
const normalizeEventTimeWindow = (event = {}) => {
  const granularity = SLOT_RULES[event.granularity] ? event.granularity : 'twoHours'
  const hoursPerSlot = SLOT_RULES[granularity].hoursPerSlot
  const window = event.dailyTimeWindow
  if (window === undefined) {
    return {
      startMinute: 0,
      endMinute: 1440,
      startHour: 0,
      endHour: 24,
      hoursPerSlot,
      valid: true
    }
  }
  const startMinute = window?.startMinute
  const endMinute = window?.endMinute
  const minutesPerSlot = hoursPerSlot * 60
  const isValid = Number.isInteger(startMinute) &&
    Number.isInteger(endMinute) &&
    startMinute >= 0 &&
    endMinute <= 1440 &&
    startMinute < endMinute &&
    startMinute % minutesPerSlot === 0 &&
    endMinute % minutesPerSlot === 0

  return {
    startMinute: isValid ? startMinute : 0,
    endMinute: isValid ? endMinute : 1440,
    startHour: isValid ? startMinute / 60 : 0,
    endHour: isValid ? endMinute / 60 : 24,
    hoursPerSlot,
    valid: isValid
  }
}

/**
 * 将任意时间范围向外吸附到新粒度，确保切换粒度后仍覆盖用户原来的意图。
 */
const alignTimeWindow = (startHour, endHour, granularity = 'twoHours') => {
  const normalized = SLOT_RULES[granularity] ? granularity : 'twoHours'
  const hoursPerSlot = SLOT_RULES[normalized].hoursPerSlot
  let alignedStart = Math.max(0, Math.min(24 - hoursPerSlot, Math.floor(Number(startHour) / hoursPerSlot) * hoursPerSlot))
  let alignedEnd = Math.max(hoursPerSlot, Math.min(24, Math.ceil(Number(endHour) / hoursPerSlot) * hoursPerSlot))
  if (!Number.isFinite(alignedStart)) alignedStart = 0
  if (!Number.isFinite(alignedEnd)) alignedEnd = 24
  if (alignedEnd <= alignedStart) alignedEnd = Math.min(24, alignedStart + hoursPerSlot)
  return { startHour: alignedStart, endHour: alignedEnd, hoursPerSlot }
}

const getTimeWindowOptions = (granularity = 'twoHours') => {
  const normalized = SLOT_RULES[granularity] ? granularity : 'twoHours'
  const hoursPerSlot = SLOT_RULES[normalized].hoursPerSlot
  return {
    startOptions: Array.from({ length: 24 / hoursPerSlot }, (_, index) => {
      const value = index * hoursPerSlot
      return { value, label: formatHour(value) }
    }),
    endOptions: Array.from({ length: 24 / hoursPerSlot }, (_, index) => {
      const value = (index + 1) * hoursPerSlot
      return { value, label: formatHour(value) }
    })
  }
}

const getEventTimeSlotConfig = (event = {}) => {
  const granularity = SLOT_RULES[event.granularity] ? event.granularity : 'twoHours'
  const { startHour, endHour } = normalizeEventTimeWindow({ ...event, granularity })
  return getTimeSlotConfig(granularity)
    .filter(slot => slot.startHour >= startHour && slot.startHour < endHour)
}

const formatEventTimeWindow = (event = {}) => {
  const { startHour, endHour } = normalizeEventTimeWindow(event)
  return `${formatHour(startHour)}–${formatHour(endHour)}`
}

/**
 * 格式化时间段。
 * @param {number} slotIndex - slotId 中保存的时段索引
 * @param {string} granularity - 粒度类型
 */
const formatTimeSlot = (slotIndex, granularity) => {
  const slots = getTimeSlotConfig(granularity)
  return slots[Number(slotIndex)]?.label || slots[0].label
}

/**
 * 生成日期范围内的所有日期
 */
const generateDateRange = (startDate, endDate) => {
  const dates = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  while (start <= end) {
    dates.push(formatDate(start))
    start.setDate(start.getDate() + 1)
  }

  return dates
}

/**
 * 生成周一开头的 6 × 7 月历。
 * referenceDate 决定展示月份；currentDate 决定“今天”高亮。
 * currentDate 默认沿用 referenceDate，保持旧调用行为不变。
 */
const generateMonthCalendar = (referenceDate = new Date(), currentDate = referenceDate) => {
  const viewedMonth = new Date(referenceDate)
  const today = new Date(currentDate)
  if (Number.isNaN(viewedMonth.getTime()) || Number.isNaN(today.getTime())) return []

  const monthStart = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth(), 1)
  const gridStart = new Date(monthStart)
  gridStart.setDate(monthStart.getDate() - ((monthStart.getDay() + 6) % 7))
  const todayKey = formatDate(today)
  const targetMonthIndex = viewedMonth.getFullYear() * 12 + viewedMonth.getMonth()

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const dateKey = formatDate(date)
    const inMonth = date.getMonth() === viewedMonth.getMonth() && date.getFullYear() === viewedMonth.getFullYear()
    const monthIndex = date.getFullYear() * 12 + date.getMonth()
    const current = dateKey === todayKey
    const relativeLabel = inMonth ? '' : monthIndex < targetMonthIndex ? '，上月' : '，下月'
    return {
      date: dateKey,
      day: date.getDate(),
      inMonth,
      current,
      accessibleLabel: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${current ? '，今天' : relativeLabel}`
    }
  })
}

/**
 * 生成时间槽（从0点开始，覆盖全天24小时）
 * 注意：halfDay 粒度使用索引 0-3，与 formatTimeSlot 保持一致
 */
const generateTimeSlots = (granularity) => getTimeSlotConfig(granularity).map(slot => ({
  hour: slot.index,
  label: slot.label,
  shortLabel: slot.shortLabel,
  startHour: slot.startHour
}))

/**
 * 生成唯一的slotId
 */
const generateSlotId = (date, hour) => {
  return `${date}_${hour}`
}

/**
 * 解析slotId
 */
const parseSlotId = (slotId) => {
  const [date, hour] = slotId.split('_')
  return { date, hour: parseInt(hour) }
}

/**
 * 计算过期时间
 */
const calculateExpireAt = (expireType) => {
  const now = new Date()

  switch (expireType) {
    case '24h':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000)
    case '3days':
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    case '7days':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    case 'never':
      return null
    default:
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  }
}

/**
 * 检查是否过期
 */
const isExpired = (expireAt) => {
  if (!expireAt) return false
  return new Date() > new Date(expireAt)
}

/**
 * 格式化过期时间显示
 */
const formatExpireTime = (expireAt) => {
  if (!expireAt) return '永久有效'
  const expire = new Date(expireAt)
  const now = new Date()
  const diff = expire - now

  if (diff <= 0) return '已过期'

  const hours = Math.floor(diff / (60 * 60 * 1000))
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))

  if (hours < 24) {
    return `${hours}小时后过期`
  } else {
    return `${days}天后过期`
  }
}

/**
 * 获取热力图颜色
 */
const getHeatColor = (count, maxCount) => {
  if (maxCount === 0) return 'rgba(78, 104, 81, 0.16)'

  const intensity = count / maxCount

  if (intensity === 0) return 'rgba(78, 104, 81, 0.16)'
  if (intensity < 0.25) return 'rgba(78, 104, 81, 0.3)'
  if (intensity < 0.5) return 'rgba(78, 104, 81, 0.5)'
  if (intensity < 0.75) return 'rgba(78, 104, 81, 0.72)'
  return 'rgba(78, 104, 81, 0.94)'
}

/**
 * 生成分享路径
 */
const generateSharePath = (eventId) => {
  return `/pages/vote/vote?id=${eventId}`
}

/**
 * 根据昵称字符串 hash 生成一致的头像渐变色
 * 同一昵称始终返回同一颜色
 */
const getAvatarColor = (nickname) => {
  if (!nickname) nickname = '匿名'

  // 简单字符串 hash
  let hash = 0
  for (let i = 0; i < nickname.length; i++) {
    hash = ((hash << 5) - hash) + nickname.charCodeAt(i)
    hash |= 0 // Convert to 32bit integer
  }
  hash = Math.abs(hash)

  const colors = [
    '#9f5f57',
    '#6d7f91',
    '#738b74',
    '#9a7758',
    '#786f91',
    '#8b6b7a',
    '#617f7c',
    '#8d665e'
  ]

  return colors[hash % colors.length]
}

module.exports = {
  formatDate,
  formatDateShort,
  getTimeSlotConfig,
  getEventTimeSlotConfig,
  getTimeWindowOptions,
  normalizeEventTimeWindow,
  alignTimeWindow,
  formatEventTimeWindow,
  formatTimeSlot,
  generateDateRange,
  generateMonthCalendar,
  generateTimeSlots,
  generateSlotId,
  parseSlotId,
  calculateExpireAt,
  isExpired,
  formatExpireTime,
  getHeatColor,
  generateSharePath,
  getAvatarColor
}
