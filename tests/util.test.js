const test = require('node:test')
const assert = require('node:assert/strict')

const util = require('../miniprogram/utils/util')

test('two-hour slots keep index-based IDs and display real clock ranges', () => {
  const slots = util.getTimeSlotConfig('twoHours')

  assert.equal(slots.length, 12)
  assert.deepEqual(slots[0], {
    index: 0,
    startHour: 0,
    label: '00:00-02:00',
    shortLabel: '00:00'
  })
  assert.deepEqual(slots[5], {
    index: 5,
    startHour: 10,
    label: '10:00-12:00',
    shortLabel: '10:00'
  })
  assert.equal(util.formatTimeSlot(11, 'twoHours'), '22:00-24:00')
  assert.equal(util.generateSlotId('2026-07-31', slots[11].index), '2026-07-31_11')
})

test('hour slots cover the whole day without changing the stored index', () => {
  const slots = util.getTimeSlotConfig('hour')

  assert.equal(slots.length, 24)
  assert.equal(slots[0].label, '00:00-01:00')
  assert.equal(slots[23].label, '23:00-24:00')
  assert.equal(util.formatTimeSlot(23, 'hour'), '23:00-24:00')
})

test('half-day slots are four non-overlapping six-hour periods', () => {
  const slots = util.getTimeSlotConfig('halfDay')

  assert.deepEqual(slots.map(slot => slot.label), [
    '深夜 00:00-06:00',
    '上午 06:00-12:00',
    '下午 12:00-18:00',
    '晚上 18:00-24:00'
  ])
  assert.equal(util.formatTimeSlot(3, 'halfDay'), '晚上 18:00-24:00')
})

test('legacy generateTimeSlots follows the same index contract', () => {
  for (const granularity of ['hour', 'twoHours', 'halfDay']) {
    const config = util.getTimeSlotConfig(granularity)
    const legacy = util.generateTimeSlots(granularity)

    assert.deepEqual(
      legacy.map(slot => ({ hour: slot.hour, label: slot.label })),
      config.map(slot => ({ hour: slot.index, label: slot.label }))
    )
  }
})

test('month calendar always renders six Monday-first weeks with one current day', () => {
  const days = util.generateMonthCalendar(new Date(2026, 6, 26, 12))

  assert.equal(days.length, 42)
  assert.equal(days[0].date, '2026-06-29')
  assert.equal(days[6].date, '2026-07-05')
  assert.equal(days.filter(day => day.inMonth).length, 31)
  assert.equal(days.filter(day => !day.inMonth).length, 11)
  assert.deepEqual(days.filter(day => day.current).map(day => day.date), ['2026-07-26'])
  assert.equal(days[0].accessibleLabel, '2026年6月29日，上月')
  assert.equal(days.find(day => day.current).accessibleLabel, '2026年7月26日，今天')
})

test('month calendar handles Sunday-start and cross-year months', () => {
  const sundayStart = util.generateMonthCalendar(new Date(2025, 5, 15, 12))
  assert.equal(sundayStart[0].date, '2025-05-26')
  assert.equal(sundayStart[6].date, '2025-06-01')
  assert.deepEqual(sundayStart.filter(day => day.current).map(day => day.date), ['2025-06-15'])

  const crossYear = util.generateMonthCalendar(new Date(2027, 0, 1, 12))
  assert.equal(crossYear[0].date, '2026-12-28')
  assert.equal(crossYear[41].date, '2027-02-07')
  assert.equal(crossYear[0].accessibleLabel, '2026年12月28日，上月')
  assert.equal(crossYear[41].accessibleLabel, '2027年2月7日，下月')
  assert.deepEqual(crossYear.filter(day => day.current).map(day => day.date), ['2027-01-01'])
})
