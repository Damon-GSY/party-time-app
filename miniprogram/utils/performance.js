import { getPerformanceLevel, shouldEnableEffect } from './ui-effects'

/**
 * 获取效果配置对象
 * 在 app.js 的 onLaunch 中调用，结果存入 globalData
 */
export function getEffectsConfig() {
  return {
    level: getPerformanceLevel(),
    blur: shouldEnableEffect('blur'),
    borderBeam: shouldEnableEffect('borderBeam'),
    meteor: shouldEnableEffect('meteor'),
    beam: shouldEnableEffect('beam'),
    spotlight: shouldEnableEffect('spotlight'),
    shimmer: shouldEnableEffect('shimmer'),
    ripple: shouldEnableEffect('ripple'),
  }
}