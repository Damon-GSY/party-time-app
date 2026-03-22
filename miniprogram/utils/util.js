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
 */
const formatTimeSlot = (hour, granularity) => {
  const startHour = hour
  let endHour

  switch (granularity) {
    case 'hour':
      endHour = hour + 1
      break
    case 'twoHours':
      endHour = hour + 2
      break
    case 'halfDay':
      endHour = hour >= 12 ? 24 : 12
      break
    default:
      endHour = hour + 1
  }

  const startStr = String(startHour).padStart(2, '0')
  const endStr = String(endHour).padStart(2, '0')
  return `${startStr}:00-${endStr}:00`
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
 * 生成时间槽
 */
const generateTimeSlots = (granularity) => {
  const slots = []

  switch (granularity) {
    case 'hour':
      for (let i = 6; i < 24; i++) {
        slots.push({ hour: i, label: formatTimeSlot(i, 'hour') })
      }
      break
    case 'twoHours':
      for (let i = 6; i < 24; i += 2) {
        slots.push({ hour: i, label: formatTimeSlot(i, 'twoHours') })
      }
      break
    case 'halfDay':
      slots.push({ hour: 0, label: '上午 06:00-12:00' })
      slots.push({ hour: 12, label: '下午 12:00-18:00' })
      slots.push({ hour: 18, label: '晚上 18:00-24:00' })
      break
    default:
      for (let i = 6; i < 24; i++) {
        slots.push({ hour: i, label: formatTimeSlot(i, 'hour') })
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
  generateSharePath
}
