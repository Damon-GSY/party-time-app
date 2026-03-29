/**
 * UI Effects 工具函数
 * Hero UI / Aceternity 风格效果在微信小程序中的实现
 */

/**
 * Spotlight 追光效果
 * @param {Object} component - Page/Component 实例
 * @param {string} cardSelector - 卡片选择器
 */
function initSpotlight(component, cardSelector) {
  return {
    onCardTouchMove(e) {
      const query = component.createSelectorQuery()
      query.select(cardSelector).boundingClientRect(rect => {
        if (!rect) return
        const touch = e.touches[0]
        const x = ((touch.clientX - rect.left) / rect.width * 100).toFixed(1)
        const y = ((touch.clientY - rect.top) / rect.height * 100).toFixed(1)
        component.setData({
          spotlightX: x + '%',
          spotlightY: y + '%',
          spotlightActive: true
        })
      }).exec()
    },
    onCardTouchEnd() {
      component.setData({ spotlightActive: false })
    }
  }
}

/**
 * 文字逐字显现效果
 * @param {string} text - 要拆分的文字
 * @returns {Array} 字符数组，每项含 char 和 delay
 */
function textGenerate(text) {
  return text.split('').map((char, i) => ({
    char,
    delay: i * 0.05
  }))
}

/**
 * 数字递增动画
 * @param {Object} component - Page/Component 实例
 * @param {string} dataKey - data 中的字段名
 * @param {number} target - 目标数字
 * @param {number} duration - 动画时长(ms)
 */
function animateNumber(component, dataKey, target, duration = 800) {
  const start = 0
  const startTime = Date.now()
  
  function step() {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    const current = Math.round(start + (target - start) * eased)
    component.setData({ [dataKey]: current })
    if (progress < 1) {
      setTimeout(step, 16)
    }
  }
  step()
}

/**
 * 性能等级检测
 */
function getPerformanceLevel() {
  try {
    const info = wx.getSystemInfoSync()
    const { pixelRatio } = info
    if (pixelRatio >= 3) return 'high'
    if (pixelRatio >= 2) return 'medium'
    return 'low'
  } catch (e) {
    return 'medium'
  }
}

/**
 * 根据性能等级判断是否启用某个效果
 */
function shouldEnableEffect(effectName) {
  const level = getPerformanceLevel()
  const effectMap = {
    high: { blur: true, borderBeam: true, meteor: true, beam: true, spotlight: true, shimmer: true, ripple: true },
    medium: { blur: true, borderBeam: true, meteor: true, beam: false, spotlight: true, shimmer: true, ripple: true },
    low: { blur: false, borderBeam: false, meteor: false, beam: false, spotlight: false, shimmer: true, ripple: false }
  }
  return effectMap[level]?.[effectName] ?? false
}

module.exports = {
  initSpotlight,
  textGenerate,
  animateNumber,
  getPerformanceLevel,
  shouldEnableEffect
}
