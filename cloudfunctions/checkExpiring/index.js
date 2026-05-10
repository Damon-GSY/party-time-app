// 云函数 - 检查即将过期的活动并发送提醒
// 由定时触发器调用（默认每6小时执行一次，可在 config.json 中修改 cron 表达式）

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 检查窗口：未来 24 小时内过期的活动
const EXPIRE_WINDOW_HOURS = 24

exports.main = async (event, context) => {
  console.log('[checkExpiring] 开始检查即将过期的活动')

  const now = new Date()
  const windowEnd = new Date(now.getTime() + EXPIRE_WINDOW_HOURS * 60 * 60 * 1000)

  let checkedCount = 0
  let notifiedCount = 0
  let errorCount = 0

  try {
    // NOTE: 使用本地服务器时间比较，存在与数据库写入时间的时钟偏差风险
  // 云开发 db.serverDate() 不支持算术运算，此处为最佳可用方案
    const CF_LIMIT = 100
    let allEvents = []
    let skipCount = 0
    while (true) {
      const eventsRes = await db.collection('events')
        .where({
          expireAt: _.gte(now.toISOString()).and(_.lte(windowEnd.toISOString())),
          'notifications.creatorSubscribed': true
        })
        .orderBy('expireAt', 'asc')
        .skip(skipCount)
        .limit(CF_LIMIT)
        .get()
      allEvents.push(...(eventsRes.data || []))
      if (eventsRes.data.length < CF_LIMIT) break
      skipCount += CF_LIMIT
    }

    const events = allEvents
    console.log(`[checkExpiring] 找到 ${events.length} 个即将过期的活动`)

    for (const eventItem of events) {
      checkedCount++
      const eventId = eventItem._id
      const creatorOpenId = eventItem._openid
      const eventName = eventItem.name || '聚会'

      try {
        // 检查是否已经发送过过期提醒（避免重复通知）
        const logRes = await db.collection('notification_logs')
          .where({
            eventId,
            type: 'expiring_soon',
            toOpenId: creatorOpenId
          })
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get()

        // 如果 24 小时内已经发送过，跳过
        if (logRes.data && logRes.data.length > 0) {
          const lastLog = logRes.data[0]
          const lastSent = new Date(lastLog.createdAt)
          const hoursSince = (now - lastSent) / (60 * 60 * 1000)
          if (hoursSince < 24) {
            console.log(`[checkExpiring] 活动 ${eventId} 已在近期提醒过，跳过`)
            continue
          }
        }

        // 先写入通知日志（防止并发检查重复发送）
        await db.collection('notification_logs').add({
          data: {
            eventId,
            type: 'expiring_soon',
            toOpenId: creatorOpenId,
            status: 'pending',
            content: { eventName },
            createdAt: db.serverDate()
          }
        })

        // 格式化过期时间
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

        // 调用 sendNotification 云函数
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
          // 更新通知日志状态为已发送
          try {
            await db.collection('notification_logs').where({
              eventId,
              type: 'expiring_soon',
              toOpenId: creatorOpenId,
              status: 'pending'
            }).update({ data: { status: 'sent' } })
          } catch (_) { /* non-critical */ }
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

  const summary = {
    checked: checkedCount,
    notified: notifiedCount,
    errors: errorCount,
    timestamp: now.toISOString()
  }

  console.log('[checkExpiring] 执行完成', summary)

  return summary
}
