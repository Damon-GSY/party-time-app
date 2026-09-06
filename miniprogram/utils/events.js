// 历史记录和个人统计需要完整列表，不能只读取云函数的第一页。
const getAllMyEvents = async () => {
  const events = new Map()
  let skip = 0
  while (true) {
    const response = await wx.cloud.callFunction({
      name: 'getMyEvents',
      data: { limit: 50, skip }
    })
    const result = response.result
    if (!result?.success) throw new Error(result?.error || '加载失败')
    const page = result.data || []
    for (const event of page) events.set(event._id, event)
    const hasMore = result.pagination?.hasMore ?? page.length === 50
    if (!hasMore) return [...events.values()]
    if (!page.length) throw new Error('活动分页数据不完整，请重试')
    skip += page.length
  }
}

module.exports = { getAllMyEvents }
