import AnimatedHourglass from './AnimatedHourglass';
import './AuthPanel.css';

// Dark left panel for Login, SignUp and ResetPassword. Text comes in as
// children.
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
