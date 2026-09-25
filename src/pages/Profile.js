import { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabase';
import { PencilIcon } from '../icons';
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

  // profile loads asynchronously in Dashboard, so if this page is opened
  // before that finishes, sync the name in once it arrives.
  useEffect(() => {
    if (profile?.full_name && !fullName) {
      setFullName(profile.full_name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // profiles.department is the source of truth — an admin sets it at
  // approval time and it's never editable here.
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

    // Only full_name changes here — department is admin-owned and is
    // never sent back, so it can't get clobbered by a profile edit.
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

      // Upload to Supabase Storage and save the public URL against the
      // user's profile. Requires an "avatars" storage bucket.
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

      </div>
    </div>
  );
}

export default Profile;
