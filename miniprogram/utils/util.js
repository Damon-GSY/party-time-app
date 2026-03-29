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

/**
 * 格式化时间段
 * @param {number} hour - 时段索引（halfDay时为0-3，其他粒度为小时数）
 * @param {string} granularity - 粒度类型
 */
const formatTimeSlot = (hour, granularity) => {
  switch (granularity) {
    case 'hour':
      return `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`
    case 'twoHours':
      return `${String(hour).padStart(2, '0')}:00-${String(hour + 2).padStart(2, '0')}:00`
    case 'halfDay':
      // hour 是索引 0-3，对应4个半天时段
      const halfDayLabels = [
        '上午 00:00-12:00',
        '下午 12:00-18:00',
        '晚上 18:00-24:00',
        '深夜 00:00-06:00'
      ]
      return halfDayLabels[hour] || halfDayLabels[0]
    default:
      return `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`
  }
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
 * 生成时间槽（从0点开始，覆盖全天24小时）
 * 注意：halfDay 粒度使用索引 0-3，与 formatTimeSlot 保持一致
 */
const generateTimeSlots = (granularity) => {
  const slots = []

  switch (granularity) {
    case 'hour':
      // 24个时段，每小时一个
      for (let i = 0; i < 24; i++) {
        slots.push({ hour: i, label: formatTimeSlot(i, 'hour') })
      }
      break
    case 'twoHours':
      // 12个时段，每2小时一个
      for (let i = 0; i < 24; i += 2) {
        slots.push({ hour: i, label: formatTimeSlot(i, 'twoHours') })
      }
      break
    case 'halfDay':
      // 4个时段，使用索引 0-3（与 formatTimeSlot 一致）
      for (let i = 0; i < 4; i++) {
        slots.push({ hour: i, label: formatTimeSlot(i, 'halfDay') })
      }
      break
    default:
      for (let i = 0; i < 24; i += 2) {
        slots.push({ hour: i, label: formatTimeSlot(i, 'twoHours') })
      }
  }

  return slots
}

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
  if (maxCount === 0) return 'rgba(233, 69, 96, 0.1)'

  const intensity = count / maxCount

  if (intensity === 0) return 'rgba(233, 69, 96, 0.1)'
  if (intensity < 0.25) return 'rgba(233, 69, 96, 0.3)'
  if (intensity < 0.5) return 'rgba(233, 69, 96, 0.5)'
  if (intensity < 0.75) return 'rgba(233, 69, 96, 0.7)'
  return 'rgba(233, 69, 96, 0.9)'
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

  // 预设渐变色方案（8 种）
  const gradients = [
    'linear-gradient(135deg, #e94560, #ff6b6b)',
    'linear-gradient(135deg, #4facfe, #00f2fe)',
    'linear-gradient(135deg, #43e97b, #38f9d7)',
    'linear-gradient(135deg, #fa709a, #fee140)',
    'linear-gradient(135deg, #a18cd1, #fbc2eb)',
    'linear-gradient(135deg, #fccb90, #d57eeb)',
    'linear-gradient(135deg, #667eea, #764ba2)',
    'linear-gradient(135deg, #f093fb, #f5576c)'
  ]

  return gradients[hash % gradients.length]
}

module.exports = {
  formatDate,
  formatDateShort,
  formatTimeSlot,
  generateDateRange,
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
