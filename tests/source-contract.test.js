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
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.match(preview, new RegExp(`['"]${key}['"]`))
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

  for (const item of appJson.tabBar.list) {
    for (const key of ['iconPath', 'selectedIconPath']) {
      const icon = path.join(root, 'miniprogram', item[key])
      assert.equal(path.extname(icon), '.png')
      assert.equal(fs.existsSync(icon), true, `missing ${item[key]}`)
      const png = fs.readFileSync(icon)
      assert.equal(png.subarray(1, 4).toString(), 'PNG', `${item[key]} is not a PNG`)
      assert.equal(png.readUInt32BE(16), 81, `${item[key]} must be 81 px wide`)
      assert.equal(png.readUInt32BE(20), 81, `${item[key]} must be 81 px high`)
      assert.ok(fs.statSync(icon).size < 40 * 1024, `${item[key]} exceeds 40 KiB`)
    }
  }

  for (const page of ['index', 'create', 'vote', 'result', 'notifications', 'profile']) {
    const pageJson = JSON.parse(read(`miniprogram/pages/${page}/${page}.json`))
    assert.equal(pageJson.navigationStyle, 'custom', `${page} must share the custom navigation shell`)
  }
})

test('custom-navigation terminal states retain a safe back action', () => {
  const vote = read('miniprogram/pages/vote/vote.wxml')
  const result = read('miniprogram/pages/result/result.wxml')
  const resultScript = read('miniprogram/pages/result/result.js')
  const globalStyles = read('miniprogram/app.wxss')

  assert.equal((vote.match(/class="core-back-button state-back-button"/g) || []).length, 3)
  assert.equal((result.match(/class="core-back-button state-back-button"/g) || []).length, 2)
  assert.match(resultScript, /setTimeout\(\(\) => this\.goBack\(\), 1200\)/)
  assert.match(resultScript, /pages\.length > 1[\s\S]*wx\.navigateBack\(\)[\s\S]*wx\.switchTab/)
  assert.match(globalStyles, /\.vote-page > \.loading-state[\s\S]*min-height: 100vh;[\s\S]*padding: 220rpx 44rpx 120rpx;/)
})

test('native and preview share the selected retro palette semantics', () => {
  const nativeStyles = read('miniprogram/app.wxss').toLowerCase()
  const preview = read('preview.html').toLowerCase()

  for (const color of ['#171817', '#dcc9a9', '#b83a2d', '#4e6851']) {
    assert.equal(nativeStyles.includes(color), true, `native theme is missing ${color}`)
    assert.equal(preview.includes(color), true, `preview theme is missing ${color}`)
  }
  assert.match(read('miniprogram/pages/result/result.wxss'), /level-4 \{ background: var\(--color-success\)/)
  assert.match(preview, /\.heat-cell\.level-4 \{ border-color: var\(--success\); background: var\(--success\)/)
})

test('native and preview use the editorial two-column scheduler contract', () => {
  const nativeVote = read('miniprogram/pages/vote/vote.wxml')
  const nativeStyles = read('miniprogram/pages/vote/vote.wxss')
  const preview = read('preview.html')

  assert.match(nativeVote, /SCHEDULING \/ REV\. 003/)
  assert.match(nativeVote, /SLOT_SELECT/)
  assert.match(nativeVote, /TOTAL_SELECTION/)
  assert.match(nativeVote, /SELECTED/)
  assert.doesNotMatch(nativeVote, /class="date-scroll" wx:if=/)
  assert.match(nativeVote, /class="slot-button \{\{item\.selected \? 'is-selected' : ''\}\}"/)
  assert.match(nativeVote, /aria-pressed="\{\{item\.selected\}\}"/)
  assert.match(nativeVote, /\{\{item\.selected \? 'SELECTED' : 'OPEN'\}\}/)
  assert.match(nativeStyles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(nativeStyles, /\.vote-footer \{[\s\S]*position: fixed;[\s\S]*bottom: 0;/)
  assert.match(nativeStyles, /\.vote-footer \{[\s\S]*constant\(safe-area-inset-bottom\)[\s\S]*env\(safe-area-inset-bottom\)/)
  assert.match(nativeStyles, /\.selected-kicker,[\s\S]*\.selected-detail \{[\s\S]*font-size: 20rpx;/)
  assert.match(nativeStyles, /\.date-tab\.is-active \{[\s\S]*background: var\(--color-ink\)/)
  assert.match(nativeStyles, /\.slot-button\.is-selected \{[\s\S]*background: var\(--color-coral\)/)
  assert.match(preview, /<section class="scheduler-board"/)
  assert.match(preview, /grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(preview, /\.date-tab\.active \{ background: var\(--ink\)/)
  assert.match(preview, /\.slot\.selected \{[^}]*background: var\(--coral\)/)
  assert.match(preview, /\.fixed-action \{[\s\S]*position: fixed;/)
  assert.match(preview, /\.selection-kicker, \.selection-detail \{[^}]*font-size: 10px;/)
  assert.match(read('miniprogram/pages/create/create.wxss'), /\.create-footer \{[\s\S]*constant\(safe-area-inset-bottom\)[\s\S]*env\(safe-area-inset-bottom\)/)
  assert.match(read('miniprogram/pages/result/result.wxss'), /\.result-footer \{[\s\S]*constant\(safe-area-inset-bottom\)[\s\S]*env\(safe-area-inset-bottom\)/)
})

test('home calendar expands from the current week into a complete month', () => {
  const nativeHome = read('miniprogram/pages/index/index.wxml')
  const nativeScript = read('miniprogram/pages/index/index.js')
  const nativeStyles = read('miniprogram/pages/index/index.wxss')
  const preview = read('preview.html')

  assert.match(nativeHome, /<button[\s\S]*class="calendar-toggle-surface"[\s\S]*bindtap="toggleCalendar"/)
  assert.match(nativeHome, /aria-expanded="\{\{calendarExpanded\}\}"/)
  assert.match(nativeHome, /aria-controls="home-month-calendar"/)
  assert.match(nativeHome, /aria-label="\{\{item\.accessibleLabel\}\}"/)
  assert.match(nativeHome, /aria-current="\{\{item\.current \? 'date' : 'false'\}\}"/)
  assert.match(nativeHome, /wx:for="\{\{monthCalendarDays\}\}"/)
  assert.match(nativeScript, /monthCalendarDays: \[\]/)
  assert.match(nativeScript, /util\.generateMonthCalendar\(today\)/)
  assert.match(nativeScript, /toggleCalendar\(\)/)
  assert.match(nativeStyles, /\.calendar-month-grid \{[\s\S]*grid-template-columns: repeat\(7/)
  assert.match(preview, /<button class="calendar-toggle"[^>]*data-testid="home-calendar"[^>]*aria-expanded="false"[^>]*aria-controls="home-month-view"/)
  assert.match(preview, /id="home-month-grid"/)
  assert.match(preview, /role="gridcell"[^>]*datetime="\$\{formatDate\(date\)\}"[^>]*aria-label="\$\{accessibleLabel\}"/)
  assert.match(preview, /\.week\[hidden\], \.calendar-month-view\[hidden\] \{ display: none; \}/)
  assert.match(preview, /function toggleHomeCalendar\(\)/)
  assert.match(preview, /home-calendar-toggle'\)\.addEventListener\('click', toggleHomeCalendar\)/)
  assert.match(preview, /\['Enter', ' '\]\.includes\(event\.key\)/)
  assert.match(preview, /home-calendar-collapse'\)\.addEventListener\('click', toggleHomeCalendar\)/)
})

test('motion and visual assets stay local and lightweight', () => {
  const miniProgramSource = [
    ...walk(path.join(root, 'miniprogram'), '.js'),
    ...walk(path.join(root, 'miniprogram'), '.wxml'),
    ...walk(path.join(root, 'miniprogram'), '.wxss')
  ].map(file => fs.readFileSync(file, 'utf8')).join('\n')
  for (const forbidden of ['gsap', 'lenis', 'vanta', 'three.js', 'react-bits']) {
    assert.equal(miniProgramSource.toLowerCase().includes(forbidden), false, `native runtime includes ${forbidden}`)
  }

  const preview = read('preview.html')
  assert.equal(/<(?:script|link)[^>]+https?:\/\//i.test(preview), false, 'preview must not depend on remote scripts or styles')
  const texture = path.join(root, 'miniprogram/assets/textures/warm-grain.jpg')
  assert.equal(fs.existsSync(texture), true)
  assert.ok(fs.statSync(texture).size < 80 * 1024, 'grain texture exceeds 80 KiB')
  const assetBytes = walk(path.join(root, 'miniprogram/assets'), '.png')
    .concat(texture)
    .reduce((total, file) => total + fs.statSync(file).size, 0)
  assert.ok(assetBytes < 250 * 1024, 'mini program visual assets exceed 250 KiB')
})
