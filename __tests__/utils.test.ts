import { oneMinute, oneHour, oneDay, oneWeek } from '../src/utils'

describe('Time constants', () => {
  test('oneMinute should be 60 seconds', () => {
    expect(oneMinute).toBe(60)
  })

  test('oneHour should be 3600 seconds', () => {
    expect(oneHour).toBe(60 * 60)
  })

  test('oneDay should be 86400 seconds', () => {
    expect(oneDay).toBe(60 * 60 * 24)
  })

  test('oneWeek should be 604800 seconds', () => {
    expect(oneWeek).toBe(60 * 60 * 24 * 7)
  })
})
