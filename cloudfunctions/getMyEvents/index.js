// 云函数 - 获取用户的活动列表
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID

  if (!openid) {
    return { success: false, error: '未授权' }
  }

  const { limit = 20, skip = 0 } = event

  try {
    // 获取用户创建的活动
    const createdRes = await db.collection('events')
      .where({
        _openid: openid
      })
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(Math.min(limit, 50))
      .get()

    // 获取用户参与的活动ID（分页查询）
    const CF_LIMIT = 100
    let allResponses = []
    let skipCount = 0
    while (true) {
      const resPage = await db.collection('responses')
        .where({ _openid: openid })
        .field({ eventId: true })
        .skip(skipCount)
        .limit(CF_LIMIT)
        .get()
      allResponses.push(...resPage.data)
      if (resPage.data.length < CF_LIMIT) break
      skipCount += CF_LIMIT
    }

    const joinedEventIds = [...new Set(allResponses.map(r => r.eventId))]

    let joinedEvents = []
    if (joinedEventIds.length > 0) {
      // 批量获取参与的活动
      const MAX_BATCH = 10 // 云开发 where in 限制
      for (let i = 0; i < joinedEventIds.length; i += MAX_BATCH) {
        const batchIds = joinedEventIds.slice(i, i + MAX_BATCH)
        const joinedRes = await db.collection('events')
          .where({
            _id: _.in(batchIds)
          })
          .get()
        joinedEvents = joinedEvents.concat(joinedRes.data)
      }
    }

    // 合并并标记类型
    const allEvents = [
      ...createdRes.data.map(e => ({ ...e, type: 'created' })),
      ...joinedEvents.map(e => ({ ...e, type: 'joined' }))
    ]

    // 去重（如果同时是创建者和参与者）
    const eventMap = new Map()
    allEvents.forEach(e => {
      if (!eventMap.has(e._id) || e.type === 'created') {
        eventMap.set(e._id, e)
      }
    })

    // 按创建时间排序
    const events = Array.from(eventMap.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    // 对合并结果集应用分页
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50)
    const safeSkip = Math.max(Number(skip) || 0, 0)
    const pagedEvents = events.slice(safeSkip, safeSkip + safeLimit)

    return {
      success: true,
      data: pagedEvents,
      total: events.length
    }
  } catch (err) {
    console.error('getMyEvents failed:', err)
    return {
      success: false,
      error: '操作失败，请重试'
    }
  }
}
