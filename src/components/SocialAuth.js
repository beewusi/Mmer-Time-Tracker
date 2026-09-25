import { GoogleIcon } from '../icons';

export function AuthDivider() {
  return (
    <div className="auth-divider">
      <span>or continue with</span>
    </div>
  );
}

export function GoogleButton({ onClick, label = 'Continue with Google' }) {
  return (
    <button type="button" className="social-btn" onClick={onClick}>
      <GoogleIcon />
      <span>{label}</span>
    </button>
  );
}
