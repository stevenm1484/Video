/**
 * Timezone utility functions for converting and displaying timestamps
 * Database stores all times in UTC, but we display in account's local timezone
 */

// Timezone offset mappings (in minutes from UTC)
// Note: These are approximate and don't account for DST transitions
const TIMEZONE_OFFSETS = {
  'America/New_York': -5 * 60,      // EST (EDT is -4)
  'America/Chicago': -6 * 60,       // CST (CDT is -5)
  'America/Denver': -7 * 60,        // MST (MDT is -6)
  'America/Los_Angeles': -8 * 60,   // PST (PDT is -7)
  'America/Anchorage': -9 * 60,     // AKST (AKDT is -8)
  'Pacific/Honolulu': -10 * 60,     // HST (no DST)
  'UTC': 0
}

// DST detection: Simple heuristic for US timezones
// DST typically runs from 2nd Sunday in March to 1st Sunday in November
function isDST(date) {
  const year = date.getFullYear()

  // March - 2nd Sunday
  const marchSecondSunday = new Date(year, 2, 1) // March 1st
  marchSecondSunday.setDate(1 + (7 - marchSecondSunday.getDay() + 7) % 7 + 7) // 2nd Sunday

  // November - 1st Sunday
  const novFirstSunday = new Date(year, 10, 1) // November 1st
  novFirstSunday.setDate(1 + (7 - novFirstSunday.getDay()) % 7) // 1st Sunday

  return date >= marchSecondSunday && date < novFirstSunday
}

/**
 * Convert UTC timestamp to account's timezone
 * @param {string|Date} utcTimestamp - UTC timestamp from database
 * @param {string} timezone - IANA timezone name (e.g., 'America/New_York')
 * @returns {Date} Date object adjusted to account timezone
 */
export function convertToAccountTimezone(utcTimestamp, timezone = 'UTC') {
  if (!utcTimestamp) return null

  const utcDate = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp

  // If no timezone or UTC, return as-is
  if (!timezone || timezone === 'UTC') {
    return utcDate
  }

  // Get base offset for timezone (these are negative for US timezones, e.g., -5 for EST)
  let offsetMinutes = TIMEZONE_OFFSETS[timezone] || 0

  // Adjust for DST (except Hawaii which doesn't observe DST)
  if (timezone !== 'Pacific/Honolulu' && timezone !== 'UTC' && isDST(utcDate)) {
    offsetMinutes += 60 // Add 1 hour during DST (e.g., -5 becomes -4 for EDT)
  }

  // CRITICAL: We need to work with the UTC time and apply the offset correctly
  // Get UTC components
  const year = utcDate.getUTCFullYear()
  const month = utcDate.getUTCMonth()
  const day = utcDate.getUTCDate()
  const hours = utcDate.getUTCHours()
  const minutes = utcDate.getUTCMinutes()
  const seconds = utcDate.getUTCSeconds()
  const ms = utcDate.getUTCMilliseconds()

  // Convert UTC to total minutes since midnight
  const utcMinutes = hours * 60 + minutes

  // Apply timezone offset (negative for US timezones means earlier time)
  const localMinutes = utcMinutes + offsetMinutes

  // Calculate new hours and minutes (handle day rollovers)
  const localHours = Math.floor(localMinutes / 60)
  const localMins = localMinutes % 60

  // Create date in local timezone (this creates a Date object, but we're treating it as "display" time)
  const localDate = new Date(year, month, day, localHours, localMins, seconds, ms)

  return localDate
}

/**
 * Format timestamp for display in account's timezone
 * @param {string|Date} utcTimestamp - UTC timestamp from database
 * @param {string} timezone - IANA timezone name
 * @param {object} options - Formatting options
 * @returns {string} Formatted timestamp string
 */
export function formatTimestampInTimezone(utcTimestamp, timezone = 'UTC', options = {}) {
  if (!utcTimestamp) return '-'

  const {
    showDate = true,
    showTime = true,
    showSeconds = false,
    showTimezone = false
  } = options

  const utcDate = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp

  // Use toLocaleString with the timezone to get properly formatted local time
  const localeOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: false
  }

  const parts = new Intl.DateTimeFormat('en-US', localeOptions).formatToParts(utcDate)
  const partsMap = {}
  parts.forEach(part => {
    partsMap[part.type] = part.value
  })

  let formatted = ''

  if (showDate) {
    // Format: MM/DD/YYYY
    formatted += `${partsMap.month}/${partsMap.day}/${partsMap.year}`
  }

  if (showTime) {
    if (formatted) formatted += ' '

    // Format: HH:MM or HH:MM:SS
    formatted += `${partsMap.hour}:${partsMap.minute}`

    if (showSeconds && partsMap.second) {
      formatted += `:${partsMap.second}`
    }
  }

  if (showTimezone && timezone !== 'UTC') {
    // Add timezone abbreviation
    const tzAbbr = getTimezoneAbbreviation(timezone, utcDate)
    formatted += ` ${tzAbbr}`
  }

  return formatted
}

/**
 * Get timezone abbreviation (e.g., EST, EDT, PST, PDT)
 * @param {string} timezone - IANA timezone name
 * @param {Date} date - Date to check for DST
 * @returns {string} Timezone abbreviation
 */
export function getTimezoneAbbreviation(timezone, date = new Date()) {
  const dst = isDST(date)

  const abbreviations = {
    'America/New_York': dst ? 'EDT' : 'EST',
    'America/Chicago': dst ? 'CDT' : 'CST',
    'America/Denver': dst ? 'MDT' : 'MST',
    'America/Los_Angeles': dst ? 'PDT' : 'PST',
    'America/Anchorage': dst ? 'AKDT' : 'AKST',
    'Pacific/Honolulu': 'HST',
    'UTC': 'UTC'
  }

  return abbreviations[timezone] || 'UTC'
}

/**
 * Get relative time string (e.g., "2 hours ago", "just now")
 * @param {string|Date} utcTimestamp - UTC timestamp from database
 * @returns {string} Relative time string
 */
export function getRelativeTime(utcTimestamp) {
  if (!utcTimestamp) return '-'

  const utcDate = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp
  const now = new Date()
  const diffMs = now - utcDate
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`

  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`

  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`
}
