const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// Execute the actual inline app and handlers, without a browser dependency.
function loadPreview() {
  const nodes = new Map()
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', textContent: '', innerHTML: '', dataset: {}, style: {},
      classList: { toggle() {}, add() {}, remove() {}, contains() { return false } },
      listeners: {}, setAttribute() {}, querySelector() { return null },
      querySelectorAll() { return [] }, focus() {}, scrollIntoView() {},
      addEventListener(type, handler) { this.listeners[type] = handler },
      showModal() { this.open = true }, close() { this.open = false }
    })
    return nodes.get(id)
  }
  const context = vm.createContext({
    document: { getElementById: node, querySelectorAll: () => [], querySelector: () => null,
      body: { dataset: {} }, addEventListener() {} },
    requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {},
    navigator: { clipboard: { async writeText(text) { context.copied = text } } }
  })
  const html = fs.readFileSync(path.join(__dirname, '../preview.html'), 'utf8')
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context)
  return { node, run: code => vm.runInContext(code, context),
    fire: (id, type = 'click') => node(id).listeners[type]({ preventDefault() {} }) }
}

test('preview switches complete event records instead of only their title', () => {
  const app = loadPreview()
  const weekend = app.run('state.event.startDate')
  app.run("openEvent('birthday', 'result')")
  assert.equal(app.node('result-title').textContent, '生日派对')
  assert.notEqual(app.run('state.event.startDate'), weekend)
  assert.equal(app.node('participant-count').textContent, 0)
  app.fire('pending-vote')
  assert.equal(app.run('state.event.name'), '周末聚餐')
  assert.equal(app.run('state.responses.length'), 3)
})

test('preview rename updates one stable participant and does not overwrite namesakes', () => {
  const app = loadPreview()
  app.node('nickname').value = '小明'
  app.run('state.selected = new Set([`${state.event.startDate}_5`])')
  app.fire('vote-submit')
  assert.equal(app.run('state.responses.length'), 4)
  app.node('nickname').value = '新昵称'
  app.fire('vote-submit')
  assert.equal(app.run('state.responses.length'), 4)
  assert.equal(app.run("state.responses.filter(item => item.nickname === '小明').length"), 1)
  assert.equal(app.run("state.responses.filter(item => item.nickname === '新昵称').length"), 1)
  app.run("openEvent('birthday', 'vote')")
  assert.equal(app.run('state.selected.size'), 0)
  app.fire('pending-vote')
  assert.equal(app.run('state.selected.size'), 1)
  assert.equal(app.node('nickname').value, '新昵称')
})

test('created events remain reachable and retain their own votes after navigation', async () => {
  const app = loadPreview()
  app.node('event-name').value = '独立聚会 <测试>'
  app.node('start-date').value = '2099-10-10'
  app.node('end-date').value = '2099-10-11'
  app.fire('create-form', 'submit')
  const id = app.run('state.currentEventId')
  app.node('nickname').value = '我'
  app.run("state.selected = new Set(['2099-10-10_10'])")
  app.fire('vote-submit')
  app.run("showPage('home')")
  assert.ok(app.node('recent-events').innerHTML.includes(id))
  assert.ok(app.node('recent-events').innerHTML.includes('&lt;测试&gt;'))
  app.fire('pending-vote')
  assert.equal(app.run('state.responses.length'), 3)
  app.run(`openEvent(${JSON.stringify(id)}, 'result')`)
  assert.equal(app.node('result-title').textContent, '独立聚会 <测试>')
  assert.equal(app.node('participant-count').textContent, 1)
  app.fire('edit-vote')
  assert.equal(app.run('state.selected.size'), 1)
  await app.fire('share-result')
  assert.equal(app.run('copied'), '来帮我选「独立聚会 <测试>」的时间')
})
