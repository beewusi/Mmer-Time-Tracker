import { useState } from 'react';
import { supabase } from '../supabase';
import AuthPanel from '../components/AuthPanel';
import PasswordInput from '../components/PasswordInput';
import './ResetPassword.css';

// Reached via the link in a real password-reset email — Supabase fires
// a PASSWORD_RECOVERY auth event that App.js listens for.
function ResetPassword({ onGoToLogin }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (!password || !confirmPassword) {
      setError('Please fill in both fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please try again.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError('');

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Password updated successfully. You can now sign in.');
    }
  }

  return (
    <div className="reset-page">
      <AuthPanel>
        <h1 className="reset-tagline">
          Almost there.<br />Set a new password.
        </h1>
        <p className="reset-sub">
          Choose a new password for your account to get back
          to tracking your time.
        </p>
      </AuthPanel>

      <div className="auth-right">
        <div className="auth-box">
          <h2>Set new password</h2>
          <p className="auth-prompt">Make it something you'll remember</p>

          {error && <p className="form-alert">{error}</p>}
          {success && <p className="form-success">{success}</p>}

          <PasswordInput
            label="New Password"
            placeholder="Minimum 6 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <PasswordInput
            label="Confirm New Password"
            placeholder="Repeat your new password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />

          <button
            className="btn-primary"
            onClick={handleReset}
            disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>

          <p className="auth-switch-link">
            Remembered it after all?{' '}
            <span onClick={onGoToLogin}>Back to Sign In</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
