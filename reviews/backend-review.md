# Backend Architecture Review - Party Time Mini Program

## Executive Summary

This review identifies **17 issues** across data model, validation, security, performance, and logic. The code is functional but has several critical gaps that will cause problems at scale and expose security vulnerabilities.

---

## 1. Data Model Issues

### Issue 1.1: Missing Database Indexes

**Problem**: No indexes defined. Queries will scan full collections as data grows.

**Collections needing indexes**:
- `responses`: queried by `eventId` + `_openid` (unique constraint)
- `responses`: queried by `eventId` alone (aggregation)
- `events`: queried by `createdBy` (user's events list)

**Fix**: Create database indexes via cloud console or migration script:

```javascript
// cloudfunctions/migrateIndexes/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const db = cloud.database()

  // Index for responses lookup by event + user
  await db.collection('responses').createIndex({
    keys: { eventId: 1, _openid: 1 },
    unique: true  // Prevent duplicate responses
  })

  // Index for responses aggregation by event
  await db.collection('responses').createIndex({
    keys: { eventId: 1 }
  })

  // Index for events by creator
  await db.collection('events').createIndex({
    keys: { createdBy: 1, createdAt: -1 }
  })
}
```

### Issue 1.2: Missing `_openid` in Responses

**Problem**: `submitResponse` creates responses without `_openid`, but the query filters by it. WeChat cloud database auto-injects `_openid` only when using client SDK, not cloud functions.

**Location**: `cloudfunctions/submitResponse/index.js:61-68`

**Fix**:

```javascript
// In submitResponse/index.js, line 61
await db.collection('responses').add({
  data: {
    eventId,
    nickname: responseName,
    slots,
    _openid: openid,  // ADD THIS - explicit openid for cloud function writes
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }
})
```

### Issue 1.3: Missing Event Status Field

**Problem**: No explicit status field. Expiration check is computed client-side.

**Fix**: Add status field in `createEvent`:

```javascript
// In createEvent/index.js, line 73-85
const result = await db.collection('events').add({
  data: {
    name: name.trim(),
    startDate,
    endDate,
    granularity,
    expireType,
    expireAt: expireAt.toISOString(),
    note: note.trim(),
    status: 'active',  // ADD: 'active' | 'expired' | 'cancelled'
    createdBy: cloud.getWXContext().OPENID,
    createdAt: db.serverDate(),
    responseCount: 0  // ADD: denormalized count for display
  }
})
```

### Issue 1.4: No Soft Delete Support

**Problem**: `deleteEvent` does hard delete. No recovery possible.

**Location**: `miniprogram/pages/result/result.js:356-369`

**Recommendation**: Add `deletedAt` field instead of removing documents.

---

## 2. Input Validation Issues

### Issue 2.1: Weak Name Validation

**Problem**: Only checks if name exists, no length limit, no sanitization.

**Location**: `cloudfunctions/createEvent/index.js:14`

**Fix**:

```javascript
// In createEvent/index.js, replace lines 13-19
const MAX_NAME_LENGTH = 50
const MAX_NOTE_LENGTH = 200

// Sanitize and validate name
const sanitizedName = (name || '').trim().slice(0, MAX_NAME_LENGTH)
if (!sanitizedName) {
  return { success: false, error: '请输入活动名称' }
}
if (sanitizedName.length < 2) {
  return { success: false, error: '活动名称至少2个字符' }
}

// Sanitize note
const sanitizedNote = (note || '').trim().slice(0, MAX_NOTE_LENGTH)
```

### Issue 2.2: No Slot Validation in submitResponse

**Problem**: Accepts any `slots` array without validating format or matching event's date range.

**Location**: `cloudfunctions/submitResponse/index.js:15`

**Fix**:

```javascript
// In submitResponse/index.js, after line 38 (after event exists check)
const MAX_SLOTS = 1000  // Reasonable limit

// Validate slots array
if (!Array.isArray(slots) || slots.length === 0) {
  return { success: false, error: '请至少选择一个时段' }
}
if (slots.length > MAX_SLOTS) {
  return { success: false, error: `最多选择${MAX_SLOTS}个时段` }
}

// Validate slot format: YYYY-MM-DD_N
const slotPattern = /^\d{4}-\d{2}-\d{2}_\d+$/
for (const slot of slots) {
  if (typeof slot !== 'string' || !slotPattern.test(slot)) {
    return { success: false, error: '时段格式错误' }
  }

  // Verify slot is within event's date range
  const [slotDate] = slot.split('_')
  if (slotDate < eventData.startDate || slotDate > eventData.endDate) {
    return { success: false, error: '所选时段不在活动日期范围内' }
  }
}
```

### Issue 2.3: Nickname Not Sanitized

**Problem**: Arbitrary user input stored without sanitization. XSS risk if rendered in HTML contexts.

**Location**: `cloudfunctions/submitResponse/index.js:48`

**Fix**:

```javascript
// Add helper function at top of file
const sanitizeNickname = (name) => {
  if (!name || typeof name !== 'string') return '匿名用户'

  // Remove potential XSS vectors
  const sanitized = name
    .trim()
    .slice(0, 20)  // Max 20 chars
    .replace(/[<>\"\'&]/g, '')  // Remove HTML chars
    .replace(/\s+/g, ' ')  // Collapse whitespace

  return sanitized || '匿名用户'
}

// Replace line 48
const responseName = sanitizeNickname(nickname)
```

### Issue 2.4: Missing Granularity Validation

**Problem**: Accepts any granularity value, could break frontend slot generation.

**Location**: `cloudfunctions/createEvent/index.js:11`

**Fix**:

```javascript
// In createEvent/index.js, after line 19
const VALID_GRANULARITIES = ['hour', 'twoHours', 'halfDay']
if (!VALID_GRANULARITIES.includes(granularity)) {
  return { success: false, error: '无效的时间粒度' }
}

const VALID_EXPIRE_TYPES = ['24h', '3days', '7days', 'never']
if (!VALID_EXPIRE_TYPES.includes(expireType)) {
  return { success: false, error: '无效的过期时间' }
}
```

---

## 3. Error Handling Issues

### Issue 3.1: Generic Error Messages

**Problem**: Catches all errors and returns generic messages, losing debug info.

**Location**: All cloud functions' catch blocks

**Fix**:

```javascript
// In all cloud functions, improve catch blocks
} catch (err) {
  console.error('创建活动失败', {
    error: err,
    event: event,  // Log input for debugging
    openid: cloud.getWXContext().OPENID
  })

  // Return specific error for known cases
  if (err.errCode === -1) {
    return { success: false, error: '数据库操作失败，请重试' }
  }

  return {
    success: false,
    error: err.message || '操作失败',
    errorCode: err.errCode  // Include for client-side handling
  }
}
```

### Issue 3.2: No Transaction for Response Update

**Problem**: Update/create response without transaction. Concurrent submissions could cause race conditions.

**Location**: `cloudfunctions/submitResponse/index.js:50-70`

**Fix** (use atomic upsert pattern):

```javascript
// Replace the entire try block in submitResponse
try {
  // Check event exists and not expired
  const eventRes = await db.collection('events').doc(eventId).get()
  if (!eventRes.data) {
    return { success: false, error: '活动不存在' }
  }

  const eventData = eventRes.data
  if (eventData.expireAt && new Date() > new Date(eventData.expireAt)) {
    return { success: false, error: '活动已过期' }
  }

  // Validate slots (see Issue 2.2)
  // ... validation code ...

  const responseName = sanitizeNickname(nickname)

  // Use atomic operation with conflict retry
  const existingRes = await db.collection('responses')
    .where({ eventId, _openid: openid })
    .get()

  if (existingRes.data && existingRes.data.length > 0) {
    // Update existing
    const updateResult = await db.collection('responses')
      .doc(existingRes.data[0]._id)
      .update({
        data: {
          nickname: responseName,
          slots,
          updatedAt: db.serverDate()
        }
      })

    if (updateResult.stats.updated === 0) {
      throw new Error('更新失败，请重试')
    }
  } else {
    // Create new with explicit openid
    await db.collection('responses').add({
      data: {
        eventId,
        nickname: responseName,
        slots,
        _openid: openid,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    })
  }

  return { success: true }
} catch (err) {
  // Error handling...
}
```

---

## 4. Security Issues

### Issue 4.1: No Rate Limiting

**Problem**: Users can spam createEvent and submitResponse without limits.

**Fix**: Implement simple rate limiting using a counter collection:

```javascript
// Add rate limit helper
const checkRateLimit = async (db, openid, action) => {
  const now = new Date()
  const windowStart = new Date(now - 60 * 1000)  // 1 minute window

  const counterCol = db.collection('rateLimits')
  const res = await counterCol
    .where({
      _openid: openid,
      action,
      timestamp: db.command.gte(windowStart)
    })
    .count()

  const limits = {
    createEvent: 5,      // 5 events per minute
    submitResponse: 10   // 10 responses per minute
  }

  if (res.total >= (limits[action] || 10)) {
    return false  // Rate limited
  }

  // Record this action
  await counterCol.add({
    data: {
      _openid: openid,
      action,
      timestamp: now
    }
  })

  return true  // Allowed
}

// Use in createEvent
const openid = cloud.getWXContext().OPENID
if (!await checkRateLimit(db, openid, 'createEvent')) {
  return { success: false, error: '操作太频繁，请稍后再试' }
}
```

### Issue 4.2: No Authorization for Delete

**Problem**: `deleteEvent` in frontend doesn't verify user is the creator.

**Location**: `miniprogram/pages/result/result.js:356-369`

**Fix**: Add authorization check:

```javascript
// In cloudfunctions/deleteEvent/index.js (NEW FILE)
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { eventId } = event
  const openid = cloud.getWXContext().OPENID

  if (!eventId) {
    return { success: false, error: '缺少活动ID' }
  }

  try {
    // Verify ownership
    const eventRes = await db.collection('events').doc(eventId).get()
    if (!eventRes.data) {
      return { success: false, error: '活动不存在' }
    }

    if (eventRes.data.createdBy !== openid) {
      return { success: false, error: '无权删除此活动' }
    }

    // Delete event
    await db.collection('events').doc(eventId).remove()

    // Delete all responses
    await db.collection('responses').where({ eventId }).remove()

    return { success: true }
  } catch (err) {
    console.error('删除失败', err)
    return { success: false, error: err.message || '删除失败' }
  }
}
```

### Issue 4.3: Anyone Can View Any Event

**Problem**: No access control. Anyone with event ID can view/submit.

**Recommendation**: For private events, add `isPublic` field and `allowedUsers` array.

---

## 5. Performance Issues

### Issue 5.1: No Pagination in getEventResult

**Problem**: `getEventResult` fetches ALL responses without limit. WeChat cloud DB returns max 100 records per query.

**Location**: `cloudfunctions/getEventResult/index.js:32-36`

**Fix**:

```javascript
// In getEventResult/index.js, replace lines 31-36
const MAX_RESPONSES = 1000
const responses = []
let batch = []

do {
  const res = await db.collection('responses')
    .where({ eventId })
    .skip(responses.length)
    .limit(100)
    .get()

  batch = res.data || []
  responses.push(...batch)
} while (batch.length === 100 && responses.length < MAX_RESPONSES)

if (responses.length >= MAX_RESPONSES) {
  console.warn(`Response limit reached for event ${eventId}`)
}
```

### Issue 5.2: Inefficient Stats Calculation

**Problem**: Stats calculated in cloud function instead of being pre-computed.

**Recommendation**: Add response count to events collection, update atomically:

```javascript
// In submitResponse, after successful add
await db.collection('events').doc(eventId).update({
  data: {
    responseCount: db.command.inc(1)
  }
})
```

### Issue 5.3: Missing Projection

**Problem**: Fetches full documents when only specific fields needed.

**Fix**:

```javascript
// In getEventResult, only fetch needed fields
const responsesRes = await db.collection('responses')
  .where({ eventId })
  .field({
    nickname: true,
    slots: true,
    createdAt: true
    // Exclude _openid for privacy
  })
  .get()
```

---

## 6. Data Consistency Issues

### Issue 6.1: Inconsistent Expiration Logic

**Problem**: `createEvent` sets 'never' to expire in 1 year. Frontend `calculateExpireAt` returns `null` for 'never'.

**Location**:
- `cloudfunctions/createEvent/index.js:65-67`
- `miniprogram/utils/util.js:143-144`

**Fix**: Align behavior - use null/undefined for never:

```javascript
// In createEvent/index.js, line 65-67
case 'never':
  expireAt = null  // Change from 365 days
  break
```

### Issue 6.2: Slot Index Inconsistency

**Problem**: `halfDay` granularity uses different slot indexing in frontend vs display logic.

**Location**:
- `miniprogram/utils/util.js:99-105` - generates slots with hours: 0, 6, 12, 18
- `miniprogram/utils/util.js:46-54` - formatTimeSlot uses indices 0, 1, 2, 3

**Analysis**: The slot grid uses indices 0, 1, 2, 3 but formatTimeSlot interprets them as:
- 0 → "上午 00:00-12:00" (wrong, should be "上午 00:00-06:00")
- 1 → "下午 12:00-18:00" (wrong, this is the 6am slot)

**Fix**: The grid stores indices 0-3, but formatTimeSlot treats them as hour values. Align them:

```javascript
// In util.js, fix generateTimeSlots for halfDay
case 'halfDay':
  // Use indices 0,1,2,3 as slot identifiers, store hour for display
  slots.push({ hour: 0, label: '凌晨 00:00-06:00' })
  slots.push({ hour: 6, label: '上午 06:00-12:00' })
  slots.push({ hour: 12, label: '下午 12:00-18:00' })
  slots.push({ hour: 18, label: '晚上 18:00-24:00' })
  break
```

But the grid uses index 0-3, not hours. Fix formatTimeSlot:

```javascript
// In util.js, fix formatTimeSlot for halfDay
case 'halfDay':
  // 'hour' param is actually an index 0-3
  const halfDaySlots = [
    '凌晨 00:00-06:00',
    '上午 06:00-12:00',
    '下午 12:00-18:00',
    '晚上 18:00-24:00'
  ]
  return halfDaySlots[hour] || halfDaySlots[0]
```

---

## 7. Date/Slot Generation Logic Issues

### Issue 7.1: Timezone Handling

**Problem**: Uses local date without explicit timezone. Cross-timezone users see different dates.

**Location**: `miniprogram/utils/util.js:8-14`, all cloud functions

**Fix**: Always use ISO date strings with explicit timezone or UTC:

```javascript
// In util.js
const formatDate = (date) => {
  const d = new Date(date)
  // Use local date components but be explicit
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Store timezone hint in events
timezone: Intl.DateTimeFormat().resolvedOptions().timeZone  // e.g., 'Asia/Shanghai'
```

### Issue 7.2: DST Boundary Issue

**Problem**: Using milliseconds for day calculation breaks on DST transitions.

**Location**: `cloudfunctions/createEvent/index.js:42`, `miniprogram/pages/create/create.js:63`

**Fix**: Use date-only comparison:

```javascript
// Better day difference calculation (DST-safe)
const daysDiff = (start, end) => {
  const startDate = new Date(start)
  const endDate = new Date(end)
  startDate.setHours(0, 0, 0, 0)
  endDate.setHours(0, 0, 0, 0)
  return Math.round((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1
}
```

### Issue 7.3: Cross-Month Date Generation Bug

**Problem**: `start.setDate(start.getDate() + 1)` mutates the original date object, which can cause issues in loops.

**Location**: `miniprogram/pages/vote/vote.js:202`, `miniprogram/pages/result/result.js:248`

**Fix**: Create new Date objects:

```javascript
// In generateDates function
let current = new Date(start)  // Already correct
while (current <= end) {
  dates.push({
    date: this.formatDate(new Date(current)),  // Clone for safety
    weekday: weekdays[current.getDay()],
    day: current.getDate()
  })
  current = new Date(current.setDate(current.getDate() + 1))  // This is actually fine
}
```

The current code is actually OK - `setDate` returns the new timestamp, and the while loop re-evaluates. But for clarity:

```javascript
// Cleaner version
for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  dates.push({
    date: this.formatDate(d),
    weekday: weekdays[d.getDay()],
    day: d.getDate()
  })
}
```

---

## 8. Missing Cloud Functions

### 8.1: `getMyEvents` - List user's created events

```javascript
// cloudfunctions/getMyEvents/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID
  const { limit = 20, skip = 0 } = event

  try {
    const res = await db.collection('events')
      .where({ createdBy: openid })
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(Math.min(limit, 50))
      .get()

    return { success: true, data: res.data }
  } catch (err) {
    console.error('获取活动列表失败', err)
    return { success: false, error: err.message }
  }
}
```

### 8.2: `deleteEvent` - Authorized deletion

(See Issue 4.2 for implementation)

### 8.3: `getEvent` - Single event fetch with access check

```javascript
// cloudfunctions/getEvent/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { eventId } = event

  if (!eventId) {
    return { success: false, error: '缺少活动ID' }
  }

  try {
    const res = await db.collection('events').doc(eventId).get()

    if (!res.data) {
      return { success: false, error: '活动不存在' }
    }

    // Check expiration
    const now = new Date()
    const expired = res.data.expireAt && now > new Date(res.data.expireAt)

    return {
      success: true,
      data: {
        ...res.data,
        expired
      }
    }
  } catch (err) {
    console.error('获取活动失败', err)
    return { success: false, error: err.message }
  }
}
```

---

## 9. Summary of Critical Fixes

| Priority | Issue | Impact |
|----------|-------|--------|
| **P0** | 2.2 Slot validation | Data corruption, malicious input |
| **P0** | 4.2 Delete authorization | Anyone can delete any event |
| **P1** | 1.2 Missing _openid | Response queries fail |
| **P1** | 4.1 Rate limiting | DoS vulnerability |
| **P1** | 5.1 Pagination | Breaks with >100 responses |
| **P2** | 2.3 Nickname sanitization | XSS risk |
| **P2** | 6.2 Slot index inconsistency | Wrong time displayed |
| **P2** | 1.1 Database indexes | Slow queries at scale |

---

## 10. Recommended File Structure After Fixes

```
cloudfunctions/
├── createEvent/
│   ├── index.js (updated validation)
│   └── package.json
├── submitResponse/
│   ├── index.js (updated validation + _openid)
│   └── package.json
├── getEventResult/
│   ├── index.js (pagination)
│   └── package.json
├── getEvent/          # NEW
│   ├── index.js
│   └── package.json
├── getMyEvents/       # NEW
│   ├── index.js
│   └── package.json
├── deleteEvent/       # NEW
│   ├── index.js
│   └── package.json
├── login/
│   ├── index.js
│   └── package.json
└── migrateIndexes/    # NEW - one-time migration
    ├── index.js
    └── package.json
```
