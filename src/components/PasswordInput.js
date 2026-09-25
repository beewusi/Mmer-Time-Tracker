import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from '../icons';

function PasswordInput({ id, label, placeholder, value, onChange, onKeyDown }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="input-group">
      {label && <label htmlFor={id}>{label}</label>}
      <div className="password-field">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="password-toggle"
          tabIndex={-1}
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
        </button>
      </div>
    </div>
  );
}

export default PasswordInput;
