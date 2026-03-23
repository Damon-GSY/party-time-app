/**
 * 通知配置 - 模板 ID 常量
 * 
 * 使用前请替换为你在微信公众平台申请的订阅消息模板 ID
 * 申请路径：微信公众平台 -> 功能 -> 订阅消息 -> 选用模板
 */

// 新参与通知：有人参与投票时通知创建者
const TEMPLATE_NEW_PARTICIPANT = 'your_template_id_new_participant'

// 即将过期通知：活动即将过期提醒
const TEMPLATE_EXPIRING_SOON = 'your_template_id_expiring_soon'

// 结果通知：找到最佳时间后通知参与者
const TEMPLATE_RESULT_READY = 'your_template_id_result_ready'

module.exports = {
  TEMPLATE_NEW_PARTICIPANT,
  TEMPLATE_EXPIRING_SOON,
  TEMPLATE_RESULT_READY
}
