import { useState, useEffect } from 'react';
import { supabase, ADMIN_EMAIL } from './supabase';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import ResetPassword from './pages/ResetPassword';
import PendingApproval from './pages/PendingApproval';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import { HourglassIcon } from './icons';

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('login');
  const [pendingStatus, setPendingStatus] = useState('pending');
  const [loading, setLoading] = useState(true);

  // Admin is still identified by ADMIN_EMAIL, same as before — the admin
  // account never needs to wait on its own approval. Everyone else's
  // access is gated by their profiles.status until an admin approves them.
  async function resolvePageForUser(sessionUser) {
    if (sessionUser.email === ADMIN_EMAIL) {
      return 'admin';
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', sessionUser.id)
      .maybeSingle();

    // No row yet (e.g. a brand-new Google sign-in a beat ahead of the
    // profile-creation trigger) is treated the same as "pending" — never
    // let someone straight into the dashboard when we can't confirm
    // they've been approved.
    if (error || !profile || profile.status !== 'approved') {
      setPendingStatus(profile?.status || 'pending');
      return 'pending-approval';
    }

    return 'dashboard';
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        setPage(await resolvePageForUser(session.user));
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // A real password-reset link lands here first — send the person
        // to the "set new password" screen instead of straight into the app.
        if (event === 'PASSWORD_RECOVERY') {
          setPage('reset-password');
          return;
        }
        if (session) {
          setUser(session.user);
          setPage(await resolvePageForUser(session.user));
        } else {
          setUser(null);
          setPage('login');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setPage('login');
  }

  async function handleRecheckApproval() {
    if (!user) return;
    setPage(await resolvePageForUser(user));
  }

  if (loading) {
    return (
      <div className="app-loading">
        <HourglassIcon width={28} height={28} />
        <span>Loading Mmerℇ...</span>
      </div>
    );
  }

  return (
    <>
      {page === 'signup' && (
        <SignUp onGoToLogin={() => setPage('login')} />
      )}

      {page === 'login' && (
        <Login
          onLogin={async (loggedInUser) => {
            setUser(loggedInUser);
            setPage(await resolvePageForUser(loggedInUser));
          }}
          onGoToSignUp={() => setPage('signup')}
        />
      )}

      {page === 'reset-password' && (
        <ResetPassword onGoToLogin={() => setPage('login')} />
      )}

      {page === 'pending-approval' && (
        <PendingApproval
          status={pendingStatus}
          onLogout={handleLogout}
          onRefresh={handleRecheckApproval}
        />
      )}

      {page === 'admin' && (
        <AdminDashboard
          user={user}
          onLogout={handleLogout}
        />
      )}

      {page === 'dashboard' && (
        <Dashboard
          user={user}
          onLogout={handleLogout}
        />
      )}
    </>
  );
}

export default App;
