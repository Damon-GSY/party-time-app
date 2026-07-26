const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

function loadCloudFunction(relativePath) {
  const filename = path.join(ROOT, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const module = { exports: {} }
  const database = {
    command: { in: values => ({ $in: values }) },
    collection() {
      throw new Error('database access is not available in pure contract tests')
    }
  }
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => database,
    getWXContext: () => ({ OPENID: 'test-openid' })
  }
  const localRequire = request => request === 'wx-server-sdk' ? cloud : require(request)
  const execute = new Function('require', 'module', 'exports', '__filename', '__dirname', source)
  execute(localRequire, module, module.exports, filename, path.dirname(filename))
  return { exports: module.exports, source }
}

const createEvent = loadCloudFunction('cloudfunctions/createEvent/index.js')
const submitResponse = loadCloudFunction('cloudfunctions/submitResponse/index.js')
const getMyEvents = loadCloudFunction('cloudfunctions/getMyEvents/index.js')
const getEventResult = loadCloudFunction('cloudfunctions/getEventResult/index.js')
const deleteEvent = loadCloudFunction('cloudfunctions/deleteEvent/index.js')
const sendNotification = loadCloudFunction('cloudfunctions/sendNotification/index.js')

test('createEvent validates and normalizes the persisted event contract', () => {
  const now = new Date('2026-07-26T08:00:00Z')
  const validation = createEvent.exports._test.validateCreateInput({
    name: '  周末聚餐  ',
    startDate: '2026-07-26',
    endDate: '2026-07-28',
    granularity: 'twoHours',
    expireType: 'never',
    note: '  靠窗座位  '
  }, now)

  assert.equal(validation.ok, true)
  assert.deepEqual(validation.value, {
    name: '周末聚餐',
    note: '靠窗座位',
    startDate: '2026-07-26',
    endDate: '2026-07-28',
    granularity: 'twoHours',
    expireType: 'never',
    dayCount: 3
  })

  const document = createEvent.exports._test.buildEventDocument(
    validation.value,
    'creator-openid',
    'server-date',
    now
  )
  assert.equal(document.createdBy, 'creator-openid')
  assert.equal(document._openid, 'creator-openid')
  assert.equal(document.expireAt, null)
  assert.equal(document.createdAt, 'server-date')
})

test('createEvent rejects invalid dates, ranges and enums', () => {
  const validate = createEvent.exports._test.validateCreateInput
  const now = new Date('2026-07-26T08:00:00Z')
  const base = {
    name: '聚会',
    startDate: '2026-07-26',
    endDate: '2026-07-27',
    granularity: 'twoHours',
    expireType: '7days'
  }

  assert.equal(validate({ ...base, startDate: '2026-02-30' }, now).ok, false)
  assert.equal(validate({ ...base, endDate: '2026-07-25' }, now).ok, false)
  assert.equal(validate({ ...base, granularity: 'quarterHour' }, now).ok, false)
  assert.equal(validate({ ...base, expireType: 'forever-ish' }, now).ok, false)
  assert.equal(validate({ ...base, name: '   ' }, now).ok, false)
})

test('submitResponse accepts canonical slot indexes and removes duplicates', () => {
  const event = {
    startDate: '2026-07-26',
    endDate: '2026-07-27',
    granularity: 'twoHours',
    expireAt: '2026-08-01T00:00:00.000Z'
  }
  const result = submitResponse.exports._test.validateSubmission(
    event,
    ['2026-07-26_0', '2026-07-26_11', '2026-07-26_0', '2026-07-27_5'],
    new Date('2026-07-26T09:00:00Z')
  )

  assert.equal(result.ok, true)
  assert.deepEqual(result.slots, ['2026-07-26_0', '2026-07-26_11', '2026-07-27_5'])
})

test('submitResponse rejects out-of-range, malformed and expired submissions', () => {
  const validate = submitResponse.exports._test.validateSubmission
  const activeEvent = {
    startDate: '2026-07-26',
    endDate: '2026-07-27',
    granularity: 'halfDay',
    expireAt: null
  }

  assert.equal(validate(activeEvent, ['2026-07-26_4']).ok, false)
  assert.equal(validate(activeEvent, ['2026-07-28_0']).ok, false)
  assert.equal(validate(activeEvent, ['not-a-slot']).ok, false)
  assert.equal(validate(activeEvent, []).ok, false)
  assert.equal(validate({ ...activeEvent, expireAt: '2026-07-25T00:00:00Z' }, ['2026-07-26_0'], new Date('2026-07-26T00:00:00Z')).ok, false)
})

test('submitResponse validates identifiers and nicknames', () => {
  assert.equal(submitResponse.exports._test.isValidEventId('event-123'), true)
  assert.equal(submitResponse.exports._test.isValidEventId('../event'), false)
  assert.equal(submitResponse.exports._test.normalizeNickname('  小明  ').value, '小明')
  assert.equal(submitResponse.exports._test.normalizeNickname('x'.repeat(21)).ok, false)
})

test('submitResponse uses a stable response document id for retry and concurrency safety', () => {
  const makeId = submitResponse.exports._test.getResponseDocumentId
  const first = makeId('event-123', 'openid-abc')
  const retry = makeId('event-123', 'openid-abc')
  const otherUser = makeId('event-123', 'openid-other')

  assert.equal(first, retry)
  assert.notEqual(first, otherUser)
  assert.match(first, /^[a-f0-9]{64}$/)
})

test('concurrent first submissions produce one created action and one stored response', async () => {
  const records = new Map()
  const collection = {
    async add({ data }) {
      await Promise.resolve()
      if (records.has(data._id)) throw new Error('duplicate document id')
      records.set(data._id, { ...data })
    },
    doc(id) {
      return {
        async get() {
          if (!records.has(id)) throw new Error('not found')
          return { data: records.get(id) }
        },
        async update({ data }) {
          records.set(id, { ...records.get(id), ...data })
        },
        async set({ data }) {
          records.set(id, { ...data })
        },
        async remove() {
          records.delete(id)
        }
      }
    }
  }
  const input = {
    responseId: 'stable-id',
    responseData: { eventId: 'event', _openid: 'user', nickname: '小明', slots: ['2026-07-26_0'] },
    existing: [],
    collection,
    serverDate: () => 'server-date'
  }

  const actions = await Promise.all([
    submitResponse.exports._test.persistResponse(input),
    submitResponse.exports._test.persistResponse(input)
  ])

  assert.deepEqual(actions.sort(), ['created', 'updated'])
  assert.equal(records.size, 1)
  assert.equal(records.get('stable-id')._openid, 'user')
})

test('getMyEvents merges new and legacy ownership without duplicates', () => {
  const merge = getMyEvents.exports._test.mergeEvents
  const created = [
    { _id: 'new', createdBy: 'me', createdAt: '2026-07-27T00:00:00Z' },
    { _id: 'legacy', _openid: 'me', createdAt: '2026-07-26T00:00:00Z' }
  ]
  const joined = [
    { _id: 'new', createdBy: 'me', createdAt: '2026-07-27T00:00:00Z' },
    { _id: 'joined', createdBy: 'someone-else', createdAt: '2026-07-25T00:00:00Z' }
  ]
  const events = merge(created, joined, 'me')

  assert.deepEqual(events.map(event => event._id), ['new', 'legacy', 'joined'])
  assert.deepEqual(events.map(event => event.type), ['created', 'created', 'joined'])
})

test('getMyEvents returns a minimal list shape with real participantCount', () => {
  const item = getMyEvents.exports._test.toListEvent({
    _id: 'event-1',
    name: '聚会',
    startDate: '2026-07-26',
    endDate: '2026-07-27',
    granularity: 'hour',
    createdBy: 'secret',
    _openid: 'secret',
    type: 'created'
  }, 4)

  assert.equal(item.participantCount, 4)
  assert.equal(item.createdBy, undefined)
  assert.equal(item._openid, undefined)
})

test('getEventResult sanitizes identities and aggregates each participant once per slot', () => {
  const helpers = getEventResult.exports._test
  const event = helpers.sanitizeEvent({
    _id: 'event-1',
    name: '聚会',
    createdBy: 'creator-secret',
    _openid: 'legacy-secret'
  })
  const response = helpers.sanitizeResponse({
    _id: 'response-1',
    _openid: 'participant-secret',
    nickname: '小明',
    slots: ['2026-07-26_0', '2026-07-26_0']
  })
  const aggregate = helpers.aggregateResponses([response])

  assert.equal(event.createdBy, undefined)
  assert.equal(event._openid, undefined)
  assert.equal(response._openid, undefined)
  assert.deepEqual(response.slots, ['2026-07-26_0'])
  assert.equal(aggregate.slotStats['2026-07-26_0'], 1)
  assert.deepEqual(aggregate.bestSlots, [{ slotId: '2026-07-26_0', count: 1 }])
})

test('getEventResult deduplicates legacy responses by participant identity', () => {
  const deduped = getEventResult.exports._test.dedupeResponses([
    { _id: 'old', _openid: 'same-user', nickname: '旧昵称', updatedAt: '2026-07-26T08:00:00Z' },
    { _id: 'new', _openid: 'same-user', nickname: '新昵称', updatedAt: '2026-07-26T09:00:00Z' },
    { _id: 'legacy-no-owner', nickname: '无法归属' }
  ])

  assert.equal(deduped.length, 2)
  assert.equal(deduped.find(item => item._openid === 'same-user').nickname, '新昵称')
})

test('result notifications derive the best time from server-side responses', () => {
  const calculate = sendNotification.exports._test.calculateBestTime
  const bestTime = calculate({ granularity: 'twoHours' }, [
    { _openid: 'a', slots: ['2026-07-31_4', '2026-07-31_5'], updatedAt: '2026-07-26T08:00:00Z' },
    { _openid: 'b', slots: ['2026-07-31_4'], updatedAt: '2026-07-26T08:00:00Z' },
    { _openid: 'a', slots: ['2026-07-31_4'], updatedAt: '2026-07-26T09:00:00Z' }
  ])

  assert.equal(bestTime, '7月31日 周五 · 08:00-10:00')
  assert.equal(sendNotification.exports._test.isEventCreator({ createdBy: 'creator' }, 'creator'), true)
  assert.equal(sendNotification.exports._test.isEventCreator({ createdBy: 'creator' }, 'attacker'), false)
})

test('creator checks support createdBy and legacy _openid but reject other users', () => {
  for (const helpers of [getEventResult.exports._test, deleteEvent.exports._test]) {
    assert.equal(helpers.isEventCreator({ createdBy: 'me' }, 'me'), true)
    assert.equal(helpers.isEventCreator({ _openid: 'me' }, 'me'), true)
    assert.equal(helpers.isEventCreator({ createdBy: 'other' }, 'me'), false)
  }
})

test('cloud entrypoints are wired to the ownership and count contracts', () => {
  assert.match(createEvent.source, /createdBy:\s*openid/)
  assert.match(createEvent.source, /_openid:\s*openid/)
  assert.match(submitResponse.source, /where\(\{ eventId, _openid: openid \}\)/)
  assert.match(submitResponse.source, /_openid:\s*openid/)
  assert.match(submitResponse.source, /doc\(responseId\)\.set/)
  assert.match(submitResponse.source, /_id:\s*responseId/)
  assert.doesNotMatch(submitResponse.source, /cloud\.callFunction/)
  assert.match(getMyEvents.source, /where\(\{ eventId: item\._id \}\)\.count\(\)/)
  assert.match(getEventResult.source, /isCreator:\s*isEventCreator/)
  assert.match(deleteEvent.source, /if \(!isEventCreator\(eventRes\.data, openid\)\)/)
  assert.match(sendNotification.source, /calculateBestTime\(eventData, responses\)/)
  assert.match(sendNotification.source, /type !== 'result_ready'/)
})
