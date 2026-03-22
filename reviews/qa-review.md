# QA Review: preview.html

**Reviewer:** Claude (Reality Checker)
**Date:** 2026-03-22
**Status:** NEEDS WORK

---

## Executive Summary

Overall the preview is well-structured with good visual design and animations. However, there are several **functional bugs** and **accessibility issues** that need to be addressed before production. The JavaScript interactions work correctly for the most part, but the data model has inconsistencies between Vote and Result pages.

---

## Detailed Findings

### 1. Tab Switching — ✅ WORKS CORRECTLY

All 3 tabs (首页, 填写, 统计) switch correctly and show the right content.

**Code Review:** Lines 1858-1877 handle tab switching properly using `dataset.page` to target pages.

---

### 2. Vote Page — Slot Selection — ✅ WORKS

| Feature | Status |
|---------|--------|
| Click to toggle slot | ✅ Works |
| Clear button | ✅ Works |
| Select all button | ✅ Works |
| Selection count updates | ✅ Works |

**No bugs found in slot selection logic.**

---

### 3. Selection Count Real-time Update — ✅ WORKS

The count updates immediately when slots are toggled. The `countPop` animation triggers correctly on each change.

**Code Review:** Lines 1926-1940 correctly update the count with animation.

---

### 4. Create Page — ⚠️ MISSING

**BUG #1: "创建新聚会" button has no functionality**

```html
<!-- Line 1448-1452 -->
<button class="create-btn">
  <div class="btn-shimmer"></div>
  <span class="btn-icon">✨</span>
  <span class="btn-text">创建新聚会</span>
</button>
```

**Issue:** No click handler, no create page exists.

**Fix:** Add a click handler or create a create page:
```javascript
// Add after line 2029
document.querySelector('.create-btn').addEventListener('click', () => {
  // Navigate to create page or show create modal
  alert('创建聚会功能开发中...');
});
```

---

### 5. Result Page — Heatmap — ⚠️ INCONSISTENT DATA

**BUG #2: Vote page and Result page show different time ranges**

| Page | Time Range | Slots |
|------|------------|-------|
| Vote | 0:00 - 22:00 (2-hour gaps) | 12 slots (hours 0-23) |
| Result | 8:00 - 19:00 (1-hour gaps) | 12 slots (hours 8-19) |

**Vote page time axis (lines 1595-1608):**
```html
<span class="time-label">0</span>
<span class="time-label">2</span>
<!-- ... shows 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22 -->
```

**Result page heatmap (lines 1722-1749):**
```html
<div class="heatmap-cell level-1" data-hour="8">
<!-- ... shows hours 8-19 -->
```

**Fix:** Align the time ranges. Either:
- Option A: Vote page should also show 8:00-19:00
- Option B: Result page should show full 24 hours

**For Vote page (change time axis to match):**
```html
<div class="time-axis">
  <span class="time-label">8</span>
  <span class="time-label">10</span>
  <span class="time-label">12</span>
  <span class="time-label">14</span>
  <span class="time-label">16</span>
  <span class="time-label">18</span>
</div>
```

---

### 6. Mobile Responsiveness — ✅ GOOD

The layout works correctly at 375px width:
- Phone frame adapts to 100% width under 431px
- Flexbox layouts collapse properly
- Touch targets are adequate (44px+ buttons)

**No issues found.**

---

### 7. Animations — ✅ WORKING

All CSS animations are properly defined and triggered:
- `fadeIn` ✅
- `slideUp` ✅
- `bounce-gentle` ✅
- `shimmer` ✅
- `pulse-shadow` ✅
- `slotFadeIn` with stagger ✅
- `checkPop` ✅
- `countPop` ✅

---

### 8. JavaScript Errors — ✅ NO ERRORS

No syntax errors or runtime errors detected. All DOM queries have corresponding elements.

---

### 9. Dark Theme Consistency — ⚠️ MINOR ISSUE

**BUG #3: Modal lacks visual close affordance**

The modal has no close button, only the backdrop click works. Users may not know how to dismiss it.

**Fix:** Add a close button to the modal:
```html
<!-- After line 1387 -->
<div class="modal-header">
  <span class="modal-title" id="modal-title">...</span>
  <div class="modal-header-right">
    <span class="modal-count" id="modal-count">...</span>
    <button class="modal-close" aria-label="关闭">×</button>
  </div>
</div>
```

```css
/* Add to CSS */
.modal-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 24px;
  cursor: pointer;
  padding: 4px 8px;
  margin-left: 8px;
}
.modal-close:hover {
  color: #fff;
}
```

```javascript
// Add close button handler after line 2017
document.querySelector('.modal-close')?.addEventListener('click', () => {
  slotModal.classList.remove('show');
});
```

---

### 10. Accessibility Issues — ⚠️ NEEDS ATTENTION

**BUG #4: Missing ARIA attributes for tabs**

```html
<!-- Current (line 1842-1855) -->
<div class="tab-bar">
  <div class="tab-item active" data-page="index">
```

**Fix:**
```html
<div class="tab-bar" role="tablist">
  <div class="tab-item active" data-page="index" role="tab" aria-selected="true" aria-controls="page-index" tabindex="0">
    <span class="tab-icon">🏠</span>
    <span class="tab-label">首页</span>
  </div>
  <div class="tab-item" data-page="vote" role="tab" aria-selected="false" aria-controls="page-vote" tabindex="0">
    <span class="tab-icon">✏️</span>
    <span class="tab-label">填写</span>
  </div>
  <div class="tab-item" data-page="result" role="tab" aria-selected="false" aria-controls="page-result" tabindex="0">
    <span class="tab-icon">📊</span>
    <span class="tab-label">统计</span>
  </div>
</div>
```

**BUG #5: Missing keyboard navigation for tabs**

**Fix:**
```javascript
// Add after line 1876
tabItems.forEach(tab => {
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tab.click();
    }
  });
});
```

**BUG #6: Buttons use emoji without text fallback**

Some screen readers may not announce emojis properly.

**Fix:** Add `aria-label` to buttons:
```html
<button class="create-btn" aria-label="创建新聚会">
<button class="action-btn clear-btn" aria-label="清空选择">
<button class="action-btn select-all-btn" aria-label="全选">
```

**BUG #7: Modal missing ARIA attributes**

**Fix:**
```html
<div class="slot-modal" id="slot-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
```

---

## Additional Issues Found

### BUG #8: Event Cards Not Clickable

Event cards on the index page have no click handlers. They should navigate to the corresponding result/vote page.

**Current (lines 1465-1481):**
```html
<div class="event-card slide-up" style="animation-delay: 0s;">
```

**Fix:**
```javascript
// Add after line 2029
document.querySelectorAll('.event-card').forEach(card => {
  card.addEventListener('click', () => {
    // Switch to result page for this event
    document.querySelector('[data-page="result"]').click();
  });
});
```

---

### BUG #9: Date Tab Switching Clears Selections

When switching date tabs on Vote page, all selections are lost because `initSlots()` is called.

**Issue:** Users expect selections to persist when switching between dates.

**Fix:** Store selections per date:
```javascript
// Replace lines 1886-1905
const selectionsByDate = { 0: [], 1: [] };
let currentDate = 0;

function initSlots() {
  slotsGrid.innerHTML = '';
  const currentSelections = selectionsByDate[currentDate] || [];

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const isSelected = currentSelections.includes(i);
    const slotEl = document.createElement('div');
    slotEl.className = 'slot-cell' + (isSelected ? ' selected' : '');
    slotEl.dataset.index = i;
    slotEl.style.animationDelay = `${0.02 * i}s`;
    slotEl.innerHTML = isSelected
      ? '<div class="slot-inner"><div class="slot-check"><span class="check-icon">✓</span></div></div>'
      : '<div class="slot-inner"></div>';
    slotEl.addEventListener('click', () => toggleSlot(i));
    slotsGrid.appendChild(slotEl);
  }
}

// Update date tab handler
dateTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // Save current selections before switching
    selectionsByDate[currentDate] = slots
      .map((s, i) => s.selected ? i : -1)
      .filter(i => i >= 0);

    dateTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentDate = parseInt(tab.dataset.date);
    initSlots();
    updateSummary();
  });
});
```

---

### BUG #10: Heatmap Level-0 Cells Show Inconsistent Content

Some `level-0` cells are empty, others might show content. This is inconsistent.

**Current:**
```html
<div class="heatmap-cell level-0" data-hour="8"></div>  <!-- empty -->
<div class="heatmap-cell level-1" data-hour="9"><span class="cell-count">1</span></div>
```

**Fix:** Either show "0" for all empty cells or make them truly empty:
```css
/* If showing 0, add this */
.heatmap-cell.level-0 .cell-count {
  color: var(--text-muted);
  opacity: 0.5;
}
```

---

## Summary Table

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Create button non-functional | Medium | ❌ |
| 2 | Time range mismatch Vote/Result | High | ❌ |
| 3 | Modal no close button | Low | ❌ |
| 4 | Missing ARIA for tabs | Medium | ❌ |
| 5 | No keyboard nav for tabs | Medium | ❌ |
| 6 | Buttons missing aria-label | Low | ❌ |
| 7 | Modal missing ARIA | Medium | ❌ |
| 8 | Event cards not clickable | Medium | ❌ |
| 9 | Date switch clears selections | Medium | ❌ |
| 10 | Heatmap level-0 inconsistency | Low | ❌ |

---

## Verdict

**NEEDS WORK** — Core interactions work, but multiple issues affect UX and accessibility. Priority fixes:

1. **BUG #2** (High): Align time ranges between Vote and Result pages
2. **BUG #4, 5, 7** (Medium): Add proper ARIA attributes for accessibility
3. **BUG #8, #9** (Medium): Make navigation elements functional

The visual design and animations are solid. With these fixes, the preview will be production-ready.
