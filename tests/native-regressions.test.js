const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..', 'miniprogram')

function loadPage(name) {
  let definition
  global.Page = value => { definition = value }
  const filename = path.join(root, 'pages', name, `${name}.js`)
  delete require.cache[require.resolve(filename)]
  require(filename)
  return {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(next, callback) {
      Object.assign(this.data, next)
      if (callback) callback()
    }
  }
}

function eventRows() {
  return Array.from({ length: 73 }, (_, index) => ({
    _id: `event-${index}`,
    type: index < 53 ? 'created' : 'joined',
    name: `聚会 ${index}`,
    startDate: '2026-09-06', endDate: '2026-09-07', expireAt: null
  }))
}

function paginatedCloud(rows) {
  return { async callFunction({ name, data }) {
    assert.equal(name, 'getMyEvents')
    const skip = data.skip || 0
    const page = rows.slice(skip, skip + data.limit)
    return { result: { success: true, data: page,
      pagination: { skip, limit: data.limit, total: rows.length, hasMore: skip + page.length < rows.length }
    } }
  } }
}

test('history and profile statistics include created and joined events beyond the first 50', async () => {
  global.wx = { cloud: paginatedCloud(eventRows()) }
  const history = loadPage('history')
  await history.loadEvents()
  assert.equal(history.data.events.length, 53)
  history.data.activeTab = 'joined'
  await history.loadEvents()
  assert.equal(history.data.events.length, 20)
  assert.equal(history.data.events[19]._id, 'event-72')
  const user = require('../miniprogram/utils/user')
  assert.deepEqual(await user.getUserStats(), { createdCount: 53, joinedCount: 20 })
})

test('overlapping pages do not duplicate history entries or inflate statistics', async () => {
  const rows = eventRows()
  rows.splice(50, 0, rows[49])
  global.wx = { cloud: paginatedCloud(rows) }
  const history = loadPage('history')
  await history.loadEvents()
  assert.equal(history.data.events.length, 53)
  assert.equal(new Set(history.data.events.map(event => event._id)).size, 53)
  const user = require('../miniprogram/utils/user')
  assert.deepEqual(await user.getUserStats(), { createdCount: 53, joinedCount: 20 })
})

test('a later-page failure reports a history error instead of presenting partial results', async () => {
  const cloud = paginatedCloud(eventRows())
  global.wx = { cloud: { callFunction(request) {
    if (request.data.skip) return Promise.resolve({ result: { success: false, error: '加载失败' } })
    return cloud.callFunction(request)
  } } }
  const history = loadPage('history')
  await history.loadEvents()
  assert.equal(history.data.loadError, true)
  assert.equal(history.data.loading, false)
  assert.equal(history.data.events.length, 0)
  const user = require('../miniprogram/utils/user')
  assert.deepEqual(await user.getUserStats(), { createdCount: 0, joinedCount: 0 })
})

test('an empty unfinished page ends loading with an error rather than looping', async () => {
  global.wx = { cloud: { async callFunction() {
    return { result: { success: true, data: [], pagination: { hasMore: true } } }
  } } }
  const history = loadPage('history')
  await history.loadEvents()
  assert.equal(history.data.loadError, true)
  assert.equal(history.data.loading, false)
})

test('a nickname submitted with a vote stays current on the profile and after changing avatar', async () => {
  const storage = new Map([['userInfo', { customNickname: '旧昵称', avatarUrl: 'old.png' }]])
  global.wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    cloud: { callFunction: async () => ({ result: { success: true } }) },
    nextTick: callback => callback(), vibrateShort() {},
    getUserProfile: ({ success }) => success({ userInfo: { nickName: '微信昵称', avatarUrl: 'new.png' } })
  }
  let app
  global.App = value => { app = value }
  global.getApp = () => app
  const appPath = path.join(root, 'app.js')
  delete require.cache[require.resolve(appPath)]
  require(appPath)
  app.initUserInfo()
  const vote = loadPage('vote')
  Object.assign(vote.data, {
    eventId: 'event-1', nickname: '新昵称', selectedCount: 1, slots: { '2026-09-06_10': true }
  })
  await vote.handleSubmit()
  const profile = loadPage('profile')
  profile.loadUserInfo()
  assert.equal(profile.data.userInfo.customNickname, '新昵称')
  profile.changeAvatar()
  profile.loadUserInfo()
  assert.equal(profile.data.userInfo.customNickname, '新昵称')
  assert.equal(profile.data.userInfo.avatarUrl, 'new.png')
  const user = require('../miniprogram/utils/user')
  assert.equal(user.getNickname(), '新昵称')
  assert.equal(user.getAvatarUrl(), 'new.png')
  assert.deepEqual(app.globalData.userInfo, user.getUserInfo())
})
