const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

function walk(directory, extension, results = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(target, extension, results)
    else if (entry.name.endsWith(extension)) results.push(target)
  }
  return results
}

test('all project JSON files parse', () => {
  for (const file of walk(root, '.json')) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')), file)
  }
})

test('all mini program and cloud JavaScript files pass syntax checks', () => {
  const files = [
    ...walk(path.join(root, 'miniprogram'), '.js'),
    ...walk(path.join(root, 'cloudfunctions'), '.js')
  ]
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    assert.equal(result.status, 0, `${file}\n${result.stderr}`)
  }
})

test('core WXML handlers exist in their page JavaScript', () => {
  for (const page of ['index', 'create', 'vote', 'result']) {
    const wxml = read(`miniprogram/pages/${page}/${page}.wxml`)
    const script = read(`miniprogram/pages/${page}/${page}.js`)
    const handlers = [...wxml.matchAll(/(?:bind|catch)(?:tap|input|change|focus|blur|touchstart|touchend|touchmove|longpress|submit)="([A-Za-z_$][\w$]*)"/g)]
      .map(match => match[1])
    for (const handler of new Set(handlers)) {
      assert.match(script, new RegExp(`\\b${handler}\\s*\\(`), `${page}: missing ${handler}`)
    }
  }
})

test('core pages do not bring back decorative animation clutter', () => {
  const source = ['index', 'create', 'vote', 'result']
    .flatMap(page => [`miniprogram/pages/${page}/${page}.wxml`, `miniprogram/pages/${page}/${page}.wxss`])
    .map(read)
    .join('\n')
  for (const forbidden of ['beams-container', 'meteor-container', 'spotlight-overlay', 'border-beam', 'shimmer-border', 'conic-gradient', 'backdrop-filter']) {
    assert.equal(source.includes(forbidden), false, `found forbidden decoration: ${forbidden}`)
  }
})

test('preview contains the complete acceptance path and valid script syntax', () => {
  const preview = read('preview.html')
  for (const testId of [
    'home-screen', 'home-create', 'create-screen', 'event-name', 'create-submit',
    'vote-screen', 'slots-grid', 'nickname', 'vote-submit', 'success-dialog',
    'view-result', 'result-screen', 'heatmap', 'detail-dialog', 'edit-vote'
  ]) {
    assert.match(preview, new RegExp(`data-testid="${testId}"`), `missing ${testId}`)
  }
  assert.equal(/(?:linear|conic)-gradient|backdrop-filter|meteor|spotlight|shimmer/i.test(preview), false)
  assert.equal(preview.includes('maximum-scale'), false)
  assert.match(preview, /data-granularity="twoHours" aria-pressed="true"/)
  assert.match(preview, /setAttribute\('aria-pressed'/)
  const scripts = [...preview.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1)
  assert.doesNotThrow(() => new Function(scripts[0][1]))
})

test('native core flow exposes accessible control names and state', () => {
  const index = read('miniprogram/pages/index/index.wxml')
  const create = read('miniprogram/pages/create/create.wxml')
  const vote = read('miniprogram/pages/vote/vote.wxml')
  const result = read('miniprogram/pages/result/result.wxml')

  assert.match(index, /aria-role="button"/)
  assert.match(index, /aria-label="\{\{item\.name\}\}/)
  assert.match(create, /aria-label="聚会名称，必填"/)
  assert.match(create, /aria-label="开始日期，必填"/)
  assert.match(create, /aria-pressed=/)
  assert.match(vote, /aria-label="你的昵称，选填"/)
  assert.match(vote, /aria-selected=/)
  assert.match(vote, /aria-role="dialog"/)
  assert.match(result, /aria-role="dialog"/)
  assert.match(read('miniprogram/app.wxss'), /prefers-reduced-motion/)
})

test('unconfigured notification templates do not expose broken actions', () => {
  const notificationUtil = read('miniprogram/utils/notification.js')
  assert.match(notificationUtil, /function isConfigured/)
  assert.match(notificationUtil, /startsWith\('your_template_id'\)/)
  assert.match(read('miniprogram/pages/vote/vote.wxml'), /notificationsConfigured/)
  assert.match(read('miniprogram/pages/result/result.wxml'), /notificationsConfigured/)
  assert.match(read('miniprogram/pages/result/result.js'), /wx\.redirectTo\(\{ url: `\/pages\/vote\/vote/)
})

test('vote and result consume the shared slot contract', () => {
  assert.match(read('miniprogram/pages/vote/vote.js'), /util\.getTimeSlotConfig/)
  assert.match(read('miniprogram/pages/result/result.js'), /util\.getTimeSlotConfig/)
  assert.match(read('miniprogram/pages/vote/vote.js'), /util\.generateSlotId/)
  assert.match(read('miniprogram/pages/result/result.js'), /util\.generateSlotId/)
})

test('the primary mobile navigation has exactly three stable destinations', () => {
  const appJson = JSON.parse(read('miniprogram/app.json'))
  assert.deepEqual(appJson.tabBar.list.map(item => item.pagePath), [
    'pages/index/index',
    'pages/notifications/notifications',
    'pages/profile/profile'
  ])
})
