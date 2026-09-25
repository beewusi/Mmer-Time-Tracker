import AuthPanel from '../components/AuthPanel';
import { ClockIcon, XIcon } from '../icons';
import './PendingApproval.css';

// Shown when profiles.status isn't 'approved' yet (waiting for review or
// rejected).
function PendingApproval({ status, onLogout, onRefresh }) {
  const isRejected = status === 'rejected';

  return (
    <div className="pending-page">
      <AuthPanel>
        <h1 className="pending-tagline">
          {isRejected ? 'Access request declined.' : 'Almost there.'}
          <br />
          {isRejected ? 'Contact your admin.' : 'Awaiting approval.'}
        </h1>
        <p className="pending-sub">
          {isRejected
            ? "Your admin didn't approve this account. Reach out to them if you think this is a mistake."
            : "Your account has been created. An admin needs to approve it and assign your department before you can sign in."}
        </p>
      </AuthPanel>

      <div className="auth-right">
        <div className="auth-box">
          <div className={`pending-status-note ${isRejected ? 'rejected' : ''}`}>
            <div className="pending-icon-wrap">
              {isRejected ? <XIcon width={26} height={26} /> : <ClockIcon width={26} height={26} />}
            </div>
            <h2>{isRejected ? 'Account not approved' : 'Waiting on admin approval'}</h2>
            <p className="auth-prompt">
              {isRejected
                ? 'This account was reviewed and rejected. Contact your administrator for help.'
                : "You'll get access as soon as an admin reviews your sign-up and sets your department. No need to sign up again."}
            </p>
          </div>

          <button className="btn-primary" onClick={onRefresh}>
            Check again
          </button>

          <button className="btn-secondary" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default PendingApproval;
