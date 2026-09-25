import { useState } from 'react';
import { supabase } from '../supabase';
import AuthPanel from '../components/AuthPanel';
import PasswordInput from '../components/PasswordInput';
import { AuthDivider, GoogleButton } from '../components/SocialAuth';
import './SignUp.css';

function SignUp({ onGoToLogin }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!fullName || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
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

    const { error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Profile row (status: 'pending', no department yet) is created
      // automatically by a database trigger on the new auth user — see
      // supabase/APPROVAL_MIGRATION.sql. That trigger also covers Google
      // sign-ups, which never go through this code path at all.
      setSuccess("Account created! An admin needs to approve you and set your department before you can sign in.");
      setFullName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setLoading(false);
    }
  }

  function handleGoogleSignUp() {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  }

  return (
    <div className="signup-page">
      <AuthPanel>
        <h1 className="signup-tagline">
          Join Mmerℇ.<br />Start tracking smarter today.
        </h1>
        <p className="signup-sub">
          Create your account and never miss a clock in,
          break, or clock out again.
        </p>
      </AuthPanel>

      <div className="auth-right">
        <div className="auth-box">
          <h2>Create an account</h2>
          <p className="auth-prompt">Fill in your details to get started</p>

          {error && <p className="form-alert">{error}</p>}
          {success && <p className="form-success">{success}</p>}

          <div className="input-group">
            <label>Full Name</label>
            <input
              type="text"
              placeholder="Enter your full name"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <PasswordInput
            label="Password"
            placeholder="Minimum 6 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <PasswordInput
            label="Confirm Password"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />

          <button
            className="btn-primary signup-btn"
            onClick={handleSignUp}
            disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <AuthDivider />
          <GoogleButton onClick={handleGoogleSignUp} label="Sign up with Google" />

          <p className="auth-switch-link">
            Already have an account?{' '}
            <span onClick={onGoToLogin}>Sign In</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignUp;
