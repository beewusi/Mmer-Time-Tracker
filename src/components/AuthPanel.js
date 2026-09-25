import AnimatedHourglass from './AnimatedHourglass';
import './AuthPanel.css';

// The dark left-hand panel shared by Login, SignUp and ResetPassword.
// Copy (tagline/sub text) is passed in as children so each page keeps
// its own exact wording untouched.
function AuthPanel({ children }) {
  return (
    <div className="auth-panel">
      <div className="auth-panel-inner">
        <div className="auth-brand">
          <AnimatedHourglass size={44} />
          <span className="auth-brand-name">Mmerℇ</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default AuthPanel;
