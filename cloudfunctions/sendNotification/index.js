// 云函数 - 发送订阅消息通知
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 模板 ID 配置（与前端 config/notification.js 保持一致）
const TEMPLATE_IDS = {
  new_participant: 'your_template_id_new_participant',
  expiring_soon: 'your_template_id_expiring_soon',
  result_ready: 'your_template_id_result_ready'
}

// 模板消息字段映射
const TEMPLATE_DATA_MAP = {
  new_participant: (data) => ({
    thing1: { value: truncate(data.participantName || '有人', 20) },
    thing2: { value: truncate(data.eventName || '聚会', 20) },
    time3: { value: formatNow() }
  }),
  expiring_soon: (data) => ({
    thing1: { value: truncate(data.eventName || '聚会', 20) },
    time2: { value: truncate(data.expireTime || '即将过期', 20) }
  }),
  result_ready: (data) => ({
    thing1: { value: truncate(data.eventName || '聚会', 20) },
    thing2: { value: truncate(data.bestTime || '已确定', 20) },
    thing3: { value: formatNow() }
  })
}

function truncate(str, maxLen) {
  if (!str) return ''
  return str.length > maxLen ? str.substring(0, maxLen) : str
}

function formatNow() {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  return `${month}月${day}日 ${hour}:${minute}`
}

exports.main = async (event, context) => {
  const { type, eventId, toOpenId, data = {} } = event

  if (!type || !eventId || !toOpenId) {
    console.error('[sendNotification] 参数缺失', { type, eventId, toOpenId })
    return { success: false, error: '参数缺失：type, eventId, toOpenId' }
  }

  if (!TEMPLATE_IDS[type]) {
    console.error('[sendNotification] 不支持的类型', { type })
    return { success: false, error: `不支持的通知类型：${type}` }
  }

  const templateId = TEMPLATE_IDS[type]

  if (templateId.startsWith('your_template_id')) {
    console.warn(`[sendNotification] 模板 ID 未配置，跳过发送`, { type })
    return { success: false, error: '模板 ID 未配置，请在 TEMPLATE_IDS 中替换为真实模板 ID' }
  }

  try {
    const buildFn = TEMPLATE_DATA_MAP[type]
    if (!buildFn) {
      return { success: false, error: `不支持的类型：${type}` }
    }

    const templateData = buildFn(data)

    console.log('[sendNotification] 发送通知', { type, eventId, toOpenId, templateId, templateData })

    const result = await cloud.openapi.subscribeMessage.send({
      touser: toOpenId,
      templateId,
      page: type === 'result_ready'
        ? `/pages/result/result?id=${eventId}`
        : `/pages/vote/vote?id=${eventId}`,
      data: templateData
    })

    console.log('[sendNotification] 发送结果', result)

    // 记录通知历史
    if (result.errcode === 0 || result.errcode === 43101) {
      try {
        await db.collection('notification_logs').add({
          data: {
            eventId,
            type,
            toOpenId,
            status: result.errcode === 0 ? 'sent' : 'not_subscribed',
            content: data,
            createdAt: db.serverDate()
          }
        })
      } catch (logErr) {
        console.warn('[sendNotification] 记录通知日志失败', logErr)
      }
    }

    if (result.errcode === 0) {
      return { success: true }
    } else if (result.errcode === 43101) {
      return { success: false, error: '用户未订阅该消息' }
    } else {
      return { success: false, error: `发送失败：${result.errmsg || result.errcode}` }
    }
  } catch (err) {
    console.error('[sendNotification] 异常', err)
    return { success: false, error: err.message || '发送失败' }
  }
}
