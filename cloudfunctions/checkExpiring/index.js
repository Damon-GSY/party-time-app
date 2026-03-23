// 云函数 - 检查即将过期的活动并发送提醒
// 由定时触发器调用（默认每6小时执行一次，可在 config.json 中修改 cron 表达式）

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const EXPIRE_WINDOW_HOURS = 24
const MAX_EVENTS_PER_RUN = 50

exports.main = async (event, context) => {
  console.log('[checkExpiring] 开始检查即将过期的活动')

  const now = new Date()
  const windowEnd = new Date(now.getTime() + EXPIRE_WINDOW_HOURS * 60 * 60 * 1000)

  let checkedCount = 0
  let notifiedCount = 0
  let errorCount = 0

  try {
    const eventsRes = await db.collection('events')
      .where({
        expireAt: _.gte(now.toISOString()).and(_.lte(windowEnd.toISOString())),
        'notifications.creatorSubscribed': true
      })
      .orderBy('expireAt', 'asc')
      .limit(MAX_EVENTS_PER_RUN)
      .get()

    const events = eventsRes.data || []
    console.log(`[checkExpiring] 找到 ${events.length} 个即将过期的活动`)

    for (const eventItem of events) {
      checkedCount++
      const eventId = eventItem._id
      const creatorOpenId = eventItem.createdBy || eventItem._openid
      const eventName = eventItem.name || '聚会'

      try {
        // 检查是否已发送过过期提醒（24小时内不重复）
        const logRes = await db.collection('notification_logs')
          .where({
            eventId,
            type: 'expiring_soon',
            toOpenId: creatorOpenId
          })
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get()

        if (logRes.data && logRes.data.length > 0) {
          const lastSent = new Date(logRes.data[0].createdAt)
          const hoursSince = (now - lastSent) / (60 * 60 * 1000)
          if (hoursSince < 24) {
            console.log(`[checkExpiring] 活动 ${eventId} 已在近期提醒过，跳过`)
            continue
          }
        }

        const expireDate = new Date(eventItem.expireAt)
        const diffHours = Math.floor((expireDate - now) / (60 * 60 * 1000))
        let expireTimeText = ''
        if (diffHours < 1) {
          expireTimeText = '不到1小时'
        } else if (diffHours < 24) {
          expireTimeText = `${diffHours}小时`
        } else {
          expireTimeText = `${Math.floor(diffHours / 24)}天`
        }

        const sendResult = await cloud.callFunction({
          name: 'sendNotification',
          data: {
            type: 'expiring_soon',
            eventId,
            toOpenId: creatorOpenId,
            data: {
              eventName,
              expireTime: `${expireTimeText}后过期`
            }
          }
        })

        if (sendResult.result && sendResult.result.success) {
          notifiedCount++
          console.log(`[checkExpiring] 已通知创建者 ${creatorOpenId}，活动：${eventName}`)
        } else {
          console.warn(`[checkExpiring] 通知发送失败`, {
            eventId,
            error: sendResult.result?.error
          })
        }
      } catch (err) {
        errorCount++
        console.error(`[checkExpiring] 处理活动 ${eventId} 失败`, err)
      }
    }
  } catch (err) {
    console.error('[checkExpiring] 查询活动失败', err)
  }

  const summary = { checked: checkedCount, notified: notifiedCount, errors: errorCount, timestamp: now.toISOString() }
  console.log('[checkExpiring] 执行完成', summary)
  return summary
}
