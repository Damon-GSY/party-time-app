const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const indexPagePath = path.join(__dirname, '..', 'miniprogram', 'pages', 'index', 'index.js')

function loadIndexPage() {
  let pageDefinition
  global.getApp = () => ({ globalData: {} })
  global.Page = definition => { pageDefinition = definition }
  global.wx = { vibrateShort() {} }
  delete require.cache[require.resolve(indexPagePath)]
  require(indexPagePath)
  return pageDefinition
}

function createPageContext(definition) {
  const context = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(nextData) {
      this.data = { ...this.data, ...nextData }
    }
  }

  Object.entries(definition).forEach(([key, value]) => {
    if (typeof value === 'function') context[key] = value.bind(context)
  })
  return context
}

test('home calendar browses months, crosses years, and resets when collapsed', () => {
  const page = createPageContext(loadIndexPage())
  page.initCalendar()

  const initialYear = page.data.calendarYear
  const initialMonth = page.data.calendarMonthIndex
  const initialEvents = [{ _id: 'event-1' }]
  page.data.events = initialEvents

  page.showNextMonth()
  const expectedNext = new Date(initialYear, initialMonth + 1, 1)
  assert.equal(page.data.calendarYear, expectedNext.getFullYear())
  assert.equal(page.data.calendarMonthIndex, expectedNext.getMonth())
  assert.equal(page.data.currentMonth, `${expectedNext.getFullYear()} / ${expectedNext.getMonth() + 1}月`)
  assert.equal(page.data.monthCalendarDays.length, 42)
  assert.equal(page.data.events, initialEvents)

  page.data.calendarYear = 2026
  page.data.calendarMonthIndex = 11
  page.showNextMonth()
  assert.equal(page.data.calendarYear, 2027)
  assert.equal(page.data.calendarMonthIndex, 0)

  page.showPreviousMonth()
  assert.equal(page.data.calendarYear, 2026)
  assert.equal(page.data.calendarMonthIndex, 11)

  page.data.calendarExpanded = true
  page.toggleCalendar()
  const today = new Date()
  assert.equal(page.data.calendarExpanded, false)
  assert.equal(page.data.calendarYear, today.getFullYear())
  assert.equal(page.data.calendarMonthIndex, today.getMonth())

  page.showNextMonth()
  page.showTodayMonth()
  assert.equal(page.data.calendarYear, today.getFullYear())
  assert.equal(page.data.calendarMonthIndex, today.getMonth())
  assert.deepEqual(page.data.monthCalendarDays.filter(day => day.current).map(day => day.date), [
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  ])
})

