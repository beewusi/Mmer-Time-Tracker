import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import {
  TEST_MODE, getEmployees, getAllRecords, updateRecord,
  getAllTimeOffRequests, updateTimeOffStatus,
  getAllEmployeeStatuses, adminClockIn, adminStartBreak, adminEndBreak, adminClockOut,
  getAdminSettings, setAdminSettings,
  getPendingEmployees, approveEmployee, rejectEmployee, updateEmployeeDetails,
  getTimesheetApproval, setTimesheetApproval
} from '../mockData';
import { callAI } from '../lib/ai';
import './AdminDashboard.css';
import {
  HourglassIcon, UsersIcon, RefreshIcon, LogoutIcon, TimesheetIcon,
  SuitcaseIcon, HelpIcon, ClockIcon, CoffeeIcon, CheckCircleIcon, XIcon,
  SettingsIcon, PinIcon, UserIcon, MoonIcon, SunIcon
} from '../icons';

const FAQ_ITEMS = [
  {
    q: 'How does an employee clock in or out?',
    a: 'From their dashboard, employees use the Clock In button on the Clock In card. Location is checked against the office radius — clocking in from an unauthorised location is blocked automatically.'
  },
  {
    q: 'What happens if someone forgets to clock out?',
    a: 'They are reminded after 3 hours and 8 hours of work, and automatically clocked out after 8 hours 15 minutes. If a session still looks wrong afterwards, use the Clock Out action on their profile in the Employees tab to correct it.'
  },
  {
    q: 'How do I approve a new sign-up?',
    a: 'Open the Approvals tab. Every new sign-up (including Google sign-ups) sits there until you type in a department and click Approve — they can\u2019t sign in until then. Click Reject to turn one down instead.'
  },
  {
    q: 'How do I approve time off requests?',
    a: 'Open the Time Off tab. Approve or reject requests individually, or tick several pending requests and use the bulk actions above the list to approve or reject them all at once.'
  },
  {
    q: 'Can I correct a timesheet entry?',
    a: 'Yes — open the Timesheets tab, click Edit on the relevant row, adjust the clock in/out, break time or hours worked, then save.'
  },
  {
    q: 'How do I clock an employee in, out, or onto a break myself?',
    a: 'Open the Employees tab and click on any employee row to open their profile card, which has Clock In, Start Break, End Break and Clock Out actions depending on their current status.'
  },
  {
    q: 'What do the location tags on a timesheet mean?',
    a: 'Authorised means the clock-in happened within the allowed radius of the office. Unauthorised means it was outside that radius. N/A means location data wasn\u2019t available at the time.'
  },
  {
    q: 'Where does the AI come in?',
    a: 'It drafts the message sent to an employee when their time off request is approved or rejected, it can flag a timesheet entry worth a second look (the app decides what counts as unusual — the AI just phrases the note), and it powers the assistant on the employee side. See AI_FEATURES.md for the full list.'
  }
];

// Kept as a fallback list so the department picker offers something even
// before any employee has been assigned one yet.
const DEFAULT_DEPARTMENT_SUGGESTIONS = ['Operations', 'Finance', 'Human Resources', 'Sales', 'Engineering'];

function AdminDashboard({ user, onLogout }) {
  const [employees, setEmployees] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingDeptDraft, setPendingDeptDraft] = useState({});
  const [pendingDeptIsNew, setPendingDeptIsNew] = useState({});
  const [pendingActionId, setPendingActionId] = useState(null);
  const [approvalsError, setApprovalsError] = useState('');
  const [deletingEmployeeId, setDeletingEmployeeId] = useState(null);
  const [deleteConfirmEmployee, setDeleteConfirmEmployee] = useState(null);
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('');
  const [deleteConfirmError, setDeleteConfirmError] = useState('');
  const [fullDetailsEmployee, setFullDetailsEmployee] = useState(null);
  const [fullNameDraft, setFullNameDraft] = useState('');
  const [fullDeptDraft, setFullDeptDraft] = useState('');
  const [fullDeptIsNew, setFullDeptIsNew] = useState(false);
  const [savingFullDetails, setSavingFullDetails] = useState(false);
  const [fullDetailsError, setFullDetailsError] = useState('');
  const [records, setRecords] = useState([]);
  const [employeeStatuses, setEmployeeStatuses] = useState({});
  const [allTimeOff, setAllTimeOff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('employees');

  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const [editingRecordId, setEditingRecordId] = useState(null);
  const [editForm, setEditForm] = useState({ clock_in: '', clock_out: '', break_time: '', hours_worked: '' });
  const [timesheetEmployeeId, setTimesheetEmployeeId] = useState('');
  const [timesheetMonthDate, setTimesheetMonthDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [timesheetSelectedDate, setTimesheetSelectedDate] = useState(null);
  const [timesheetViewMode, setTimesheetViewMode] = useState('monthly');
  const [timesheetApproval, setTimesheetApprovalState] = useState(null);
  const [approvalSaving, setApprovalSaving] = useState(false);

  const [selectedTimeOffIds, setSelectedTimeOffIds] = useState([]);
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [adminSettings, setAdminSettingsState] = useState({ locationAlerts: true });
  const [processingTimeOffId, setProcessingTimeOffId] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [anomalyNotes, setAnomalyNotes] = useState({});
  const [anomalyLoadingId, setAnomalyLoadingId] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [liveTick, setLiveTick] = useState(Date.now());

  useEffect(() => {
    loadData();
    loadAdminSettings();
  }, []);

  // Defaults the Timesheets tab to the first employee once the list is
  // in, rather than leaving it blank until the admin picks someone.
  useEffect(() => {
    if (!timesheetEmployeeId && employees.length > 0) {
      setTimesheetEmployeeId(employees[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  useEffect(() => {
    if (timesheetEmployeeId) {
      loadTimesheetApproval();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timesheetEmployeeId, timesheetMonthDate]);

  async function loadAdminSettings() {
    if (TEST_MODE) {
      setAdminSettingsState(getAdminSettings());
      return;
    }
    const { data, error } = await supabase
      .from('app_settings')
      .select('location_alerts')
      .eq('id', 1)
      .maybeSingle();

    if (!error && data) {
      setAdminSettingsState({ locationAlerts: data.location_alerts });
    }
  }

  // Ticks once a second only while the modal is open on someone who's
  // currently clocked in or on break, so the admin can watch their break
  // (or work) time count up live instead of seeing a static badge.
  useEffect(() => {
    if (!selectedEmployee) return undefined;
    const status = getStatus(selectedEmployee.id);
    if (status !== 'clocked_in' && status !== 'on_break') return undefined;

    const interval = setInterval(() => setLiveTick(Date.now()), 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee, employeeStatuses]);

  // Keeps the admin's view current without needing a manual refresh —
  // catches new sign-ups, time off requests, and clocked-in/out records
  // from any employee. The employee_status table already pushes live via
  // the realtime subscription below; this covers everything else.
  useEffect(() => {
    if (TEST_MODE) return undefined;
    const interval = setInterval(() => loadData(true), 30000);
    return () => clearInterval(interval);
  }, []);

  // Live status updates from any employee, on any device, push straight
  // into this tab — no manual refresh needed. Only relevant once
  // TEST_MODE is off and the employee_status table actually exists.
  useEffect(() => {
    if (TEST_MODE) return undefined;

    const channel = supabase
      .channel('admin-employee-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_status' }, () => {
        refreshStatuses();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function secondsToHms(totalSeconds) {
    const safeSeconds = Math.max(Math.round(totalSeconds) || 0, 0);
    const h = Math.floor(safeSeconds / 3600);
    const m = Math.floor((safeSeconds % 3600) / 60);
    const s = Math.floor(safeSeconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function hmsToSeconds(str) {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }

  async function refreshStatuses() {
    if (TEST_MODE) {
      setEmployeeStatuses(getAllEmployeeStatuses());
      return;
    }
    const { data } = await supabase.from('employee_status').select('*');
    const map = {};
    (data || []).forEach(row => { map[row.user_id] = row; });
    setEmployeeStatuses(map);
  }

  async function loadData(silent = false) {
    if (!silent) setLoading(true);

    if (TEST_MODE) {
      setEmployees(getEmployees().filter(e => (e.status || 'approved') === 'approved'));
      setPendingUsers(getPendingEmployees());
      setRecords(getAllRecords());
      setAllTimeOff(getAllTimeOffRequests());
      await refreshStatuses();
      if (!silent) setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_admin', false)
      .eq('status', 'approved');

    const { data: pending } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_admin', false)
      .eq('status', 'pending');

    const { data: allRecords } = await supabase
      .from('records')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: timeOff } = await supabase
      .from('time_off_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (profiles) setEmployees(profiles);
    setPendingUsers(pending || []);
    if (allRecords) setRecords(allRecords);
    if (timeOff) setAllTimeOff(timeOff);
    await refreshStatuses();
    if (!silent) setLoading(false);
  }

  function getCurrentDate() {
    return new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function getEmployeeName(userId) {
    const emp = employees.find(e => e.id === userId);
    return emp ? (emp.full_name || emp.email) : 'Unknown employee';
  }

  function getEmployeeEmail(userId) {
    const emp = employees.find(e => e.id === userId);
    return emp ? emp.email : null;
  }

  function hoursStringToSeconds(str) {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }

  // Plain maths decides whether a day looks unusual for this employee —
  // the AI is only ever asked to phrase the note, never to judge the number.
  function getHoursAnomaly(userId) {
    const employeeRecords = records.filter(r => r.user_id === userId);
    if (employeeRecords.length < 2) return null;

    const sorted = [...employeeRecords].sort((a, b) => {
      const [d1, m1, y1] = a.date.split('/').map(Number);
      const [d2, m2, y2] = b.date.split('/').map(Number);
      return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
    });

    const [latest, ...rest] = sorted;
    const latestSeconds = hoursStringToSeconds(latest.hours_worked);
    const averageSeconds = rest.reduce((sum, r) => sum + hoursStringToSeconds(r.hours_worked), 0) / rest.length;
    if (averageSeconds === 0) return null;

    const diffRatio = Math.abs(latestSeconds - averageSeconds) / averageSeconds;
    if (diffRatio < 0.35) return null; // close enough to normal — nothing to flag

    return {
      date: latest.date,
      hoursToday: latest.hours_worked,
      averageHours: `${Math.floor(averageSeconds / 3600)}h ${Math.floor((averageSeconds % 3600) / 60)}m`
    };
  }

  function getTodayRecords(userId) {
    const today = new Date().toLocaleDateString('en-GB');
    return records.filter(r =>
      r.user_id === userId && r.date === today
    );
  }

  function getTotalHoursToday(userId) {
    const todayRecords = getTodayRecords(userId);
    if (todayRecords.length === 0) return '00:00:00';

    let totalSeconds = 0;
    todayRecords.forEach(record => {
      if (record.hours_worked) {
        const parts = record.hours_worked.split(':');
        totalSeconds += parseInt(parts[0]) * 3600 +
          parseInt(parts[1]) * 60 +
          parseInt(parts[2]);
      }
    });

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function isOnLeaveToday(userId) {
    const todayIso = new Date().toISOString().slice(0, 10);
    return allTimeOff.some(t =>
      t.user_id === userId &&
      t.status === 'approved' &&
      t.start_date <= todayIso &&
      t.end_date >= todayIso
    );
  }

  function getStatus(userId) {
    const record = employeeStatuses[userId];
    const liveStatus = record && record.status;
    if (liveStatus === 'clocked_in' || liveStatus === 'on_break') return liveStatus;
    if (isOnLeaveToday(userId)) return 'on_leave';

    // I found that 'clocked_out' was sticking around forever once it was
    // set — employee_status is one row per employee, not one row per
    // day, so if someone clocked out yesterday (or last week) and hasn't
    // clocked in again since, this used to still read 'clocked_out' here,
    // which reads as "finished today's shift" when really they haven't
    // started today at all. I only want to trust a 'clocked_out' status
    // if it was actually set today; otherwise I'm treating it the same
    // as never having clocked in.
    if (liveStatus === 'clocked_out') {
      const updatedAt = record.updated_at;
      const setToday = updatedAt
        ? new Date(updatedAt).toDateString() === new Date().toDateString()
        : false;
      return setToday ? 'clocked_out' : 'not_clocked_in';
    }

    return liveStatus || 'not_clocked_in';
  }

  function statusLabel(status) {
    if (status === 'clocked_in') return 'Clocked In';
    if (status === 'on_break') return 'On Break';
    if (status === 'clocked_out') return 'Clocked Out';
    if (status === 'on_leave') return 'On Leave';
    return 'Not Clocked In';
  }

  function statusTone(status) {
    if (status === 'clocked_in') return 'success';
    if (status === 'on_break') return 'warning';
    if (status === 'clocked_out') return 'neutral';
    if (status === 'on_leave') return 'leave';
    return 'muted';
  }

  // Live break/work duration for the modal — recomputed every second via
  // the liveTick effect above, using the same clock_in_at/break_started_at
  // data the employee's own device writes to employee_status.
  function getLiveDuration(userId) {
    const s = employeeStatuses[userId];
    if (!s) return null;

    if (s.status === 'on_break' && s.break_started_at) {
      const secs = Math.max(0, Math.round((liveTick - new Date(s.break_started_at).getTime()) / 1000));
      return secondsToHms(secs);
    }
    if (s.status === 'clocked_in' && s.clock_in_at) {
      const elapsed = Math.max(0, Math.round((liveTick - new Date(s.clock_in_at).getTime()) / 1000));
      const worked = elapsed - (s.break_accum_seconds || 0);
      return secondsToHms(Math.max(0, worked));
    }
    return null;
  }

  function getDepartments() {
    const set = new Set([
      ...DEFAULT_DEPARTMENT_SUGGESTIONS,
      ...employees.map(e => e.department).filter(Boolean)
    ]);
    return Array.from(set);
  }

  // ---------- Sign-up approvals ----------

  function handlePendingDeptChange(userId, value) {
    setPendingDeptDraft(prev => ({ ...prev, [userId]: value }));
  }

  async function handleApprovePending(pendingUser) {
    const department = (pendingDeptDraft[pendingUser.id] || '').trim();
    if (!department) return;

    setPendingActionId(pendingUser.id);

    if (TEST_MODE) {
      approveEmployee(pendingUser.id, department);
    } else {
      await supabase
        .from('profiles')
        .update({ status: 'approved', department })
        .eq('id', pendingUser.id);
    }

    await loadData();
    setPendingActionId(null);
  }

  async function handleRejectPending(pendingUser) {
    setPendingActionId(pendingUser.id);
    setApprovalsError('');

    if (TEST_MODE) {
      rejectEmployee(pendingUser.id);
    } else {
      // Deletes the auth account too, not just the profiles row — see
      // supabase/functions/admin-reject-user — so the email is fully
      // free for that person to sign up again if needed.
      const { data, error } = await supabase.functions.invoke('admin-reject-user', {
        body: { userId: pendingUser.id }
      });
      if (error || data?.error) {
        setApprovalsError(data?.error || 'Could not reject this account. Please try again.');
        setPendingActionId(null);
        return;
      }
    }

    await loadData();
    setPendingActionId(null);
  }

  // ---------- Editing an already-approved employee's full details ----------

  function openFullDetails(employee) {
    setFullDetailsEmployee(employee);
    setFullNameDraft(employee.full_name || '');
    setFullDeptDraft(employee.department || '');
    setFullDeptIsNew(false);
    setFullDetailsError('');
  }

  async function handleSaveFullDetails() {
    if (!fullDetailsEmployee) return;
    const name = fullNameDraft.trim();
    const department = fullDeptDraft.trim();

    if (!name || !department) {
      setFullDetailsError('Name and department are both required.');
      return;
    }

    setSavingFullDetails(true);
    setFullDetailsError('');

    if (TEST_MODE) {
      updateEmployeeDetails(fullDetailsEmployee.id, { full_name: name, department });
    } else {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: name, department })
        .eq('id', fullDetailsEmployee.id);
      if (error) {
        setFullDetailsError('Failed to save changes. Please try again.');
        setSavingFullDetails(false);
        return;
      }
    }

    setSelectedEmployee(prev => prev && prev.id === fullDetailsEmployee.id ? { ...prev, full_name: name, department } : prev);
    setFullDetailsEmployee(null);
    await loadData();
    setSavingFullDetails(false);
  }

  function openDeleteConfirm(employee) {
    setDeleteConfirmEmployee(employee);
    setDeleteConfirmPassword('');
    setDeleteConfirmError('');
  }

  async function performDelete(employee) {
    setDeletingEmployeeId(employee.id);

    if (TEST_MODE) {
      rejectEmployee(employee.id); // test-mode stand-in: marks them removed
    } else {
      // Same edge function used to fully remove a rejected sign-up — it
      // just deletes the auth account + profile row by id, whether the
      // person was pending or already approved.
      const { data, error } = await supabase.functions.invoke('admin-reject-user', {
        body: { userId: employee.id }
      });
      if (error || data?.error) {
        setDeleteConfirmError(data?.error || 'Could not delete this account. Please try again.');
        setDeletingEmployeeId(null);
        return;
      }
    }

    setSelectedEmployee(null);
    setDeleteConfirmEmployee(null);
    setDeleteConfirmPassword('');
    await loadData();
    setDeletingEmployeeId(null);
  }

  // Re-checks the admin's own password before a delete actually goes
  // through — the confirm dialog alone can be clicked through by accident
  // (or by anyone left at an unlocked, still-logged-in session); typing
  // the password is a deliberate second step only the real admin can do.
  async function submitDeleteConfirm() {
    if (!deleteConfirmEmployee) return;

    if (TEST_MODE) {
      await performDelete(deleteConfirmEmployee);
      return;
    }

    if (!deleteConfirmPassword) {
      setDeleteConfirmError('Enter your password to confirm.');
      return;
    }

    setDeleteConfirmError('');
    setDeletingEmployeeId(deleteConfirmEmployee.id);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: deleteConfirmPassword
    });

    if (authError) {
      setDeleteConfirmError('Incorrect password.');
      setDeletingEmployeeId(null);
      return;
    }

    await performDelete(deleteConfirmEmployee);
  }

  function filteredEmployees() {
    return employees.filter(e => {
      const matchesDept = departmentFilter === 'all' || e.department === departmentFilter;
      const matchesStatus = statusFilter === 'all' || getStatus(e.id) === statusFilter;
      return matchesDept && matchesStatus;
    });
  }

  const totalClockedIn = employees.filter(e => getStatus(e.id) === 'clocked_in').length;
  const totalOnBreak = employees.filter(e => getStatus(e.id) === 'on_break').length;
  const totalClockedOut = employees.filter(e => getStatus(e.id) === 'clocked_out').length;
  const totalOnLeave = employees.filter(e => getStatus(e.id) === 'on_leave').length;
  const totalNotClockedIn = employees.length - totalClockedIn - totalOnBreak - totalClockedOut - totalOnLeave;

  // ---------- Employee status overrides ----------
  // TEST_MODE keeps using the existing localStorage-backed mockData
  // functions unchanged; the else branch is the real, multi-device
  // Supabase path against the employee_status table.

  async function handleAdminClockIn(employeeId) {
    if (TEST_MODE) {
      adminClockIn(employeeId);
    } else {
      // I'm resetting the server-side reminder-sent flags here too — this
      // is a fresh session, and reminder-sweep (the cron job) needs to be
      // free to send this employee's 2hr/3hr/8hr reminders again even
      // though I'm the one who clocked them in, not them.
      await supabase.from('employee_status').upsert({
        user_id: employeeId,
        status: 'clocked_in',
        clock_in_at: new Date().toISOString(),
        break_started_at: null,
        break_accum_seconds: 0,
        break_2h_sent: false,
        break_3h_sent: false,
        clock_out_8h_sent: false,
        auto_clock_out_sent: false,
        updated_at: new Date().toISOString()
      });
    }
    await refreshStatuses();
  }

  async function handleAdminStartBreak(employeeId) {
    if (TEST_MODE) {
      adminStartBreak(employeeId);
    } else {
      const { data: current } = await supabase
        .from('employee_status').select('*').eq('user_id', employeeId).maybeSingle();
      await supabase.from('employee_status').upsert({
        user_id: employeeId,
        status: 'on_break',
        clock_in_at: current?.clock_in_at || new Date().toISOString(),
        break_started_at: new Date().toISOString(),
        break_accum_seconds: current?.break_accum_seconds || 0,
        updated_at: new Date().toISOString()
      });
    }
    await refreshStatuses();
  }

  async function handleAdminEndBreak(employeeId) {
    if (TEST_MODE) {
      adminEndBreak(employeeId);
    } else {
      const { data: current } = await supabase
        .from('employee_status').select('*').eq('user_id', employeeId).maybeSingle();
      const breakStarted = current?.break_started_at ? new Date(current.break_started_at) : null;
      const additional = breakStarted ? Math.round((Date.now() - breakStarted.getTime()) / 1000) : 0;
      await supabase.from('employee_status').upsert({
        user_id: employeeId,
        status: 'clocked_in',
        clock_in_at: current?.clock_in_at || new Date().toISOString(),
        break_started_at: null,
        break_accum_seconds: (current?.break_accum_seconds || 0) + additional,
        updated_at: new Date().toISOString()
      });
    }
    await refreshStatuses();
  }

  async function handleAdminClockOut(employeeId) {
    if (TEST_MODE) {
      adminClockOut(employeeId);
      setRecords(getAllRecords());
    } else {
      const { data: current } = await supabase
        .from('employee_status').select('*').eq('user_id', employeeId).maybeSingle();
      const clockInAt = current?.clock_in_at ? new Date(current.clock_in_at) : new Date();
      const now = new Date();
      const totalSeconds = Math.round((now - clockInAt) / 1000) - (current?.break_accum_seconds || 0);

      await supabase.from('records').insert([{
        user_id: employeeId,
        date: now.toLocaleDateString('en-GB'),
        clock_in: clockInAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        clock_out: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        hours_worked: secondsToHms(totalSeconds),
        break_time: secondsToHms(current?.break_accum_seconds || 0),
        location_status: 'unavailable',
        adjusted_by_admin: true
      }]);

      await supabase.from('employee_status').upsert({
        user_id: employeeId,
        status: 'clocked_out',
        clock_in_at: null,
        break_started_at: null,
        break_accum_seconds: 0,
        updated_at: new Date().toISOString()
      });

      await loadData();
    }
    await refreshStatuses();
  }

  // ---------- Timesheet editing ----------

  function startEdit(record) {
    setEditingRecordId(record.id);
    setEditForm({
      clock_in: record.clock_in || '',
      clock_out: record.clock_out || '',
      break_time: record.break_time || '',
      hours_worked: record.hours_worked || ''
    });
  }

  function cancelEdit() {
    setEditingRecordId(null);
  }

  async function saveEdit(recordId) {
    if (TEST_MODE) {
      updateRecord(recordId, editForm);
      setRecords(getAllRecords());
    } else {
      await supabase.from('records').update(editForm).eq('id', recordId);
      await loadData();
    }
    cancelEdit();
  }

  async function handleAuthoriseRecord(recordId) {
    if (TEST_MODE) {
      updateRecord(recordId, { location_status: 'authorised' });
      setRecords(getAllRecords());
    } else {
      await supabase.from('records').update({ location_status: 'authorised' }).eq('id', recordId);
      await loadData();
    }
  }

  // ---------- Timesheets: calendar + monthly approval ----------

  // records.date is stored as DD/MM/YYYY (see mockData/records inserts),
  // not ISO, so this parses that format specifically rather than handing
  // it to `new Date()`, which reads DD/MM/YYYY inconsistently across
  // browsers.
  function parseRecordDate(dateStr) {
    if (!dateStr) return null;
    const [d, m, y] = dateStr.split('/').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d);
  }

  function isSameDay(a, b) {
    return !!a && !!b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function getRecordsForDay(userId, day) {
    if (!day) return [];
    return records.filter(r => r.user_id === userId && isSameDay(parseRecordDate(r.date), day));
  }

  function getRecordsForMonth(userId, monthDate) {
    return records.filter(r => {
      if (r.user_id !== userId) return false;
      const d = parseRecordDate(r.date);
      return d && d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth();
    });
  }

  function getWeekRange(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return [start, end];
  }

  function sumHoursSeconds(recs) {
    return recs.reduce((sum, r) => sum + hmsToSeconds(r.hours_worked), 0);
  }

  function buildCalendarCells(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const startWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }

  function shiftMonth(delta) {
    setTimesheetMonthDate(prev => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
    setTimesheetSelectedDate(null);
  }

  function getActiveDate() {
    return timesheetSelectedDate || new Date();
  }

  // Daily/Weekly/Monthly now actually changes what's on screen (which
  // day, which week, or the whole month), not just a number in a
  // sidebar — so navigation shifts by whatever unit is currently active.
  function shiftPeriod(delta) {
    if (timesheetViewMode === 'monthly') {
      shiftMonth(delta);
      return;
    }
    const base = getActiveDate();
    const next = new Date(base);
    next.setDate(next.getDate() + delta * (timesheetViewMode === 'weekly' ? 7 : 1));
    setTimesheetSelectedDate(next);
    setTimesheetMonthDate(new Date(next.getFullYear(), next.getMonth(), 1));
  }

  function getPeriodLabel() {
    if (timesheetViewMode === 'monthly') {
      return timesheetMonthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    }
    const base = getActiveDate();
    if (timesheetViewMode === 'weekly') {
      const [start, end] = getWeekRange(base);
      return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return base.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function selectViewMode(mode) {
    setTimesheetViewMode(mode);
    if (!timesheetSelectedDate) setTimesheetSelectedDate(new Date());
  }

  async function loadTimesheetApproval() {
    const year = timesheetMonthDate.getFullYear();
    const month = timesheetMonthDate.getMonth() + 1;

    if (TEST_MODE) {
      setTimesheetApprovalState(getTimesheetApproval(timesheetEmployeeId, year, month));
      return;
    }

    const { data, error } = await supabase
      .from('timesheet_approvals')
      .select('*')
      .eq('user_id', timesheetEmployeeId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();

    if (!error) setTimesheetApprovalState(data || null);
  }

  async function toggleMonthApproval() {
    const year = timesheetMonthDate.getFullYear();
    const month = timesheetMonthDate.getMonth() + 1;
    const nextApproved = !(timesheetApproval && timesheetApproval.approved);

    setApprovalSaving(true);

    if (TEST_MODE) {
      setTimesheetApprovalState(setTimesheetApproval(timesheetEmployeeId, year, month, nextApproved));
      setApprovalSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from('timesheet_approvals')
      .upsert({
        user_id: timesheetEmployeeId,
        year,
        month,
        approved: nextApproved,
        approved_at: nextApproved ? new Date().toISOString() : null
      }, { onConflict: 'user_id,year,month' })
      .select()
      .maybeSingle();

    if (!error) setTimesheetApprovalState(data);
    setApprovalSaving(false);
  }

  function getTimesheetStats() {
    const anchor = getActiveDate();

    if (timesheetViewMode === 'daily') {
      const recs = getRecordsForDay(timesheetEmployeeId, anchor);
      return {
        seconds: sumHoursSeconds(recs),
        label: anchor.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        count: recs.length
      };
    }

    if (timesheetViewMode === 'weekly') {
      const [start, end] = getWeekRange(anchor);
      const recs = records.filter(r => {
        if (r.user_id !== timesheetEmployeeId) return false;
        const d = parseRecordDate(r.date);
        return d && d >= start && d <= end;
      });
      return {
        seconds: sumHoursSeconds(recs),
        label: `Week of ${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        count: recs.length
      };
    }

    const recs = getRecordsForMonth(timesheetEmployeeId, timesheetMonthDate);
    return {
      seconds: sumHoursSeconds(recs),
      label: timesheetMonthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      count: recs.length
    };
  }

  async function toggleLocationAlerts() {
    const updated = { ...adminSettings, locationAlerts: !adminSettings.locationAlerts };
    setAdminSettingsState(updated);

    if (TEST_MODE) {
      setAdminSettings(updated);
    } else {
      // Shared across every device the admin uses — see app_settings in
      // supabase/SYNC_AND_AUTOMATION_FIX.sql — rather than one browser's
      // local storage, which wouldn't follow the admin to another laptop.
      const { error } = await supabase
        .from('app_settings')
        .update({ location_alerts: updated.locationAlerts, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) console.log('Failed to save location alerts setting:', error);
    }
  }

  // ---------- Time off approvals ----------

  function toggleSelectTimeOff(id) {
    setSelectedTimeOffIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function pendingTimeOffIds() {
    return allTimeOff.filter(t => t.status === 'pending').map(t => t.id);
  }

  function toggleSelectAllPending() {
    const pendingIds = pendingTimeOffIds();
    const allSelected = pendingIds.length > 0 && pendingIds.every(id => selectedTimeOffIds.includes(id));
    setSelectedTimeOffIds(allSelected ? [] : pendingIds);
  }

  // Falls back to a plain, still-useful message if the AI drafting step
  // is unavailable (its own edge function + API key, separate from
  // everything else we've set up) — the employee should get *a* message
  // either way, not silence.
  function plainDecisionMessage(request, status) {
    const range = request.start_date === request.end_date
      ? formatDisplayDate(request.start_date)
      : `${formatDisplayDate(request.start_date)} – ${formatDisplayDate(request.end_date)}`;
    return status === 'approved'
      ? `Your ${request.type} request for ${range} has been approved.`
      : `Your ${request.type} request for ${range} was not approved. Reach out to your admin if you have questions.`;
  }

  // Drafts a short decision message with AI, saves it on the request so
  // the employee sees it in their Time Off history, and emails it to them.
  // The AI draft is a nice-to-have — if it fails, we still save and email
  // a plain fallback message. The notification itself should never depend
  // on the AI step succeeding.
  async function draftAndSendDecision(request, status) {
    let message = null;
    try {
      const result = await callAI('time_off_message', {
        employeeName: getEmployeeName(request.user_id),
        type: request.type,
        startDate: request.start_date,
        endDate: request.end_date,
        status,
        reason: request.reason
      });
      message = result.message;
    } catch (err) {
      console.log('AI message drafting failed, using a plain fallback message:', err);
    }

    const finalMessage = message || plainDecisionMessage(request, status);

    if (TEST_MODE) {
      updateTimeOffStatus(request.id, status, finalMessage);
      setAllTimeOff(getAllTimeOffRequests());
    } else {
      await supabase
        .from('time_off_requests')
        .update({ status, admin_message: finalMessage })
        .eq('id', request.id);
      await loadData();
    }
  }

  async function handleTimeOffAction(id, status) {
    const request = allTimeOff.find(t => t.id === id);
    if (!request) return;

    setProcessingTimeOffId(id);
    await draftAndSendDecision(request, status);
    setProcessingTimeOffId(null);
    setSelectedTimeOffIds(prev => prev.filter(x => x !== id));
  }

  async function handleBulkTimeOffAction(status) {
    if (selectedTimeOffIds.length === 0) return;
    setBulkProcessing(true);

    const idsToProcess = [...selectedTimeOffIds];
    for (const id of idsToProcess) {
      const request = allTimeOff.find(t => t.id === id);
      if (request) {
        // Sequential, not parallel — keeps this simple and stays well
        // within the AI API's rate limits for a handful of requests.
        // eslint-disable-next-line no-await-in-loop
        await draftAndSendDecision(request, status);
      }
    }

    setBulkProcessing(false);
    setSelectedTimeOffIds([]);
  }

  // ---------- AI: timesheet insight ----------
  async function handleAnomalyCheck(employeeId) {
    const anomaly = getHoursAnomaly(employeeId);
    if (!anomaly) {
      setAnomalyNotes(prev => ({ ...prev, [employeeId]: "Nothing stands out — this employee's hours look consistent with their usual pattern." }));
      return;
    }

    setAnomalyLoadingId(employeeId);
    try {
      const result = await callAI('timesheet_anomaly', {
        employeeName: getEmployeeName(employeeId),
        date: anomaly.date,
        hoursToday: anomaly.hoursToday,
        averageHours: anomaly.averageHours
      });
      setAnomalyNotes(prev => ({ ...prev, [employeeId]: result.message }));
    } catch (err) {
      setAnomalyNotes(prev => ({ ...prev, [employeeId]: "Couldn't reach the assistant just now — please try again." }));
    }
    setAnomalyLoadingId(null);
  }

  return (
    <div className={`admin-layout ${isDarkMode ? 'dark' : ''}`}>

      {/* Employee action modal */}
      {selectedEmployee && (
        <div className="admin-modal-overlay" onClick={() => setSelectedEmployee(null)}>
          <div className="admin-modal-box" onClick={e => e.stopPropagation()}>
            <button className="admin-modal-close" onClick={() => setSelectedEmployee(null)} aria-label="Close">
              <XIcon width={16} height={16} />
            </button>
            <div className="admin-modal-header">
              <div className="employee-avatar admin-modal-avatar">
                {(selectedEmployee.full_name || selectedEmployee.email)[0].toUpperCase()}
              </div>
              <div>
                <h3>{selectedEmployee.full_name || 'Unnamed employee'}</h3>
                <p>{selectedEmployee.email}</p>
              </div>
            </div>
            <div className="admin-modal-meta">
              <div className="admin-modal-dept-wrap">
                <span className="admin-modal-dept-label">Department</span>
                <span className="admin-modal-dept">
                  {selectedEmployee.department || 'No department set'}
                </span>
              </div>
              <span className={`status-badge status-${statusTone(getStatus(selectedEmployee.id))}`}>
                {statusLabel(getStatus(selectedEmployee.id))}
                {getLiveDuration(selectedEmployee.id) && (
                  <span className="status-live-timer"> · {getLiveDuration(selectedEmployee.id)}</span>
                )}
              </span>
            </div>
            <div className="admin-modal-actions">
              {['not_clocked_in', 'clocked_out', 'on_leave'].includes(getStatus(selectedEmployee.id)) && (
                <button className="admin-action-btn admin-action-in" onClick={() => handleAdminClockIn(selectedEmployee.id)}>
                  <ClockIcon width={15} height={15} /> Clock In
                </button>
              )}
              {getStatus(selectedEmployee.id) === 'clocked_in' && (
                <>
                  <button className="admin-action-btn admin-action-break" onClick={() => handleAdminStartBreak(selectedEmployee.id)}>
                    <CoffeeIcon width={15} height={15} /> Start Break
                  </button>
                  <button className="admin-action-btn admin-action-out" onClick={() => handleAdminClockOut(selectedEmployee.id)}>
                    Clock Out
                  </button>
                </>
              )}
              {getStatus(selectedEmployee.id) === 'on_break' && (
                <>
                  <button className="admin-action-btn admin-action-break" onClick={() => handleAdminEndBreak(selectedEmployee.id)}>
                    <CoffeeIcon width={15} height={15} /> End Break
                  </button>
                  <button className="admin-action-btn admin-action-out" onClick={() => handleAdminClockOut(selectedEmployee.id)}>
                    Clock Out
                  </button>
                </>
              )}
            </div>
            <p className="admin-modal-note">Hours today: {getTotalHoursToday(selectedEmployee.id)}</p>

            <div className="admin-modal-insight">
              <button
                className="admin-link-btn"
                onClick={() => handleAnomalyCheck(selectedEmployee.id)}
                disabled={anomalyLoadingId === selectedEmployee.id}>
                {anomalyLoadingId === selectedEmployee.id ? 'Checking...' : 'Get AI insight on their timesheet'}
              </button>
              {anomalyNotes[selectedEmployee.id] && (
                <p className="admin-modal-insight-text">{anomalyNotes[selectedEmployee.id]}</p>
              )}
            </div>

            <div className="admin-modal-danger">
              <button
                className="admin-link-btn"
                onClick={() => openFullDetails(selectedEmployee)}>
                View Full Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full details — edit name/department, delete account */}
      {fullDetailsEmployee && (
        <div className="admin-modal-overlay" onClick={() => setFullDetailsEmployee(null)}>
          <div className="admin-full-details-box" onClick={e => e.stopPropagation()}>
            <button className="admin-modal-close" onClick={() => setFullDetailsEmployee(null)} aria-label="Close">
              <XIcon width={16} height={16} />
            </button>

            <div className="admin-modal-header">
              <div className="employee-avatar admin-modal-avatar">
                {(fullDetailsEmployee.full_name || fullDetailsEmployee.email)[0].toUpperCase()}
              </div>
              <div>
                <h3>Full Details</h3>
                <p>{fullDetailsEmployee.email}</p>
              </div>
            </div>

            <div className="admin-full-field">
              <span className="timesheet-field-label">Full Name</span>
              <input
                className="admin-dept-input admin-full-input"
                value={fullNameDraft}
                onChange={e => setFullNameDraft(e.target.value)}
              />
            </div>

            <div className="admin-full-field">
              <span className="timesheet-field-label">Email</span>
              <p className="admin-full-readonly">{fullDetailsEmployee.email}</p>
            </div>

            <div className="admin-full-field">
              <span className="timesheet-field-label">Department</span>
              <select
                className="admin-select admin-full-input"
                value={fullDeptIsNew ? '__new__' : fullDeptDraft}
                onChange={e => {
                  if (e.target.value === '__new__') {
                    setFullDeptIsNew(true);
                    setFullDeptDraft('');
                  } else {
                    setFullDeptIsNew(false);
                    setFullDeptDraft(e.target.value);
                  }
                }}>
                {getDepartments().map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
                <option value="__new__">+ Add new department...</option>
              </select>
              {fullDeptIsNew && (
                <input
                  className="admin-dept-input admin-full-input"
                  placeholder="New department name"
                  value={fullDeptDraft}
                  onChange={e => setFullDeptDraft(e.target.value)}
                  autoFocus
                />
              )}
            </div>

            <div className="admin-full-field">
              <span className="timesheet-field-label">Status</span>
              <p>
                <span className={`status-badge status-${statusTone(getStatus(fullDetailsEmployee.id))}`}>
                  {statusLabel(getStatus(fullDetailsEmployee.id))}
                </span>
              </p>
            </div>

            {fullDetailsError && <p className="admin-confirm-error">{fullDetailsError}</p>}

            <div className="admin-full-actions">
              <button
                className="admin-action-btn admin-action-in"
                disabled={savingFullDetails}
                onClick={handleSaveFullDetails}>
                {savingFullDetails ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="admin-action-btn admin-action-break" onClick={() => setFullDetailsEmployee(null)}>
                Cancel
              </button>
            </div>

            <div className="admin-modal-danger">
              <button
                className="admin-link-btn admin-link-danger"
                onClick={() => { setFullDetailsEmployee(null); openDeleteConfirm(fullDetailsEmployee); }}>
                Delete Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation — requires the admin's password */}
      {deleteConfirmEmployee && (
        <div className="admin-modal-overlay" onClick={() => setDeleteConfirmEmployee(null)}>
          <div className="admin-confirm-box" onClick={e => e.stopPropagation()}>
            <h3>Delete {deleteConfirmEmployee.full_name || deleteConfirmEmployee.email}?</h3>
            <p className="admin-confirm-note">
              This removes their login and profile immediately. Their past clock-in and time off
              records are kept.
              {!TEST_MODE && ' Enter your admin password to confirm.'}
            </p>

            {!TEST_MODE && (
              <input
                type="password"
                className="admin-dept-input admin-confirm-input"
                placeholder="Your admin password"
                value={deleteConfirmPassword}
                onChange={e => setDeleteConfirmPassword(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && submitDeleteConfirm()}
              />
            )}

            {deleteConfirmError && <p className="admin-confirm-error">{deleteConfirmError}</p>}

            <div className="admin-confirm-actions">
              <button
                className="admin-action-btn admin-action-break"
                onClick={() => setDeleteConfirmEmployee(null)}>
                Cancel
              </button>
              <button
                className="admin-action-btn admin-action-reject"
                disabled={deletingEmployeeId === deleteConfirmEmployee.id}
                onClick={submitDeleteConfirm}>
                {deletingEmployeeId === deleteConfirmEmployee.id ? 'Deleting...' : 'Delete Employee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="admin-sidebar">
        <div className="admin-brand">
          <HourglassIcon width={20} height={20} />
          <span className="brand-name">Mmerℇ</span>
        </div>

        <div className="admin-label">Admin panel</div>

        <nav className="admin-nav">
          <button
            className={`admin-nav-item ${activeTab === 'employees' ? 'active' : ''}`}
            onClick={() => setActiveTab('employees')}>
            <UsersIcon width={17} height={17} /> Employees
          </button>
          <button
            className={`admin-nav-item ${activeTab === 'approvals' ? 'active' : ''}`}
            onClick={() => setActiveTab('approvals')}>
            <UserIcon width={17} height={17} /> Approvals
            {pendingUsers.length > 0 && (
              <span className="admin-nav-badge">{pendingUsers.length}</span>
            )}
          </button>
          <button
            className={`admin-nav-item ${activeTab === 'timesheets' ? 'active' : ''}`}
            onClick={() => setActiveTab('timesheets')}>
            <TimesheetIcon width={17} height={17} /> Timesheets
          </button>
          <button
            className={`admin-nav-item ${activeTab === 'timeoff' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeoff')}>
            <SuitcaseIcon width={17} height={17} /> Time Off
            {pendingTimeOffIds().length > 0 && (
              <span className="admin-nav-badge">{pendingTimeOffIds().length}</span>
            )}
          </button>
          <button
            className={`admin-nav-item ${activeTab === 'faq' ? 'active' : ''}`}
            onClick={() => setActiveTab('faq')}>
            <HelpIcon width={17} height={17} /> FAQ
          </button>
          <button
            className={`admin-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}>
            <SettingsIcon width={17} height={17} /> Settings
          </button>
        </nav>

        <div className="admin-user">
          <div className="admin-avatar">A</div>
          <div className="admin-info">
            <p className="admin-name">Administrator</p>
            <p className="admin-role">Admin</p>
          </div>
        </div>

        <button
          className="dark-mode-toggle admin-dark-toggle"
          onClick={() => setIsDarkMode(prev => !prev)}>
          {isDarkMode ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
          {isDarkMode ? 'Light' : 'Dark'}
        </button>

        <button className="admin-signout" onClick={onLogout}>
          <LogoutIcon width={15} height={15} /> Sign Out
        </button>
      </div>

      {/* Main Content */}
      <div className="admin-main">

        {/* ===== APPROVALS TAB ===== */}
        {activeTab === 'approvals' && (
          <>
            <div className="admin-header">
              <div>
                <h1>Sign-Up Approvals</h1>
                <p className="admin-date">Set a department and approve new accounts, or reject them</p>
              </div>
              <button className="refresh-btn" onClick={loadData}>
                <RefreshIcon width={15} height={15} /> Refresh
              </button>
            </div>

            {approvalsError && <p className="admin-confirm-error">{approvalsError}</p>}

            {loading ? (
              <div className="admin-loading">Loading pending sign-ups...</div>
            ) : pendingUsers.length === 0 ? (
              <div className="admin-empty">
                <p>No sign-ups waiting on approval.</p>
              </div>
            ) : (
              <div className="admin-table-card">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Department</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingUsers.map(pendingUser => (
                      <tr key={pendingUser.id}>
                        <td>
                          <div className="employee-name-cell">
                            <div className="employee-avatar">
                              {(pendingUser.full_name || pendingUser.email)[0].toUpperCase()}
                            </div>
                            {pendingUser.full_name || 'Unnamed'}
                          </div>
                        </td>
                        <td>{pendingUser.email}</td>
                        <td>
                          <select
                            className="admin-select admin-pending-dept-select"
                            value={pendingDeptIsNew[pendingUser.id] ? '__new__' : (pendingDeptDraft[pendingUser.id] || '')}
                            onChange={e => {
                              if (e.target.value === '__new__') {
                                setPendingDeptIsNew(prev => ({ ...prev, [pendingUser.id]: true }));
                                handlePendingDeptChange(pendingUser.id, '');
                              } else {
                                setPendingDeptIsNew(prev => ({ ...prev, [pendingUser.id]: false }));
                                handlePendingDeptChange(pendingUser.id, e.target.value);
                              }
                            }}>
                            <option value="">Select department...</option>
                            {getDepartments().map(dept => (
                              <option key={dept} value={dept}>{dept}</option>
                            ))}
                            <option value="__new__">+ Add new department...</option>
                          </select>
                          {pendingDeptIsNew[pendingUser.id] && (
                            <input
                              className="admin-dept-input admin-pending-dept-input"
                              placeholder="New department name"
                              value={pendingDeptDraft[pendingUser.id] || ''}
                              onChange={e => handlePendingDeptChange(pendingUser.id, e.target.value)}
                              autoFocus
                            />
                          )}
                        </td>
                        <td>
                          <div className="admin-table-actions">
                            <button
                              className="admin-link-btn"
                              disabled={pendingActionId === pendingUser.id || !(pendingDeptDraft[pendingUser.id] || '').trim()}
                              onClick={() => handleApprovePending(pendingUser)}
                              title={!(pendingDeptDraft[pendingUser.id] || '').trim() ? 'Set a department first' : undefined}>
                              {pendingActionId === pendingUser.id ? 'Working...' : 'Approve'}
                            </button>
                            <button
                              className="admin-link-btn admin-link-muted"
                              disabled={pendingActionId === pendingUser.id}
                              onClick={() => handleRejectPending(pendingUser)}>
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ===== EMPLOYEES TAB ===== */}
        {activeTab === 'employees' && (
          <>
            <div className="admin-header">
              <div>
                <h1>Admin Dashboard</h1>
                <p className="admin-date">{getCurrentDate()}</p>
              </div>
              <button className="refresh-btn" onClick={loadData}>
                <RefreshIcon width={15} height={15} /> Refresh
              </button>
            </div>

            {/* Stats Row */}
            <div className="admin-stats">
              <div className="admin-stat-card">
                <p className="admin-stat-label">Total Employees</p>
                <h2 className="admin-stat-value">{employees.length}</h2>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-label">Clocked In</p>
                <h2 className="admin-stat-value stat-success">{totalClockedIn}</h2>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-label">On Break</p>
                <h2 className="admin-stat-value stat-warning">{totalOnBreak}</h2>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-label">Clocked Out</p>
                <h2 className="admin-stat-value stat-neutral">{totalClockedOut}</h2>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-label">On Leave</p>
                <h2 className="admin-stat-value stat-leave">{totalOnLeave}</h2>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-label">Not Clocked In</p>
                <h2 className="admin-stat-value stat-muted">{totalNotClockedIn}</h2>
              </div>
            </div>

            {/* Filters */}
            <div className="admin-filters">
              <select
                className="admin-select"
                value={departmentFilter}
                onChange={e => setDepartmentFilter(e.target.value)}
                aria-label="Filter by department">
                <option value="all">All Departments</option>
                {getDepartments().map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <select
                className="admin-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                aria-label="Filter by status">
                <option value="all">All Statuses</option>
                <option value="clocked_in">Clocked In</option>
                <option value="on_break">On Break</option>
                <option value="clocked_out">Clocked Out</option>
                <option value="on_leave">On Leave</option>
                <option value="not_clocked_in">Not Clocked In</option>
              </select>
            </div>

            {/* Employee Table */}
            {loading ? (
              <div className="admin-loading">Loading employees...</div>
            ) : filteredEmployees().length === 0 ? (
              <div className="admin-empty">
                <p>No employees found.</p>
                <p>Try a different department or status filter.</p>
              </div>
            ) : (
              <div className="admin-table-card">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Email</th>
                      <th>Department</th>
                      <th>Status</th>
                      <th>Hours Today</th>
                      <th>Sessions Today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees().map((employee, index) => {
                      const status = getStatus(employee.id);
                      return (
                        <tr
                          key={index}
                          className="clickable-row"
                          onClick={() => setSelectedEmployee(employee)}
                          title="Click to view and manage">
                          <td>
                            <div className="employee-name-cell">
                              <div className="employee-avatar">
                                {(employee.full_name || employee.email)[0].toUpperCase()}
                              </div>
                              {employee.full_name || 'Unknown'}
                            </div>
                          </td>
                          <td>{employee.email}</td>
                          <td>
                            {employee.department || (
                              <span className="not-set">Not set</span>
                            )}
                          </td>
                          <td>
                            <span className={`status-badge status-${statusTone(status)}`}>
                              {statusLabel(status)}
                            </span>
                          </td>
                          <td className="cell-success">
                            {getTotalHoursToday(employee.id)}
                          </td>
                          <td>{getTodayRecords(employee.id).length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ===== TIMESHEETS TAB ===== */}
        {activeTab === 'timesheets' && (
          <>
            <div className="admin-header">
              <div>
                <h1>Timesheets</h1>
                <p className="admin-date">Pick an employee, browse their calendar, and approve completed months</p>
              </div>
              <button className="refresh-btn" onClick={loadData}>
                <RefreshIcon width={15} height={15} /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="admin-loading">Loading timesheets...</div>
            ) : employees.length === 0 ? (
              <div className="admin-empty">
                <p>No employees yet.</p>
              </div>
            ) : (
              <>
                <div className="timesheet-controls">
                  <select
                    className="admin-select"
                    value={timesheetEmployeeId}
                    onChange={e => { setTimesheetEmployeeId(e.target.value); setTimesheetSelectedDate(null); }}>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name || emp.email}</option>
                    ))}
                  </select>

                  <div className="timesheet-view-toggle">
                    {['daily', 'weekly', 'monthly'].map(mode => (
                      <button
                        key={mode}
                        className={`timesheet-view-btn ${timesheetViewMode === mode ? 'active' : ''}`}
                        onClick={() => selectViewMode(mode)}>
                        {mode === 'daily' ? 'Daily' : mode === 'weekly' ? 'Weekly' : 'Monthly'}
                      </button>
                    ))}
                  </div>

                  <div className="timesheet-month-nav">
                    <button className="timesheet-month-btn" onClick={() => shiftPeriod(-1)} aria-label="Previous period">‹</button>
                    <span className="timesheet-month-label">{getPeriodLabel()}</span>
                    <button className="timesheet-month-btn" onClick={() => shiftPeriod(1)} aria-label="Next period">›</button>
                  </div>
                </div>

                <div className="timesheet-approval-bar">
                  {timesheetApproval && timesheetApproval.approved ? (
                    <span className="timesheet-approval-status approved">
                      <CheckCircleIcon width={15} height={15} />
                      Approved{timesheetApproval.approved_at ? ` on ${new Date(timesheetApproval.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                    </span>
                  ) : (
                    <span className="timesheet-approval-status pending">Pending approval</span>
                  )}
                  <button
                    className={`admin-action-btn ${timesheetApproval && timesheetApproval.approved ? 'admin-action-break' : 'admin-action-in'}`}
                    disabled={approvalSaving}
                    onClick={toggleMonthApproval}>
                    {approvalSaving ? 'Saving...' : (timesheetApproval && timesheetApproval.approved ? 'Reopen Month' : 'Approve Month')}
                  </button>
                </div>

                {(() => {
                  const stats = getTimesheetStats();
                  return (
                    <div className="timesheet-period-total">
                      <span>Total: <strong>{secondsToHms(stats.seconds)}</strong></span>
                      <span className="timesheet-period-total-sep">·</span>
                      <span>{stats.count} session{stats.count === 1 ? '' : 's'}</span>
                    </div>
                  );
                })()}

                {timesheetViewMode === 'monthly' && (
                  <div className="timesheet-calendar-card">
                    <div className="timesheet-calendar-weekdays">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <span key={d}>{d}</span>
                      ))}
                    </div>
                    <div className="timesheet-calendar-grid">
                      {buildCalendarCells(timesheetMonthDate).map((day, i) => {
                        if (!day) return <div key={`blank-${i}`} className="timesheet-day-cell empty" />;
                        const dayRecords = getRecordsForDay(timesheetEmployeeId, day);
                        const hasUnauthorised = dayRecords.some(r => r.location_status === 'unauthorised');
                        const totalSecs = sumHoursSeconds(dayRecords);
                        const isSelected = isSameDay(day, timesheetSelectedDate);
                        const isToday = isSameDay(day, new Date());

                        return (
                          <button
                            key={day.toISOString()}
                            className={`timesheet-day-cell ${dayRecords.length ? 'has-records' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                            onClick={() => setTimesheetSelectedDate(day)}>
                            <span className="timesheet-day-number">{day.getDate()}</span>
                            {dayRecords.length > 0 && (
                              <span className="timesheet-day-hours">{secondsToHms(totalSecs).slice(0, 5)}</span>
                            )}
                            {hasUnauthorised && <span className="timesheet-day-flag" title="Unauthorised location" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {timesheetViewMode === 'weekly' && (() => {
                  const [weekStart] = getWeekRange(getActiveDate());
                  const weekDays = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(weekStart);
                    d.setDate(weekStart.getDate() + i);
                    return d;
                  });
                  return (
                    <div className="timesheet-week-card">
                      {weekDays.map(day => {
                        const dayRecords = getRecordsForDay(timesheetEmployeeId, day);
                        const hasUnauthorised = dayRecords.some(r => r.location_status === 'unauthorised');
                        const totalSecs = sumHoursSeconds(dayRecords);
                        const isSelected = isSameDay(day, timesheetSelectedDate);
                        const isToday = isSameDay(day, new Date());

                        return (
                          <button
                            key={day.toISOString()}
                            className={`timesheet-week-cell ${dayRecords.length ? 'has-records' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                            onClick={() => setTimesheetSelectedDate(day)}>
                            <span className="timesheet-week-dayname">{day.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                            <span className="timesheet-week-daynum">{day.getDate()}</span>
                            {dayRecords.length > 0 && (
                              <span className="timesheet-day-hours">{secondsToHms(totalSecs).slice(0, 5)}</span>
                            )}
                            {hasUnauthorised && <span className="timesheet-day-flag" title="Unauthorised location" />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {(timesheetViewMode !== 'monthly' || timesheetSelectedDate) && (
                  <div className="timesheet-day-detail">
                    <h3>
                      {getActiveDate().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </h3>
                    {getRecordsForDay(timesheetEmployeeId, getActiveDate()).length === 0 ? (
                      <p className="timesheet-day-empty">No session recorded this day.</p>
                    ) : (
                      getRecordsForDay(timesheetEmployeeId, getActiveDate()).map(record => {
                        const isEditing = editingRecordId === record.id;
                        const monthLocked = !!(timesheetApproval && timesheetApproval.approved);
                        return (
                          <div className="timesheet-day-record" key={record.id}>
                            <div className="timesheet-day-record-grid">
                              <div>
                                <span className="timesheet-field-label">Clock In</span>
                                {isEditing ? (
                                  <input className="admin-edit-input" value={editForm.clock_in} onChange={e => setEditForm({ ...editForm, clock_in: e.target.value })} />
                                ) : <p>{record.clock_in}</p>}
                              </div>
                              <div>
                                <span className="timesheet-field-label">Clock Out</span>
                                {isEditing ? (
                                  <input className="admin-edit-input" value={editForm.clock_out} onChange={e => setEditForm({ ...editForm, clock_out: e.target.value })} />
                                ) : <p>{record.clock_out}</p>}
                              </div>
                              <div>
                                <span className="timesheet-field-label">Break Time</span>
                                {isEditing ? (
                                  <input className="admin-edit-input" value={editForm.break_time} onChange={e => setEditForm({ ...editForm, break_time: e.target.value })} />
                                ) : <p className="cell-warning">{record.break_time}</p>}
                              </div>
                              <div>
                                <span className="timesheet-field-label">Hours Worked</span>
                                {isEditing ? (
                                  <input className="admin-edit-input" value={editForm.hours_worked} onChange={e => setEditForm({ ...editForm, hours_worked: e.target.value })} />
                                ) : <p className="cell-success">{record.hours_worked}</p>}
                              </div>
                              <div>
                                <span className="timesheet-field-label">Location</span>
                                <div className="location-cell">
                                  <span className={`location-tag location-tag-${record.location_status || 'unavailable'}`}>
                                    {record.location_status === 'authorised' ? 'Authorised' :
                                     record.location_status === 'unauthorised' ? 'Unauthorised' : 'N/A'}
                                  </span>
                                  {record.location_status === 'unauthorised' && (
                                    <button className="admin-link-btn" onClick={() => handleAuthoriseRecord(record.id)}>Authorise</button>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="timesheet-day-record-actions">
                              {isEditing ? (
                                <>
                                  <button className="admin-link-btn" onClick={() => saveEdit(record.id)}>Save</button>
                                  <button className="admin-link-btn admin-link-muted" onClick={cancelEdit}>Cancel</button>
                                </>
                              ) : monthLocked ? (
                                <span className="admin-link-muted">Month approved — reopen to edit</span>
                              ) : (
                                <button className="admin-link-btn" onClick={() => startEdit(record)}>Edit</button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ===== TIME OFF TAB ===== */}
        {activeTab === 'timeoff' && (
          <>
            <div className="admin-header">
              <div>
                <h1>Time Off</h1>
                <p className="admin-date">Approve or reject requests from your team</p>
              </div>
              <button className="refresh-btn" onClick={loadData}>
                <RefreshIcon width={15} height={15} /> Refresh
              </button>
            </div>

            {selectedTimeOffIds.length > 0 && (
              <div className="timeoff-bulk-bar">
                <span>{selectedTimeOffIds.length} selected</span>
                <div className="timeoff-bulk-actions">
                  <button className="admin-action-btn admin-action-in" onClick={() => handleBulkTimeOffAction('approved')} disabled={bulkProcessing}>
                    <CheckCircleIcon width={15} height={15} /> {bulkProcessing ? 'Working...' : 'Approve Selected'}
                  </button>
                  <button className="admin-action-btn admin-action-reject" onClick={() => handleBulkTimeOffAction('rejected')} disabled={bulkProcessing}>
                    <XIcon width={15} height={15} /> {bulkProcessing ? 'Working...' : 'Reject Selected'}
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="admin-loading">Loading time off requests...</div>
            ) : allTimeOff.length === 0 ? (
              <div className="admin-empty">
                <p>No time off requests yet.</p>
              </div>
            ) : (
              <div className="admin-table-card timeoff-admin-card">
                <div className="timeoff-admin-header-row">
                  <label className="timeoff-select-all">
                    <input
                      type="checkbox"
                      checked={pendingTimeOffIds().length > 0 && pendingTimeOffIds().every(id => selectedTimeOffIds.includes(id))}
                      onChange={toggleSelectAllPending}
                    />
                    Select all pending
                  </label>
                </div>
                <div className="timeoff-admin-list">
                  {allTimeOff.map((req, i) => (
                    <div className="timeoff-admin-row" key={req.id || i}>
                      <div className="timeoff-admin-checkbox">
                        <input
                          type="checkbox"
                          disabled={req.status !== 'pending'}
                          checked={selectedTimeOffIds.includes(req.id)}
                          onChange={() => toggleSelectTimeOff(req.id)}
                        />
                      </div>
                      <div className="timeoff-admin-main">
                        <p className="timeoff-history-type">
                          {getEmployeeName(req.user_id)} · {req.type}
                        </p>
                        <p className="timeoff-history-dates">
                          {formatDisplayDate(req.start_date)}
                          {req.end_date && req.end_date !== req.start_date ? ` – ${formatDisplayDate(req.end_date)}` : ''}
                        </p>
                        {req.reason && <p className="timeoff-history-reason">{req.reason}</p>}
                        {req.admin_message && (
                          <div className="timeoff-history-response">
                            <span className="timeoff-history-response-label">Admin response</span>
                            <p className="timeoff-history-response-text">{req.admin_message}</p>
                          </div>
                        )}
                      </div>
                      <span className={`holiday-tag holiday-tag-${req.status}`}>
                        {req.status === 'approved' ? 'Approved' : req.status === 'rejected' ? 'Rejected' : 'Pending'}
                      </span>
                      {req.status === 'pending' && (
                        <div className="timeoff-admin-actions">
                          {processingTimeOffId === req.id ? (
                            <span className="admin-link-muted">Working...</span>
                          ) : (
                            <>
                              <button className="admin-link-btn" onClick={() => handleTimeOffAction(req.id, 'approved')} disabled={bulkProcessing}>Approve</button>
                              <button className="admin-link-btn admin-link-muted" onClick={() => handleTimeOffAction(req.id, 'rejected')} disabled={bulkProcessing}>Reject</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== FAQ TAB ===== */}
        {activeTab === 'faq' && (
          <>
            <div className="admin-header">
              <div>
                <h1>FAQ</h1>
                <p className="admin-date">Quick answers for common questions</p>
              </div>
            </div>

            <div className="faq-list">
              {FAQ_ITEMS.map((item, i) => (
                <div className="faq-item" key={i}>
                  <button
                    className="faq-question"
                    onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}>
                    {item.q}
                    <span className="faq-toggle">{openFaqIndex === i ? '−' : '+'}</span>
                  </button>
                  {openFaqIndex === i && (
                    <p className="faq-answer">{item.a}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <>
            <div className="admin-header">
              <div>
                <h1>Settings</h1>
                <p className="admin-date">Admin-only preferences</p>
              </div>
            </div>

            <div className="reminders-list">
              <div className="reminder-item">
                <div className="reminder-icon"><PinIcon width={18} height={18} /></div>
                <div className="reminder-info">
                  <h3>Location Alerts</h3>
                  <p>Get notified whenever a clock-in happens from an unauthorised location, so it can be reviewed and authorised from the Timesheets tab.</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={adminSettings.locationAlerts}
                    onChange={toggleLocationAlerts}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export default AdminDashboard;
