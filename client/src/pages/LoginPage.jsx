import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { QrCode, Lock, User, AlertCircle, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

export const LoginPage = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState(null);

  const { login, user } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'instructor') navigate('/instructor');
      else navigate('/student');
    }
  }, [user, navigate]);

  // Load demo accounts
  useEffect(() => {
    const fetchDemoAccounts = async () => {
      try {
        const res = await api.get('/auth/demo-accounts');
        setDemoAccounts(res.data);
      } catch (err) {
        console.error('Failed to load demo accounts', err);
      }
    };
    fetchDemoAccounts();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError('Please enter your Student ID or Email and password');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const loggedUser = await login(identifier, password);
      if (loggedUser.role === 'admin') navigate('/admin');
      else if (loggedUser.role === 'instructor') navigate('/instructor');
      else navigate('/student');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDemo = (email, pwd) => {
    setIdentifier(email);
    setPassword(pwd);
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Logo and Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 p-1 shadow-xl shadow-blue-500/25 mb-4">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <QrCode className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white font-['Outfit']">
            CCDI QRScan
          </h1>
          <p className="mt-1 text-sm text-slate-400 font-medium">
            Dynamic QR Code Attendance System
          </p>
          <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
            Computer Communication Development Institute
          </div>
        </div>

        {/* Login Card */}
        <div className="mt-8 glass-panel py-8 px-6 sm:px-10 rounded-2xl border border-slate-800 shadow-2xl relative">
          {error && (
            <div className="mb-5 flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Student ID or Institutional Email
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. 2023-00101 or prof.santos@ccdi.edu.ph"
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-600/30 transition-all transform active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Accounts Selection */}
          <div className="mt-8 pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Demo Accounts
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs">
              {/* Instructor Demo */}
              <button
                type="button"
                onClick={() => handleSelectDemo('prof.santos@ccdi.edu.ph', 'instructor123')}
                className="flex items-center justify-between p-2.5 rounded-xl bg-blue-950/40 hover:bg-blue-900/50 border border-blue-800/40 text-left transition-all group"
              >
                <div>
                  <div className="font-semibold text-blue-300 flex items-center gap-1">
                    <span>Prof. Roberto Santos</span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded">Instructor</span>
                  </div>
                  <div className="text-[11px] text-slate-400">prof.santos@ccdi.edu.ph (BSIT-3A)</div>
                </div>
                <span className="text-xs text-blue-400 group-hover:translate-x-0.5 transition-transform font-medium">Use &rarr;</span>
              </button>

              {/* Student Demo (Good) */}
              <button
                type="button"
                onClick={() => handleSelectDemo('2023-00101', 'student123')}
                className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/40 text-left transition-all group"
              >
                <div>
                  <div className="font-semibold text-emerald-300 flex items-center gap-1">
                    <span>Juan Dela Cruz</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded">Student (100% Rate)</span>
                  </div>
                  <div className="text-[11px] text-slate-400">ID: 2023-00101 (BSIT-3A)</div>
                </div>
                <span className="text-xs text-emerald-400 group-hover:translate-x-0.5 transition-transform font-medium">Use &rarr;</span>
              </button>

              {/* Student Demo (Chronic Absentee Pattern) */}
              <button
                type="button"
                onClick={() => handleSelectDemo('2023-00107', 'student123')}
                className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/40 text-left transition-all group"
              >
                <div>
                  <div className="font-semibold text-rose-300 flex items-center gap-1">
                    <span>Mark Anthony Ramos</span>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded">Student (4 of 5 Absences)</span>
                  </div>
                  <div className="text-[11px] text-slate-400">ID: 2023-00107 (Pattern Alert Demo)</div>
                </div>
                <span className="text-xs text-rose-400 group-hover:translate-x-0.5 transition-transform font-medium">Use &rarr;</span>
              </button>

              {/* Admin Demo */}
              <button
                type="button"
                onClick={() => handleSelectDemo('admin@ccdi.edu.ph', 'admin123')}
                className="flex items-center justify-between p-2.5 rounded-xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/40 text-left transition-all group"
              >
                <div>
                  <div className="font-semibold text-purple-300 flex items-center gap-1">
                    <span>Dr. Maria Victoria Cruz</span>
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded">Dean / Admin</span>
                  </div>
                  <div className="text-[11px] text-slate-400">admin@ccdi.edu.ph (College Admin)</div>
                </div>
                <span className="text-xs text-purple-400 group-hover:translate-x-0.5 transition-transform font-medium">Use &rarr;</span>
              </button>
            </div>
          </div>
        </div>

        {/* Registration Links */}
        <div className="mt-5 text-center space-y-2">
          <p className="text-xs text-slate-400">
            New student?{' '}
            <Link
              to="/register/student"
              className="font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Create a student account →
            </Link>
          </p>
          <p className="text-xs text-slate-600 hover:text-slate-500 transition-colors">
            <Link to="/register/staff" className="font-medium">
              Faculty / Staff access →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
