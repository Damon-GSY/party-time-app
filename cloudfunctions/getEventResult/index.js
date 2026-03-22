// 云函数 - 获取活动统计结果
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { eventId } = event

  if (!eventId) {
    return {
      success: false,
      error: '缺少活动ID'
    }
  }

  try {
    // 获取活动信息
    const eventRes = await db.collection('events').doc(eventId).get()

    if (!eventRes.data) {
      return {
        success: false,
        error: '活动不存在'
      }
    }

    // 获取所有响应
    const responsesRes = await db.collection('responses')
      .where({
        eventId
      })
      .get()

    const responses = responsesRes.data || []

    // 统计每个时段的人数
    const slotStats = {}
    responses.forEach(response => {
      const slots = response.slots || []
      slots.forEach(slot => {
        slotStats[slot] = (slotStats[slot] || 0) + 1
      })
    })

    // 找出最佳时段（按人数排序取前5）
    const sortedSlots = Object.keys(slotStats)
      .map(slotId => ({
        slotId,
        count: slotStats[slotId]
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      success: true,
      data: {
        event: eventRes.data,
        responses,
        slotStats,
        bestSlots: sortedSlots,
        participantCount: responses.length
      }
    }
  } catch (err) {
    console.error('获取结果失败', err)
    return {
      success: false,
      error: err.message || '获取失败'
    }
  }
}
