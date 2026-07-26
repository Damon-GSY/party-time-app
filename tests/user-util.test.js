const test = require('node:test')
const assert = require('node:assert/strict')

let storage = null
global.wx = {
  getStorageSync() {
    return storage
  },
  setStorageSync(key, value) {
    assert.equal(key, 'userInfo')
    storage = value
  }
}

const user = require('../miniprogram/utils/user')

test('custom nickname survives when WeChat nickname is absent', () => {
  storage = null
  user.updateUserInfo({ customNickname: '小满' })

  assert.equal(user.getNickname(), '小满')
  assert.deepEqual(user.getUserInfo(), {
    nickName: '',
    avatarUrl: '',
    customNickname: '小满'
  })
})

test('stored user fields merge with stable defaults', () => {
  storage = { nickName: '微信昵称', avatarUrl: 'https://example.test/avatar.png' }

  assert.equal(user.getNickname(), '微信昵称')
  assert.deepEqual(user.getUserInfo(), {
    nickName: '微信昵称',
    avatarUrl: 'https://example.test/avatar.png',
    customNickname: ''
  })
})
