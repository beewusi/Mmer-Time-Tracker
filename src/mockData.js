// Local test-mode data store.
// This whole file only exists for the V2 UI prototype — it keeps the app
// fully working offline so the redesign can be checked without touching
// the real Supabase project. supabase.js itself is never imported here.
//
// To go back to production: delete this file and restore the original
// Login.js / SignUp.js / Dashboard.js / AdminDashboard.js data calls.

export const TEST_MODE = false;

// Matches the real ADMIN_EMAIL export from supabase.js so the routing
// logic in App.js (user.email === ADMIN_EMAIL) behaves the same way.
export const ADMIN_EMAIL = 'admin@mmer3.com';

// Hardcoded test credentials. I don't have access to your real Supabase
// admin password (it's hashed on Supabase's end), so this is a stand-in
// login for the test build only — swap back to real Supabase auth before
// going live.
export const TEST_CREDENTIALS = {
  admin: { email: ADMIN_EMAIL, password: 'Admin123!' },
  employee: { email: 'employee@test.com', password: 'Test1234' }
};

const STORAGE_KEY = 'mmer_test_mode_v2';

function seedState() {
  return {
    records: [
      {
        id: 'r1',
        user_id: 'test-employee-id',
        date: new Date().toLocaleDateString('en-GB'),
        clock_in: '08:02 AM',
        clock_out: '12:31 PM',
        hours_worked: '04:29:00',
        break_time: '00:15:00',
        location_status: 'authorised',
        created_at: new Date().toISOString()
      }
    ],
    employees: [
      {
        id: 'test-employee-id',
        full_name: 'Ama Boateng',
        email: 'employee@test.com',
        department: 'Operations',
        country: 'Ghana',
        is_admin: false
      },
      {
        id: 'emp-2',
        full_name: 'Kwabena Owusu',
        email: 'kwabena@mmer3.com',
        department: 'Finance',
        country: 'Ghana',
        is_admin: false
      },
      {
        id: 'emp-3',
        full_name: 'Efua Mensah',
        email: 'efua@mmer3.com',
        department: 'Human Resources',
        country: 'Ghana',
        is_admin: false
      }
    ],
    // Seeded so the Time Off screen and the holidays card have something
    // realistic to show straight away in the test build.
    timeOffRequests: [
      {
        id: 'to-1',
        user_id: 'test-employee-id',
        type: 'Annual Leave',
        start_date: '2026-08-10',
        end_date: '2026-08-14',
        reason: 'Family trip to Cape Coast',
        status: 'approved',
        created_at: '2026-07-20T09:00:00.000Z'
      },
      {
        id: 'to-2',
        user_id: 'test-employee-id',
        type: 'Sick Leave',
        start_date: '2026-09-02',
        end_date: '2026-09-02',
        reason: 'Doctor\u2019s appointment',
        status: 'pending',
        created_at: '2026-08-30T14:20:00.000Z'
      }
    ]
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore malformed/blocked storage, fall back to seed
  }
  const seeded = seedState();
  saveState(seeded);
  return seeded;
}

function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // storage unavailable — test session just won't persist across reloads
  }
}

export function getTestUser(email) {
  const normalised = email.trim().toLowerCase();
  if (normalised === TEST_CREDENTIALS.admin.email.toLowerCase()) {
    return {
      id: 'test-admin-id',
      email: TEST_CREDENTIALS.admin.email,
      user_metadata: { full_name: 'Administrator', department: 'Admin', country: 'Ghana' }
    };
  }
  if (normalised === TEST_CREDENTIALS.employee.email.toLowerCase()) {
    return {
      id: 'test-employee-id',
      email: TEST_CREDENTIALS.employee.email,
      user_metadata: { full_name: 'Ama Boateng', department: 'Operations', country: 'Ghana' }
    };
  }
  return null;
}

export function checkTestLogin(email, password) {
  const normalised = email.trim().toLowerCase();
  if (
    normalised === TEST_CREDENTIALS.admin.email.toLowerCase() &&
    password === TEST_CREDENTIALS.admin.password
  ) {
    return getTestUser(email);
  }
  if (
    normalised === TEST_CREDENTIALS.employee.email.toLowerCase() &&
    password === TEST_CREDENTIALS.employee.password
  ) {
    return getTestUser(email);
  }
  return null;
}

export function getRecords(userId) {
  const state = loadState();
  return state.records
    .filter(r => r.user_id === userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function getAllRecords() {
  const state = loadState();
  return [...state.records].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
}

export function addRecord(record) {
  const state = loadState();
  const withId = { ...record, id: `r${Date.now()}`, created_at: new Date().toISOString() };
  state.records = [withId, ...state.records];
  saveState(state);
  return withId;
}

export function getEmployees() {
  const state = loadState();
  return state.employees;
}

export function addEmployee(employee) {
  const state = loadState();
  // Seeded/demo employees predate the approval flow and have no `status`
  // field at all — treated as already approved.
  state.employees = [...state.employees, { country: 'Ghana', status: 'approved', ...employee }];
  saveState(state);
  return employee;
}

// ---------- Sign-up approvals (test mode) ----------

export function getPendingEmployees() {
  const state = loadState();
  return state.employees.filter(e => e.status === 'pending');
}

export function approveEmployee(id, department) {
  const state = loadState();
  state.employees = state.employees.map(e =>
    e.id === id ? { ...e, status: 'approved', department } : e
  );
  saveState(state);
}

export function updateEmployeeDetails(id, updates) {
  const state = loadState();
  state.employees = state.employees.map(e =>
    e.id === id ? { ...e, ...updates } : e
  );
  saveState(state);
}

export function rejectEmployee(id) {
  const state = loadState();
  state.employees = state.employees.map(e =>
    e.id === id ? { ...e, status: 'rejected' } : e
  );
  saveState(state);
}

// ---------- Time off ----------

export function getTimeOffRequests(userId) {
  const state = loadState();
  return (state.timeOffRequests || [])
    .filter(t => t.user_id === userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function addTimeOffRequest(request) {
  const state = loadState();
  const withId = {
    ...request,
    id: `to-${Date.now()}`,
    status: 'pending',
    created_at: new Date().toISOString()
  };
  state.timeOffRequests = [withId, ...(state.timeOffRequests || [])];
  saveState(state);
  return withId;
}

export function cancelTimeOffRequest(requestId) {
  const state = loadState();
  // Only a still-pending request can be cancelled — once an admin has
  // decided on it, the employee just has a record of that decision.
  state.timeOffRequests = (state.timeOffRequests || []).filter(
    r => !(r.id === requestId && r.status === 'pending')
  );
  saveState(state);
}

// ---------- Public holidays ----------
// A small, illustrative set of public holidays per country for the
// "Upcoming holidays and time off" card. Not exhaustive — swap in a
// proper holidays API/service for production use.
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

export function getPublicHolidays(country) {
  return PUBLIC_HOLIDAYS[country] || PUBLIC_HOLIDAYS.Ghana;
}

// ---------- Avatar ----------
// Stored as a data URL in its own localStorage key, separate from the
// rest of the test-mode state, so it survives independently of resets.

export function getAvatar(userId) {
  try {
    return window.localStorage.getItem(`mmer_avatar_${userId}`);
  } catch (e) {
    return null;
  }
}

export function setAvatar(userId, dataUrl) {
  try {
    window.localStorage.setItem(`mmer_avatar_${userId}`, dataUrl);
  } catch (e) {
    // storage unavailable — the picture just won't persist across reloads
  }
}

// ---------- Admin settings ----------
// Small admin-only preferences, kept separate from the per-employee
// reminder toggles on the employee side.

export function getAdminSettings() {
  try {
    const raw = window.localStorage.getItem('mmer_admin_settings');
    return raw ? JSON.parse(raw) : { locationAlerts: true };
  } catch (e) {
    return { locationAlerts: true };
  }
}

export function setAdminSettings(settings) {
  try {
    window.localStorage.setItem('mmer_admin_settings', JSON.stringify(settings));
  } catch (e) {
    // storage unavailable — the setting just won't persist across reloads
  }
}

// ---------- Admin: timesheet corrections ----------

export function updateRecord(recordId, updates) {
  const state = loadState();
  state.records = state.records.map(r =>
    r.id === recordId ? { ...r, ...updates } : r
  );
  saveState(state);
  return state.records.find(r => r.id === recordId);
}

// ---------- Timesheet approvals (test mode) ----------

function timesheetApprovalKey(userId, year, month) {
  return `${userId}-${year}-${month}`;
}

export function getTimesheetApproval(userId, year, month) {
  const state = loadState();
  const approvals = state.timesheetApprovals || {};
  return approvals[timesheetApprovalKey(userId, year, month)] || null;
}

export function setTimesheetApproval(userId, year, month, approved) {
  const state = loadState();
  const approvals = state.timesheetApprovals || {};
  const key = timesheetApprovalKey(userId, year, month);
  approvals[key] = {
    user_id: userId,
    year,
    month,
    approved,
    approved_at: approved ? new Date().toISOString() : null
  };
  state.timesheetApprovals = approvals;
  saveState(state);
  return approvals[key];
}

// ---------- Admin: time off across everyone ----------

export function getAllTimeOffRequests() {
  const state = loadState();
  return [...(state.timeOffRequests || [])].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
}

export function updateTimeOffStatus(requestId, status, adminMessage) {
  const state = loadState();
  state.timeOffRequests = (state.timeOffRequests || []).map(t =>
    t.id === requestId
      ? { ...t, status, ...(adminMessage !== undefined ? { admin_message: adminMessage } : {}) }
      : t
  );
  saveState(state);
  return state.timeOffRequests;
}

export function bulkUpdateTimeOffStatus(requestIds, status) {
  const state = loadState();
  const idSet = new Set(requestIds);
  state.timeOffRequests = (state.timeOffRequests || []).map(t =>
    idSet.has(t.id) ? { ...t, status } : t
  );
  saveState(state);
  return state.timeOffRequests;
}

// ---------- Admin: clock an employee in/out or toggle their break ----------
// A manual override an admin can use from their own device — e.g. to fix
// a forgotten clock-out — independent of that employee's own session.

function defaultEmployeeStatus() {
  return {
    status: 'not_clocked_in', // 'not_clocked_in' | 'clocked_in' | 'on_break' | 'clocked_out'
    clock_in_at: null,
    break_started_at: null,
    break_accum_seconds: 0
  };
}

function secondsToHms(totalSeconds) {
  const safeSeconds = Math.max(totalSeconds, 0);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function setEmployeeStatusState(userId, status) {
  const state = loadState();
  // I'm stamping updated_at here, centrally, instead of at each call
  // site. The real Supabase path (AdminDashboard.js / Dashboard.js) adds
  // this on every upsert, and I rely on it in AdminDashboard's getStatus()
  // to tell a 'clocked_out' status set today apart from one left over
  // from a previous day. This mock path didn't set it at all, so if I
  // ever flip TEST_MODE back on, every 'clocked_out' employee would have
  // shown as 'Not Clocked In' regardless of when they actually clocked
  // out — not wrong in spirit, but not what I meant. Doing it here means
  // every caller (adminClockIn/StartBreak/EndBreak/ClockOut, and the
  // employee's own clock in/out in TEST_MODE) gets it for free.
  const stamped = { ...status, updated_at: new Date().toISOString() };
  state.employeeStatus = { ...(state.employeeStatus || {}), [userId]: stamped };
  saveState(state);
  return stamped;
}

export function getEmployeeStatus(userId) {
  const state = loadState();
  return (state.employeeStatus && state.employeeStatus[userId]) || defaultEmployeeStatus();
}

export function setEmployeeStatus(userId, status) {
  return setEmployeeStatusState(userId, status);
}

export function getAllEmployeeStatuses() {
  const state = loadState();
  return state.employeeStatus || {};
}

export function adminClockIn(userId) {
  return setEmployeeStatusState(userId, {
    status: 'clocked_in',
    clock_in_at: new Date().toISOString(),
    break_started_at: null,
    break_accum_seconds: 0
  });
}

export function adminStartBreak(userId) {
  const current = getEmployeeStatus(userId);
  return setEmployeeStatusState(userId, {
    ...current,
    status: 'on_break',
    break_started_at: new Date().toISOString()
  });
}

export function adminEndBreak(userId) {
  const current = getEmployeeStatus(userId);
  const breakStarted = current.break_started_at ? new Date(current.break_started_at) : null;
  const additional = breakStarted ? Math.round((Date.now() - breakStarted.getTime()) / 1000) : 0;
  return setEmployeeStatusState(userId, {
    ...current,
    status: 'clocked_in',
    break_started_at: null,
    break_accum_seconds: (current.break_accum_seconds || 0) + additional
  });
}

export function adminClockOut(userId) {
  const current = getEmployeeStatus(userId);
  const clockInAt = current.clock_in_at ? new Date(current.clock_in_at) : new Date();
  const now = new Date();
  const totalSeconds = Math.round((now - clockInAt) / 1000) - (current.break_accum_seconds || 0);

  addRecord({
    user_id: userId,
    date: now.toLocaleDateString('en-GB'),
    clock_in: clockInAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    clock_out: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    hours_worked: secondsToHms(totalSeconds),
    break_time: secondsToHms(current.break_accum_seconds || 0),
    location_status: 'unavailable',
    adjusted_by_admin: true
  });

  return setEmployeeStatusState(userId, { ...defaultEmployeeStatus(), status: 'clocked_out' });
}
