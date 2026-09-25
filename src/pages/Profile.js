import { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabase';
import { PencilIcon } from '../icons';
import PasswordInput from '../components/PasswordInput';
import './Profile.css';

function Profile({ user, profile, onProfileUpdate, onBack, isDarkMode, avatarUrl, onAvatarChange }) {
  const [fullName, setFullName] = useState(
    profile?.full_name || user?.user_metadata?.full_name || ''
  );
  const [phone, setPhone] = useState(
    user?.user_metadata?.phone || ''
  );
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const fileInputRef = useRef(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Google-only accounts have no password yet, so nothing to check first
  const hasPassword = (user?.app_metadata?.providers || [user?.app_metadata?.provider]).includes('email');

  // profile loads async in Dashboard, sync the name in once it arrives.
  useEffect(() => {
    if (profile?.full_name && !fullName) {
      setFullName(profile.full_name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Department comes from profiles (set by the admin on approval), not
  // editable here.
  const department = profile?.department || '';

  function getFirstName() {
    return fullName.split(' ')[0] || 'User';
  }

  async function handleSave() {
    setLoading(true);
    setError('');
    setSuccess('');

    const { error: authError } = await supabase.auth.updateUser({
      data: {
        full_name: fullName,
        phone: phone
      }
    });

    // Only full_name is saved here, department is admin-only.
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id);

    if (authError || profileError) {
      setError('Failed to update profile. Please try again.');
    } else {
      setSuccess('Profile updated successfully.');
      onProfileUpdate?.();
    }
    setLoading(false);
  }

  // Current password is checked first so a laptop left signed in
  // can't be used to change it.
  async function handlePasswordChange() {
    setPasswordError('');
    setPasswordSuccess('');

    if ((hasPassword && !currentPassword) || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all the fields.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (hasPassword && newPassword === currentPassword) {
      setPasswordError('New password is the same as the current one.');
      return;
    }

    setPasswordLoading(true);

    if (hasPassword) {
      const { error: checkError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      });
      if (checkError) {
        setPasswordLoading(false);
        setPasswordError('Current password is incorrect.');
        return;
      }
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordLoading(false);

    if (updateError) {
      setPasswordError(updateError.message);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSuccess(hasPassword ? 'Password updated.' : 'Password set. You can now sign in with your email too.');
  }

  function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Please choose an image smaller than 2MB.');
      return;
    }
    setAvatarError('');

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      onAvatarChange?.(dataUrl);

      // Upload to Supabase Storage ("avatars" bucket) and save the public URL
      // on the profile.
      try {
        const filePath = `${user.id}-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase
          .storage
          .from('avatars')
          .upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase
          .storage
          .from('avatars')
          .getPublicUrl(filePath);

        await supabase.auth.updateUser({ data: { avatar_url: publicUrlData.publicUrl } });
        await supabase
          .from('profiles')
          .update({ avatar_url: publicUrlData.publicUrl })
          .eq('id', user.id);
      } catch (err) {
        setAvatarError('Could not upload your photo. Please try again.');
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className={`profile-page ${isDarkMode ? 'dark' : ''}`}>
      <div className="profile-header">
        <button className="back-btn" onClick={onBack}>
          ← Back to Dashboard
        </button>
        <h1>My Profile</h1>
      </div>

      <div className="profile-content">

        {/* Avatar Card */}
        <div className="avatar-card">
          <div className="profile-avatar-wrap">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="profile-avatar profile-avatar-img" />
            ) : (
              <div className="profile-avatar">{getFirstName()[0]}</div>
            )}
            <button
              type="button"
              className="avatar-edit-btn"
              onClick={handleAvatarClick}
              aria-label="Change profile picture">
              <PencilIcon width={14} height={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="avatar-file-input"
            />
          </div>
          {avatarError && <p className="avatar-error">{avatarError}</p>}
          <h2>{fullName || 'Your Name'}</h2>
          <p className="profile-email">{user?.email}</p>
          <p className="profile-dept">
            {department || 'No department set'}
          </p>
        </div>

        <div className="profile-cards">
        {/* Edit Form */}
        <div className="profile-form-card">
          <h3>Edit Profile</h3>

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
              value={user?.email}
              disabled
              className="input-disabled"
            />
            <p className="input-note">Your email can't be changed here.</p>
          </div>

          <div className="input-group">
            <label>Department</label>
            <input
              type="text"
              value={department || 'Not set'}
              disabled
              className="input-disabled"
            />
            <p className="input-note">Your department is set by an admin.</p>
          </div>

          <div className="input-group">
            <label>Phone Number</label>
            <input
              type="text"
              placeholder="Enter your phone number"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>

          <button
            className="save-btn"
            onClick={handleSave}
            disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Password */}
        <div className="profile-form-card">
          <h3>{hasPassword ? 'Change Password' : 'Set a Password'}</h3>

          {passwordError && <p className="form-alert">{passwordError}</p>}
          {passwordSuccess && <p className="form-success">{passwordSuccess}</p>}

          {hasPassword && (
            <PasswordInput
              id="current-password"
              label="Current Password"
              placeholder="Enter your current password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
            />
          )}

          <PasswordInput
            id="new-password"
            label="New Password"
            placeholder="Minimum 6 characters"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />

          <PasswordInput
            id="confirm-new-password"
            label="Confirm New Password"
            placeholder="Repeat your new password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />

          <button
            className="save-btn"
            onClick={handlePasswordChange}
            disabled={passwordLoading}>
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </button>
        </div>
        </div>

      </div>
    </div>
  );
}

export default Profile;
