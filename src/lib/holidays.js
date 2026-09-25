// Public holidays for the holidays card on the employee dashboard. Next year's
// dates need adding before January.

const PUBLIC_HOLIDAYS = {
  Ghana: [
    { date: '2026-01-01', name: "New Year's Day" },
    { date: '2026-03-06', name: 'Independence Day' },
    { date: '2026-04-03', name: 'Good Friday' },
    { date: '2026-04-06', name: 'Easter Monday' },
    { date: '2026-05-01', name: 'May Day' },
    { date: '2026-07-01', name: 'Republic Day' },
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-26', name: 'Boxing Day' }
  ],
  Nigeria: [
    { date: '2026-01-01', name: "New Year's Day" },
    { date: '2026-04-03', name: 'Good Friday' },
    { date: '2026-04-06', name: 'Easter Monday' },
    { date: '2026-05-01', name: "Workers' Day" },
    { date: '2026-10-01', name: 'Independence Day' },
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-26', name: 'Boxing Day' }
  ],
  'United Kingdom': [
    { date: '2026-01-01', name: "New Year's Day" },
    { date: '2026-04-03', name: 'Good Friday' },
    { date: '2026-04-06', name: 'Easter Monday' },
    { date: '2026-05-04', name: 'Early May Bank Holiday' },
    { date: '2026-08-31', name: 'Summer Bank Holiday' },
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-28', name: 'Boxing Day (substitute day)' }
  ],
  'United States': [
    { date: '2026-01-01', name: "New Year's Day" },
    { date: '2026-07-04', name: 'Independence Day' },
    { date: '2026-11-26', name: 'Thanksgiving Day' },
    { date: '2026-12-25', name: 'Christmas Day' }
  ]
};

// Ghana's list if there isn't one for the country.
export function getPublicHolidays(country) {
  return PUBLIC_HOLIDAYS[country] || PUBLIC_HOLIDAYS.Ghana;
}
