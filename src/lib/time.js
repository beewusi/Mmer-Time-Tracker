// Clock times on records. Older ones were saved in the browser's own
// format ("08:02" or "08:02 AM"), new ones are saved as 24h "HH:MM".
// Everything on screen goes through formatClock() so it shows AM/PM.

// "08:02", "8:02 PM", "08:02:00", "8:02 p.m." -> minutes since midnight
export function parseClockTime(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?\s*m?\.?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3] ? match[3].toLowerCase() : null;
  if (minutes > 59) return null;

  if (period) {
    if (hours < 1 || hours > 12) return null;
    if (period === 'a' && hours === 12) hours = 0;
    if (period === 'p' && hours !== 12) hours += 12;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

export function minutesToHHMM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Saved format for new records
export function dateToHHMM(date) {
  return minutesToHHMM(date.getHours() * 60 + date.getMinutes());
}

// "14:30" -> "2:30 PM". Anything unreadable is shown as it is.
export function formatClock(value) {
  const minutes = parseClockTime(value);
  if (minutes === null) return value || '';
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function hmsToSeconds(value) {
  if (!value) return 0;
  const parts = String(value).split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

export function secondsToHms(totalSeconds) {
  const safe = Math.max(Math.round(totalSeconds) || 0, 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Clock in -> clock out minus break, as "HH:MM:SS". null if a time can't be read.
// Clock out earlier than clock in = shift went past midnight.
export function calculateHoursWorked(clockIn, clockOut, breakTime) {
  const start = parseClockTime(clockIn);
  const end = parseClockTime(clockOut);
  if (start === null || end === null) return null;
  let minutes = end - start;
  if (minutes < 0) minutes += 24 * 60;
  return secondsToHms(minutes * 60 - hmsToSeconds(breakTime));
}
