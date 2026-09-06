const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const test = require('node:test')
const vm = require('node:vm')

const pagePath = path.join(__dirname, '..', 'miniprogram', 'pages', 'poster', 'poster.js')
const source = fs.readFileSync(pagePath, 'utf8')

function createPosterHarness({ missingCanvas = false, drawError = false, expireAt = null } = {}) {
  let definition
  let resolveEvent
  const pendingQueries = []
  const calls = { queries: 0, draws: 0, toasts: [], errors: [], texts: [] }
  const eventResponse = new Promise(resolve => { resolveEvent = resolve })
  const context = {
    scale() { if (drawError) throw new Error('Canvas drawing failed') },
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {},
    closePath() {}, fill() {}, stroke() {}, fillText(text) { calls.texts.push(text) },
    measureText(text) { return { width: text.length * 8 } }
  }
  const canvas = {
    getContext(type) {
      assert.equal(type, '2d')
      calls.draws += 1
      return context
    }
  }
  const wx = {
    cloud: { callFunction: () => eventResponse },
    getWindowInfo: () => ({ pixelRatio: 2 }),
    showToast: toast => calls.toasts.push(toast),
    createSelectorQuery() {
      calls.queries += 1
      const query = {
        select(selector) { assert.equal(selector, '#posterCanvas'); return query },
        fields() { return query },
        exec(callback) { pendingQueries.push(callback) }
      }
      return query
    }
  }

  vm.runInNewContext(source, {
    require: createRequire(pagePath),
    Page: page => { definition = page },
    wx,
    console: { error: (...args) => calls.errors.push(args) }
  }, { filename: pagePath })

  const page = { ...definition, data: { ...definition.data } }
  page.setData = function (next, callback) {
    Object.assign(this.data, next)
    if (callback) callback()
  }

  return {
    page,
    calls,
    resolveEvent() {
      resolveEvent({ result: { success: true, data: {
        event: { name: '周末聚餐', startDate: '2026-09-05', endDate: '2026-09-06', note: '一起见面', expireAt },
        participantCount: 3,
        bestSlots: []
      } } })
    },
    deliverCanvas() {
      const callbacks = pendingQueries.splice(0)
      assert.equal(callbacks.length, 1, 'one lifecycle must request exactly one canvas')
      callbacks[0](missingCanvas ? [] : [{ node: canvas }])
      assert.equal(pendingQueries.length, 0, 'rendering must not schedule duplicate queries')
    }
  }
}

test('poster waits for data when the canvas becomes ready first and draws once', async () => {
  const harness = createPosterHarness()
  const loading = harness.page.loadEventData('event-1')
  harness.page.onReady()
  assert.equal(harness.calls.queries, 0)
  assert.equal(harness.page.data.loading, true)

  harness.resolveEvent()
  await loading
  assert.equal(harness.calls.queries, 1)
  assert.equal(harness.calls.draws, 0)
  assert.equal(harness.page.data.loading, true)
  harness.deliverCanvas()
  assert.equal(harness.calls.draws, 1)
  assert.equal(harness.calls.queries, 1)
  assert.equal(harness.page.data.loading, false)
  assert.equal(harness.page.data.posterError, false)
})

test('poster waits for onReady when event data arrives first and draws once', async () => {
  const harness = createPosterHarness()
  const loading = harness.page.loadEventData('event-1')
  harness.resolveEvent()
  await loading
  assert.equal(harness.calls.queries, 0)
  assert.equal(harness.calls.draws, 0)
  assert.equal(harness.page.data.loading, true)

  harness.page.onReady()
  assert.equal(harness.calls.queries, 1)
  harness.deliverCanvas()
  assert.equal(harness.calls.draws, 1)
  assert.equal(harness.calls.queries, 1)
  assert.equal(harness.page.data.loading, false)
  assert.equal(harness.page.data.posterError, false)
})

test('poster stops loading and exposes an error if the canvas query returns no node', async () => {
  const harness = createPosterHarness({ missingCanvas: true })
  harness.page.onReady()
  const loading = harness.page.loadEventData('event-1')
  harness.resolveEvent()
  await loading
  harness.deliverCanvas()
  assert.equal(harness.calls.queries, 1)
  assert.equal(harness.calls.draws, 0)
  assert.equal(harness.page.data.loading, false)
  assert.equal(harness.page.data.posterError, true)
  assert.equal(harness.calls.errors.length, 1)
})

test('poster handles exceptions from the asynchronous drawing callback', async () => {
  const harness = createPosterHarness({ drawError: true })
  harness.page.onReady()
  const loading = harness.page.loadEventData('event-1')
  harness.resolveEvent()
  await loading
  assert.doesNotThrow(() => harness.deliverCanvas())
  assert.equal(harness.calls.queries, 1)
  assert.equal(harness.calls.draws, 1)
  assert.equal(harness.page.data.loading, false)
  assert.equal(harness.page.data.posterError, true)
  assert.equal(harness.calls.errors.length, 1)
  assert.equal(harness.calls.toasts.length, 1)
  assert.equal(harness.calls.toasts[0].title, '海报生成失败')
})

for (const [label, expireAt, expectedStatus] of [
  ['expired', '2000-01-01T00:00:00.000Z', '已结束'],
  ['future expiry', '2999-01-01T00:00:00.000Z', '进行中'],
  ['permanent', null, '进行中']
]) {
  test(`poster renders the correct status for ${label} events`, async () => {
    const harness = createPosterHarness({ expireAt })
    harness.page.onReady()
    const loading = harness.page.loadEventData('event-1')
    harness.resolveEvent()
    await loading
    harness.deliverCanvas()
    const statusTexts = harness.calls.texts.filter(text => ['进行中', '已结束'].includes(text))
    assert.deepEqual(statusTexts, [expectedStatus])
    assert.equal(harness.page.data.posterError, false)
  })
}
