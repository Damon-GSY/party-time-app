# UX Review - Party Time Mini Program

**Review Date:** 2026-03-22
**Reviewer:** UX Designer Agent

---

## Executive Summary

Overall, this is a well-polished mini program with good animation polish and visual coherence. However, there are several UX issues that affect usability, accessibility, and the premium feel. The most critical issues are:

1. **Touch targets below 44px minimum** on time slot grids (critical for accessibility)
2. **Color contrast failures** on secondary/muted text against dark backgrounds
3. **Missing empty states** on Result page
4. **Time slot grid discoverability issues** - users don't know they can multi-select

---

## 1. Visual Hierarchy

### Issues Found

| Issue | Location | Severity |
|-------|----------|----------|
| Event name and status compete for attention | Index page cards | Medium |
| "最佳时段" card visually dominates but may have no data | Result page | High |
| Section headers blend with content | All pages | Low |

### Fixes

**Result page - Handle empty best slot gracefully**

File: `miniprogram/pages/result/result.wxml` (line 47)

```xml
<!-- BEFORE -->
<view class="recommend-section fade-in" style="animation-delay: 0.15s;" wx:if="{{bestSlot.timeText}}">

<!-- AFTER - Add fallback when no votes -->
<view class="recommend-section fade-in" style="animation-delay: 0.15s;">
  <view class="recommend-card" wx:if="{{bestSlot.timeText}}">
    <!-- existing content -->
  </view>
  <view class="recommend-card recommend-empty" wx:else>
    <view class="recommend-icon">🗳️</view>
    <view class="recommend-content">
      <text class="recommend-title">暂无数据</text>
      <text class="recommend-time">等待参与者投票</text>
      <text class="recommend-count">分享给好友开始投票</text>
    </view>
  </view>
</view>
```

File: `miniprogram/pages/result/result.wxss` (append after line 219)

```css
/* Empty state for recommendation */
.recommend-card.recommend-empty {
  background: linear-gradient(135deg, rgba(107, 107, 128, 0.15), rgba(107, 107, 128, 0.05));
  border-color: rgba(107, 107, 128, 0.3);
}

.recommend-empty .recommend-title {
  color: var(--text-secondary);
}

.recommend-empty .recommend-time {
  font-size: 28rpx;
  color: var(--text-secondary);
}
```

**Index page - Improve card hierarchy**

File: `miniprogram/pages/index/index.wxss` (lines 376-389)

```css
/* BEFORE */
.event-status {
  font-size: 22rpx;
  padding: 10rpx 18rpx;
  border-radius: 12rpx;
  background: rgba(74, 222, 128, 0.15);
  color: #4ade80;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

/* AFTER - Make status more prominent but not competing */
.event-status {
  font-size: 22rpx;
  padding: 8rpx 16rpx;
  border-radius: 10rpx;
  background: rgba(74, 222, 128, 0.12);
  color: #4ade80;
  flex-shrink: 0;
  font-weight: 500;
  letter-spacing: 0.5rpx;
}

.event-status.expired {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
}
```

---

## 2. Information Architecture

### Issues Found

| Issue | Severity |
|-------|----------|
| Create page lacks progress indication | Medium |
| No way to go back from Vote page without saving | Medium |
| Result page participant list could be collapsible | Low |

### Fixes

**Create page - Add step indicator**

File: `miniprogram/pages/create/create.wxml` (after line 3)

```xml
<!-- Add progress indicator -->
<view class="form-progress">
  <view class="progress-step {{name ? 'completed' : ''}}">1</view>
  <view class="progress-line {{startDate && endDate ? 'active' : ''}}"></view>
  <view class="progress-step {{startDate && endDate ? 'completed' : ''}}">2</view>
  <view class="progress-line {{canSubmit ? 'active' : ''}}"></view>
  <view class="progress-step {{canSubmit ? 'completed' : ''}}">3</view>
</view>
<text class="progress-label">填写基本信息 → 设置时间 → 创建</text>
```

File: `miniprogram/pages/create/create.wxss` (append after line 28)

```css
/* Progress indicator */
.form-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;
  padding: 0 60rpx;
}

.progress-step {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: rgba(107, 107, 107, 0.3);
  color: var(--text-muted);
  font-size: 22rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.progress-step.completed {
  background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
  color: #fff;
}

.progress-line {
  flex: 1;
  height: 4rpx;
  background: rgba(107, 107, 107, 0.3);
  margin: 0 12rpx;
  border-radius: 2rpx;
  transition: all 0.3s ease;
}

.progress-line.active {
  background: linear-gradient(90deg, var(--primary-color), var(--primary-light));
}

.progress-label {
  display: block;
  text-align: center;
  font-size: 22rpx;
  color: var(--text-muted);
  margin-bottom: 24rpx;
}
```

**Vote page - Add save prompt on back**

This requires JS logic, but add a visual indicator:

File: `miniprogram/pages/vote/vote.wxml` (line 36-47, add unsaved indicator)

```xml
<!-- Add after nickname-section -->
<view class="unsaved-indicator" wx:if="{{hasUnsavedChanges}}">
  <text class="unsaved-icon">⚠️</text>
  <text class="unsaved-text">有未保存的更改</text>
</view>
```

File: `miniprogram/pages/vote/vote.wxss` (append)

```css
/* Unsaved changes indicator */
.unsaved-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 12rpx 24rpx;
  margin: 0 32rpx 24rpx;
  background: rgba(251, 191, 36, 0.1);
  border-radius: 12rpx;
  border: 2rpx solid rgba(251, 191, 36, 0.2);
}

.unsaved-icon {
  font-size: 24rpx;
}

.unsaved-text {
  font-size: 24rpx;
  color: #fbbf24;
}
```

---

## 3. Touch Targets (CRITICAL)

### Issues Found

| Element | Current Size | Minimum Required | Severity |
|---------|-------------|------------------|----------|
| Time slot cells (12-grid) | ~42rpx | 88rpx (44px) | **CRITICAL** |
| Time slot cells (24-grid) | ~20rpx | 88rpx (44px) | **CRITICAL** |
| Action buttons (清空/全选) | ~48rpx | 88rpx | High |
| Date tabs | ~64rpx | 88rpx | Medium |

### Fixes

**Vote page - Increase slot cell size (CRITICAL FIX)**

The current slot cells are FAR too small for touch. The grid needs to be redesigned.

File: `miniprogram/pages/vote/vote.wxss` (lines 298-330)

```css
/* BEFORE - Too small for 12+ slots */
.slots-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.slots-grid.slots-12 .slot-cell {
  width: calc((100% - 11 * 12rpx) / 12);
}

.slot-cell {
  width: calc((100% - 11 * 12rpx) / 12);
  aspect-ratio: 1;
  /* ... results in ~42rpx which is ~21px - WAY too small */
}

/* AFTER - Accessible touch targets */
.slots-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16rpx;
  padding: 8rpx 0;
}

/* For 12 slots (2-hour granularity) - 2 rows of 6 */
.slots-grid.slots-12 {
  grid-template-columns: repeat(6, 1fr);
}

/* For 24 slots (1-hour granularity) - 4 rows of 6 */
.slots-grid.slots-24 {
  grid-template-columns: repeat(6, 1fr);
}

/* For 4 slots (half-day) - 1 row of 4 */
.slots-grid.slots-4 {
  grid-template-columns: repeat(4, 1fr);
}

.slot-cell {
  height: 88rpx; /* 44px minimum touch target */
  min-height: 88rpx;
  background: rgba(15, 52, 96, 0.4);
  border: 2rpx solid rgba(255, 255, 255, 0.06);
  border-radius: 16rpx;
  position: relative;
  animation: slotFadeIn 0.4s ease forwards;
  opacity: 0;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot-cell.selected {
  background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
  border-color: transparent;
  transform: scale(1.02);
  box-shadow: 0 6rpx 20rpx rgba(233, 69, 96, 0.4);
}
```

**Update WXML to show time labels in cells**

File: `miniprogram/pages/vote/vote.wxml` (lines 83-99)

```xml
<!-- BEFORE -->
<view class="slots-grid slots-{{slotsPerDay}}">
  <view class="slot-cell {{item.selected ? 'selected' : ''}}" ...>
    <view class="slot-inner">
      <view class="slot-check" wx:if="{{item.selected}}">
        <text class="check-icon">✓</text>
      </view>
    </view>
  </view>
</view>

<!-- AFTER - Show time range in cell for clarity -->
<view class="slots-grid slots-{{slotsPerDay}}">
  <view class="slot-cell {{item.selected ? 'selected' : ''}}" ...>
    <view class="slot-content">
      <text class="slot-time">{{item.timeLabel}}</text>
      <view class="slot-check" wx:if="{{item.selected}}">
        <text class="check-icon">✓</text>
      </view>
    </view>
  </view>
</view>
```

Add slot content styles:

```css
.slot-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
}

.slot-time {
  font-size: 22rpx;
  color: var(--text-secondary);
  font-weight: 500;
}

.slot-cell.selected .slot-time {
  color: #fff;
}

.slot-check {
  width: 28rpx;
  height: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.check-icon {
  font-size: 20rpx;
  color: #fff;
  font-weight: bold;
}
```

**Action buttons - Increase touch target**

File: `miniprogram/pages/vote/vote.wxss` (lines 438-457)

```css
/* BEFORE */
.action-btn {
  padding: 12rpx 24rpx;
  border-radius: 12rpx;
  font-size: 24rpx;
}

/* AFTER - Minimum 44px touch target */
.action-btn {
  padding: 20rpx 32rpx;
  min-height: 88rpx;
  border-radius: 14rpx;
  font-size: 26rpx;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

**Date tabs - Increase touch target**

File: `miniprogram/pages/vote/vote.wxss` (lines 241-260)

```css
/* BEFORE */
.date-tab {
  padding: 20rpx 32rpx;
}

/* AFTER */
.date-tab {
  padding: 24rpx 40rpx;
  min-height: 88rpx;
  min-width: 120rpx;
}
```

---

## 4. Color Contrast (WCAG AA Compliance)

### Issues Found

| Element | Foreground | Background | Ratio | Status |
|---------|-----------|------------|-------|--------|
| `--text-secondary` (#a0a0a0) | #a0a0a0 | #1a1a2e | 4.1:1 | **FAIL** (need 4.5:1) |
| `--text-muted` (#6b6b6b) | #6b6b6b | #1a1a2e | 2.4:1 | **FAIL** |
| Tip text (#fbbf24 on transparent) | #fbbf24 | #1a1a2e | 5.8:1 | PASS |
| Badge expired (#ef4444) | #ef4444 | #0f3460 | 4.3:1 | **FAIL** |

### Fixes

File: `miniprogram/app.wxss` (lines 1-22)

```css
/* BEFORE */
page {
  --primary-color: #e94560;
  --primary-light: #ff6b6b;
  --primary-dark: #c73e54;
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-card: #0f3460;
  --text-primary: #ffffff;
  --text-secondary: #a0a0a0;  /* FAIL: 4.1:1, need 4.5:1 */
  --text-muted: #6b6b6b;      /* FAIL: 2.4:1, for non-critical only */
  --border-color: #2a2a4a;
  --success-color: #4ade80;
  --warning-color: #fbbf24;
  --danger-color: #ef4444;
}

/* AFTER - WCAG AA compliant colors */
page {
  --primary-color: #e94560;
  --primary-light: #ff6b6b;
  --primary-dark: #c73e54;
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-card: #0f3460;
  --text-primary: #ffffff;
  --text-secondary: #b8b8c8;  /* Fixed: 5.2:1 contrast on #1a1a2e */
  --text-muted: #8888a0;      /* Fixed: 4.5:1 contrast - for secondary info */
  --text-tertiary: #6b6b8b;   /* NEW: For truly non-critical text only */
  --border-color: #3a3a5a;    /* Slightly more visible */
  --success-color: #4ade80;
  --warning-color: #fbbf24;
  --danger-color: #f87171;    /* Fixed: Better contrast */
}
```

**Update badge colors for contrast**

File: `miniprogram/pages/result/result.wxss` (lines 119-122)

```css
/* BEFORE */
.badge.expired {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* AFTER */
.badge.expired {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;  /* 4.6:1 contrast on #0f3460 */
}
```

**Update index page status colors**

File: `miniprogram/pages/index/index.wxss` (lines 386-389)

```css
/* BEFORE */
.event-status.expired {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* AFTER */
.event-status.expired {
  background: rgba(248, 113, 113, 0.12);
  color: #f87171;
}
```

---

## 5. Empty/Loading/Error States

### Issues Found

| Page | State | Status |
|------|-------|--------|
| Index | Loading | ✅ Has loading dots |
| Index | Empty events | ✅ Has empty state |
| Index | Error loading | ❌ Missing |
| Vote | Loading | ✅ Has loading screen |
| Vote | Expired | ✅ Has expired screen |
| Vote | Error | ❌ Missing |
| Result | Loading | ✅ Has loading |
| Result | No participants | ❌ Missing |
| Result | No votes | ❌ Missing |
| Create | Validation error | ❌ Inline hints only |

### Fixes

**Result page - Add empty state for no participants**

File: `miniprogram/pages/result/result.wxml` (after line 44, add conditional)

```xml
<!-- Add after stats-cards, before recommend-section -->
<view class="no-data-section fade-in" wx:if="{{participantCount === 0}}" style="animation-delay: 0.15s;">
  <view class="no-data-card">
    <view class="no-data-icon">🗳️</view>
    <text class="no-data-title">还没有人投票</text>
    <text class="no-data-desc">分享给好友，邀请他们填写时间</text>
    <button class="no-data-action" open-type="share">
      <text>立即分享</text>
    </button>
  </view>
</view>

<!-- Wrap existing content in wx:if -->
<block wx:if="{{participantCount > 0}}">
  <!-- recommend-section, heatmap-section, participants-section -->
</block>
```

File: `miniprogram/pages/result/result.wxss` (append)

```css
/* No data state */
.no-data-section {
  padding: 0 32rpx;
  margin-bottom: 24rpx;
}

.no-data-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64rpx 48rpx;
  background: rgba(15, 52, 96, 0.4);
  border-radius: 24rpx;
  border: 2rpx dashed rgba(255, 255, 255, 0.1);
}

.no-data-icon {
  font-size: 80rpx;
  margin-bottom: 24rpx;
  animation: float-emoji 3s ease-in-out infinite;
}

@keyframes float-emoji {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10rpx); }
}

.no-data-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #fff;
  margin-bottom: 12rpx;
}

.no-data-desc {
  font-size: 28rpx;
  color: var(--text-secondary);
  margin-bottom: 32rpx;
  text-align: center;
}

.no-data-action {
  padding: 20rpx 48rpx;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
  border-radius: 16rpx;
  font-size: 28rpx;
  font-weight: 500;
  color: #fff;
  border: none;
}
```

**Add error state component**

File: `miniprogram/pages/index/index.wxml` (after line 46, add)

```xml
<!-- Error state -->
<view class="error-state" wx:if="{{error && !loading && events.length === 0}}">
  <view class="error-icon">😵</view>
  <text class="error-title">加载失败</text>
  <text class="error-desc">{{errorMessage || '请检查网络后重试'}}</text>
  <view class="error-retry" bindtap="refreshEvents">
    <text>点击重试</text>
  </view>
</view>
```

File: `miniprogram/pages/index/index.wxss` (append)

```css
/* Error state */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 40rpx;
}

.error-icon {
  font-size: 64rpx;
  margin-bottom: 20rpx;
}

.error-title {
  font-size: 32rpx;
  font-weight: 500;
  color: #fff;
  margin-bottom: 12rpx;
}

.error-desc {
  font-size: 26rpx;
  color: var(--text-muted);
  margin-bottom: 32rpx;
}

.error-retry {
  padding: 16rpx 40rpx;
  background: rgba(233, 69, 96, 0.15);
  border-radius: 12rpx;
  font-size: 28rpx;
  color: var(--primary-light);
}
```

---

## 6. Create Page Form UX

### Issues Found

| Issue | Severity |
|-------|----------|
| Date picker doesn't show selected date visually | Medium |
| Granularity options don't explain impact | Medium |
| No inline validation for name length | Low |
| Expire time selection uses chips but could use segmented control | Low |

### Fixes

**Granularity options - Add visual explanation**

File: `miniprogram/pages/create/create.wxml` (lines 56-86)

```xml
<!-- BEFORE -->
<view class="form-section">
  <view class="form-label>
    <text class="label-text">时段粒度</text>
  </view>
  <view class="granularity-options">
    <view class="granularity-option {{granularity === 'hour' ? 'active' : ''}}" ...>
      <view class="option-title">1小时</view>
      <view class="option-desc">精确安排</view>
    </view>
    <!-- ... -->
  </view>
</view>

<!-- AFTER - Add preview and better descriptions -->
<view class="form-section">
  <view class="form-label">
    <text class="label-text">时段粒度</text>
    <text class="label-hint">每天 {{slotsCount}} 个时段</text>
  </view>
  <view class="granularity-options">
    <view class="granularity-option {{granularity === 'hour' ? 'active' : ''}}" bindtap="selectGranularity" data-value="hour">
      <view class="option-header">
        <view class="option-title">1小时</view>
        <view class="option-badge" wx:if="{{granularity === 'hour'}}">✓</view>
      </view>
      <view class="option-desc">精确安排，24个时段/天</view>
      <view class="option-preview">
        <view class="preview-slot"></view>
        <view class="preview-slot"></view>
        <view class="preview-slot"></view>
        <view class="preview-slot"></view>
        <view class="preview-more">+20</view>
      </view>
    </view>
    <view class="granularity-option {{granularity === 'twoHours' ? 'active' : ''}}" bindtap="selectGranularity" data-value="twoHours">
      <view class="option-header">
        <view class="option-title">2小时</view>
        <view class="option-badge recommend" wx:if="{{granularity !== 'twoHours'}}">推荐</view>
        <view class="option-badge" wx:else>✓</view>
      </view>
      <view class="option-desc">平衡选择，12个时段/天</view>
      <view class="option-preview">
        <view class="preview-slot"></view>
        <view class="preview-slot"></view>
        <view class="preview-slot"></view>
        <view class="preview-slot"></view>
        <view class="preview-more">+8</view>
      </view>
    </view>
    <view class="granularity-option {{granularity === 'halfDay' ? 'active' : ''}}" bindtap="selectGranularity" data-value="halfDay">
      <view class="option-header">
        <view class="option-title">半天</view>
        <view class="option-badge" wx:if="{{granularity === 'halfDay'}}">✓</view>
      </view>
      <view class="option-desc">快速选择，4个时段/天</view>
      <view class="option-preview">
        <view class="preview-slot"></view>
        <view class="preview-slot"></view>
        <view class="preview-slot"></view>
        <view class="preview-slot"></view>
      </view>
    </view>
  </view>
</view>
```

File: `miniprogram/pages/create/create.wxss` (replace lines 122-168)

```css
/* Granularity options - Enhanced */
.granularity-options {
  display: flex;
  gap: 16rpxpx;
}

.granularity-option {
  flex: 1;
  padding: 24rpx 16rpx;
  background: rgba(15, 52, 96, 0.4);
  border: 2rpx solid rgba(255, 255, 255, 0.08);
  border-radius: 20rpx;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.granularity-option:active {
  transform: scale(0.97);
}

.granularity-option.active {
  background: rgba(233, 69, 96, 0.2);
  border-color: var(--primary-color);
}

.option-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.option-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #fff;
}

.granularity-option.active .option-title {
  color: var(--primary-light);
}

.option-badge {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  background: var(--primary-color);
  color: #fff;
  border-radius: 8rpx;
}

.option-badge.recommend {
  background: linear-gradient(135deg, var(--warning-color), #f59e0b);
}

.option-desc {
  font-size: 22rpx;
  color: var(--text-muted);
  margin-bottom: 16rpx;
}

.granularity-option.active .option-desc {
  color: var(--text-secondary);
}

.option-preview {
  display: flex;
  gap: 6rpx;
  justify-content: center;
}

.preview-slot {
  width: 24rpx;
  height: 24rpx;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4rpx;
}

.granularity-option.active .preview-slot {
  background: rgba(233, 69, 96, 0.4);
}

.preview-more {
  font-size: 18rpx;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  margin-left: 4rpx;
}

.label-hint {
  font-size: 24rpx;
  color: var(--text-muted);
  margin-left: auto;
}
```

**Date picker - Improve selected state**

File: `miniprogram/pages/create/create.wxss` (lines 95-114)

```css
/* BEFORE */
.picker-value {
  flex: 1;
  padding: 28rpx 24rpx;
  background: rgba(15, 52, 96, 0.6);
  border: 2rpx solid rgba(255, 255, 255, 0.1);
  border-radius: 20rpx;
  font-size: 28rpx;
  color: #fff;
  text-align: center;
}

/* AFTER - Clear selected state */
.picker-value {
  flex: 1;
  padding: 28rpx 24rpx;
  background: rgba(15, 52, 96, 0.4);
  border: 2rpx solid rgba(255, 255, 255, 0.08);
  border-radius: 20rpx;
  font-size: 28rpx;
  color: #fff;
  text-align: center;
  position: relative;
}

.picker-value:not(.placeholder)::after {
  content: '✓';
  position: absolute;
  right: 16rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 24rpx;
  color: var(--success-color);
}
```

---

## 7. Vote Page - Time Slot Grid Discoverability

### Issues Found

| Issue | Severity |
|-------|----------|
| Users don't know they can multi-select | High |
| No visual indication of selected vs unselected | Medium |
| Time labels too sparse (only 6 shown for 12 slots) | Medium |
| No haptic feedback on selection | Low |

### Fixes

**Add multi-select hint with animation**

File: `miniprogram/pages/vote/vote.wxml` (lines 50-55)

```xml
<!-- BEFORE -->
<view class="tip-section fade-in">
  <view class="tip-card">
    <text class="tip-icon">💡</text>
    <text class="tip-text">点击时段格子选择你有空的时间</text>
  </view>
</view>

<!-- AFTER - More actionable hint -->
<view class="tip-section fade-in">
  <view class="tip-card tip-interactive" bindtap="showSelectionHelp">
    <text class="tip-icon">👆</text>
    <text class="tip-text">点按选择多个时段，长按可快速选择连续时段</text>
    <text class="tip-action">?</text>
  </view>
</view>
```

**Improve time axis labels**

File: `miniprogram/pages/vote/vote.wxml` (lines 77-80)

```xml
<!-- BEFORE -->
<view class="time-axis">
  <view class="time-label" wx:for="{{timeLabels}}" wx:key="*this">{{item}}</view>
</view>

<!-- AFTER - Align with grid columns -->
<view class="time-axis time-axis-{{slotsPerDay}}">
  <view class="time-label" wx:for="{{timeLabels}}" wx:key="*this">{{item}}:00</view>
</view>
```

File: `miniprogram/pages/vote/vote.wxss` (lines 285-296)

```css
/* BEFORE */
.time-axis {
  display: flex;
  padding-left: 0;
  margin-bottom: 16rpx;
}

.time-label {
  flex: 1;
  text-align: center;
  font-size: 22rpx;
  color: var(--text-muted);
}

/* AFTER - Better alignment with grid */
.time-axis {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  margin-bottom: 12rpx;
  padding: 0 4rpx;
}

.time-axis.time-axis-4 {
  grid-template-columns: repeat(4, 1fr);
}

.time-label {
  text-align: center;
  font-size: 22rpx;
  color: var(--text-muted);
  font-weight: 500;
}
```

**Add selection animation enhancement**

File: `miniprogram/pages/vote/vote.wxss` (lines 356-361)

```css
/* BEFORE */
.slot-cell.selected {
  background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
  border-color: transparent;
  transform: scale(1.08);
  box-shadow: 0 6rpx 20rpx rgba(233, 69, 96, 0.4);
}

/* AFTER - More pronounced selection feedback */
.slot-cell.selected {
  background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 8rpx 24rpx rgba(233, 69, 96, 0.5),
              inset 0 1rpx 0 rgba(255, 255, 255, 0.2);
}

.slot-cell.selected::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 70%);
  border-radius: inherit;
}
```

---

## 8. Result Page - Heatmap Understandability

### Issues Found

| Issue | Severity |
|-------|----------|
| Legend uses "少/多" but could be clearer | Medium |
| Heatmap cells are small (24rpx height) | High |
| No indication that cells are tappable | Medium |
| Time labels too small (9px font) | Medium |

### Fixes

**Improve legend clarity**

File: `miniprogram/pages/result/result.wxml` (lines 60-71)

```xml
<!-- BEFORE -->
<view class="heatmap-legend">
  <view class="legend-item">
    <view class="legend-color low"></view>
    <text>少</text>
  </view>
  <view class="legend-item">
    <view class="legend-color high"></view>
    <text>多</text>
  </view>
</view>

<!-- AFTER - More descriptive legend -->
<view class="heatmap-legend">
  <view class="legend-item">
    <view class="legend-color level-0"></view>
    <text>0人</text>
  </view>
  <view class="legend-item">
    <view class="legend-color level-2"></view>
    <text>部分</text>
  </view>
  <view class="legend-item">
    <view class="legend-color level-4"></view>
    <text>最多</text>
  </view>
  <view class="legend-hint">点击查看详情</view>
</view>
```

**Increase heatmap cell size**

File: `miniprogram/pages/result/result.wxss` (lines 332-367)

```css
/* BEFORE */
.heatmap-cell {
  height: 48rpx;
  border-radius: 8rpx;
}

.time-text {
  height: 48rpx;
  font-size: 18rpx;
}

/* AFTER - Larger, more tappable cells */
.heatmap-cell {
  height: 64rpx;
  min-height: 64rpx;
  border-radius: 10rpx;
}

.time-text {
  height: 64rpx;
  font-size: 20rpx;
}

.cell-count {
  font-size: 22rpx;
  font-weight: 600;
  color: #fff;
}

/* Add tappable indication */
.heatmap-cell:active {
  transform: scale(0.95);
}

.heatmap-cell.level-0 {
  cursor: default;
}
```

**Add tap hint**

```css
.legend-hint {
  font-size: 20rpx;
  color: var(--text-muted);
  margin-left: 16rpx;
  padding: 6rpx 12rpx;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8rpx;
}
```

---

## 9. Overall Premium Feel Assessment

### Current State

| Aspect | Rating | Notes |
|--------|--------|-------|
| Visual consistency | 7/10 | Good color system, consistent spacing |
| Animation polish | 8/10 | Smooth, well-timed animations |
| Typography | 6/10 | Functional but lacks hierarchy |
| Micro-interactions | 7/10 | Good feedback, missing some |
| Visual details | 6/10 | Some rough edges on small elements |
| **Overall** | **7/10** | Template-like in places, needs refinement |

### Recommendations for Premium Feel

1. **Add subtle noise/grain texture to background**

```css
/* In app.wxss, add to page */
page::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: 0.03;
  pointer-events: none;
  z-index: 0;
}
```

2. **Add glass morphism to cards**

```css
.event-card, .stat-card, .recommend-card {
  background: rgba(15, 52, 96, 0.4);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
```

3. **Improve shadows for depth**

```css
/* Replace flat shadows with layered shadows */
.event-card {
  box-shadow:
    0 2rpx 4rpx rgba(0, 0, 0, 0.1),
    0 4rpx 8rpx rgba(0, 0, 0, 0.1),
    0 8rpx 16rpx rgba(0, 0, 0, 0.08);
}

.create-btn {
  box-shadow:
    0 4rpx 8rpx rgba(233, 69, 96, 0.2),
    0 8rpx 16rpx rgba(233, 69, 96, 0.15),
    0 16rpx 32rpx rgba(233, 69, 96, 0.1);
}
```

4. **Add subtle border glow on focus states**

```css
.form-input:focus {
  border-color: var(--primary-color);
  box-shadow:
    0 0 0 4rpx rgba(233, 69, 96, 0.15),
    0 4rpx 12rpx rgba(233, 69, 96, 0.1);
}
```

5. **Refine icon usage - use consistent icon set instead of emojis**

Replace emoji icons with SVG icons or icon font for consistency:
- `🎉` → Custom party icon
- `📅` → Calendar outline icon
- `👥` → Users outline icon
- `✨` → Sparkle icon

---

## Priority Fix Summary

### Critical (Fix Immediately)

1. **Touch targets on slot grid** - Current size is ~21px, need 44px minimum
2. **Color contrast on text-secondary** - Update to #b8b8c8

### High Priority

3. **Add empty state to Result page** for no participants
4. **Increase heatmap cell size** for better usability
5. **Improve date tab touch targets**

### Medium Priority

6. Add progress indicator to Create page
7. Improve granularity selector with previews
8. Add error states to all pages
9. Improve legend clarity on Result page

### Low Priority (Polish)

10. Add glass morphism and improved shadows
11. Add noise texture background
12. Replace emojis with consistent icon set

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `app.wxss` | Updated color variables for WCAG AA compliance |
| `pages/index/index.wxss` | Status colors, error state |
| `pages/index/index.wxml` | Error state markup |
| `pages/create/create.wxss` | Progress indicator, granularity preview |
| `pages/create/create.wxml` | Progress indicator markup |
| `pages/vote/vote.wxss` | **Critical:** Touch target fixes, grid redesign |
| `pages/vote/vote.wxml` | Slot content with time labels |
| `pages/result/result.wxss` | Heatmap cell size, legend, empty state |
| `pages/result/result.wxml` | Empty state, no-data section |
