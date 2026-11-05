import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import {
  Camera,
  Save,
  CheckCircle,
  AlertCircle,
  User,
  Phone,
  Mail,
  Hash,
  Building2,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

// Map role → home path
const roleHome = {
  student: '/student',
  instructor: '/instructor',
  admin: '/admin',
};

export const ProfilePage = () => {
  const { user, setUser } = useAuth();
  const fileInputRef = useRef(null);

  // Form state
  const [form, setForm] = useState({ name: '', phone: '', department: '' });
  const [avatarPreview, setAvatarPreview] = useState(null); // local preview URL

  // Status states
  const [loadError, setLoadError] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | loading | success | error
  const [saveError, setSaveError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  // ── Load fresh profile on mount ──────────────────────────────────────────────
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data } = await api.get('/profile/me');
        const u = data.user;
        setForm({
          name: u.name || '',
          phone: u.phone || '',
          department: u.department || '',
        });
        // Sync fresh data into auth context + localStorage
        const merged = { ...user, ...u };
        setUser(merged);
        localStorage.setItem('ccdi_qrscan_user', JSON.stringify(merged));
      } catch (err) {
        setLoadError('Failed to load profile. Please refresh.');
      }
    };
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive current avatar to show: local preview > context avatar > dicebear fallback
  const currentAvatar =
    avatarPreview ||
    user?.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
      user?.id_number || user?.email || user?.name || 'ccdi'
    )}`;

  const initials = (user?.name || 'U').charAt(0).toUpperCase();
  const isDataUrl = currentAvatar?.startsWith('data:') || currentAvatar?.startsWith('http');

  // ── File picker handler ──────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError('');

    // Validate type
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select an image file (JPG, PNG, GIF, WebP, etc.).');
      e.target.value = '';
      return;
    }

    // Validate size (2 MB max)
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Image must be smaller than 2 MB.');
      e.target.value = '';
      return;
    }

    // Show instant preview via FileReader
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const base64 = evt.target.result;
      setAvatarPreview(base64);

      // Upload to server
      setAvatarUploading(true);
      try {
        const { data } = await api.post('/profile/avatar', { avatar_base64: base64 });
        const merged = { ...user, avatar_url: data.avatar_url };
        setUser(merged);
        localStorage.setItem('ccdi_qrscan_user', JSON.stringify(merged));
        setAvatarPreview(null); // context will now provide the value
      } catch (err) {
        setAvatarError(
          err.response?.data?.error || 'Failed to upload avatar. Please try again.'
        );
        setAvatarPreview(null);
      } finally {
        setAvatarUploading(false);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Form change ──────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // ── Save handler ─────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');

    if (!form.name.trim()) {
      setSaveError('Full name is required.');
      return;
    }

    // Basic phone pattern
    const phonePattern = /^[\d\s+\-()\s]*$/;
    if (form.phone && !phonePattern.test(form.phone)) {
      setSaveError('Phone number contains invalid characters.');
      return;
    }

    setSaveStatus('loading');
    try {
      const { data } = await api.patch('/profile/me', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        department: form.department.trim(),
      });

      const merged = { ...user, ...data.user };
      setUser(merged);
      localStorage.setItem('ccdi_qrscan_user', JSON.stringify(merged));

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save changes. Please try again.');
      setSaveStatus('error');
    }
  };

  const homePath = roleHome[user?.role] || '/student';

  // ── Input class helpers ──────────────────────────────────────────────────────
  const inputBase =
    'w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-colors';
  const inputReadOnly = `${inputBase} opacity-50 cursor-not-allowed`;
  const labelClass = 'block text-sm font-medium text-slate-400 mb-1.5';

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="max-w-lg mx-auto">

        {/* Back button */}
        <Link
          to={homePath}
          className="inline-flex items-center space-x-2 text-slate-400 hover:text-slate-200 transition-colors mb-6 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm font-medium">Back to Dashboard</span>
        </Link>

        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100 flex items-center space-x-2">
            <User className="w-6 h-6 text-blue-400" />
            <span>My Profile</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage your account information and avatar.</p>
        </div>

        {/* Load error */}
        {loadError && (
          <div className="mb-4 flex items-center space-x-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* ── Avatar Section ─────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-2xl p-6 mb-6">
          <div className="flex flex-col items-center">
            <div className="relative mb-4">
              {/* Avatar button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="relative group cursor-pointer rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
                title="Change photo"
              >
                {/* Avatar image or initials */}
                {isDataUrl ? (
                  <img
                    src={currentAvatar}
                    alt={user?.name || 'Avatar'}
                    className="w-24 h-24 object-cover rounded-2xl"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">{initials}</span>
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-slate-900/70 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                  {avatarUploading ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-5 h-5 text-white mb-1" />
                      <span className="text-white text-xs font-medium">Change photo</span>
                    </>
                  )}
                </div>
              </button>

              {/* Hidden file input */}
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Name + role under avatar */}
            <p className="text-slate-100 font-semibold text-lg">{user?.name || '—'}</p>
            <p className="text-slate-400 text-sm capitalize">{user?.role}</p>

            {/* Avatar error */}
            {avatarError && (
              <div className="mt-3 flex items-center space-x-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{avatarError}</span>
              </div>
            )}

            <p className="text-slate-500 text-xs mt-2">JPG, PNG, GIF or WebP · Max 2 MB</p>
          </div>
        </div>

        {/* ── Info Form ──────────────────────────────────────────────────────── */}
        <form onSubmit={handleSave}>
          <div className="glass-card rounded-2xl p-6 space-y-5">
            <h2 className="text-base font-semibold text-slate-200 border-b border-slate-700/60 pb-3">
              Account Information
            </h2>

            {/* Full Name */}
            <div>
              <label className={labelClass} htmlFor="name">
                <span className="flex items-center space-x-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>Full Name</span>
                </span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={form.name}
                onChange={handleChange}
                placeholder="Your full name"
                className={inputBase}
              />
            </div>

            {/* Phone */}
            <div>
              <label className={labelClass} htmlFor="phone">
                <span className="flex items-center space-x-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  <span>Phone Number</span>
                  <span className="text-slate-600 font-normal">(optional)</span>
                </span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="+63 912 345 6789"
                pattern="^[\d\s+\-()\s]*$"
                className={inputBase}
              />
            </div>

            {/* Department */}
            <div>
              <label className={labelClass} htmlFor="department">
                <span className="flex items-center space-x-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Department</span>
                </span>
              </label>
              <input
                id="department"
                name="department"
                type="text"
                value={form.department}
                onChange={handleChange}
                placeholder="e.g. Computer Science"
                className={inputBase}
              />
            </div>

            {/* Email — read only */}
            <div>
              <label className={labelClass} htmlFor="email">
                <span className="flex items-center space-x-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email</span>
                  <span className="text-slate-600 font-normal">(read-only)</span>
                </span>
              </label>
              <input
                id="email"
                type="email"
                value={user?.email || ''}
                readOnly
                tabIndex={-1}
                className={inputReadOnly}
              />
            </div>

            {/* ID Number — read only */}
            <div>
              <label className={labelClass} htmlFor="id_number">
                <span className="flex items-center space-x-1.5">
                  <Hash className="w-3.5 h-3.5" />
                  <span>ID Number</span>
                  <span className="text-slate-600 font-normal">(read-only)</span>
                </span>
              </label>
              <input
                id="id_number"
                type="text"
                value={user?.id_number || ''}
                readOnly
                tabIndex={-1}
                className={inputReadOnly}
              />
            </div>

            {/* Save error */}
            {saveStatus === 'error' && saveError && (
              <div className="flex items-center space-x-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            {/* Save button */}
            <button
              type="submit"
              disabled={saveStatus === 'loading' || avatarUploading}
              className={`w-full py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center space-x-2 ${
                saveStatus === 'success'
                  ? 'bg-emerald-600 text-white'
                  : saveStatus === 'error'
                  ? 'bg-rose-600 text-white hover:bg-rose-500'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed'
              }`}
            >
              {saveStatus === 'loading' && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving…</span>
                </>
              )}
              {saveStatus === 'success' && (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Saved!</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>Try Again</span>
                </>
              )}
              {saveStatus === 'idle' && (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfilePage;
