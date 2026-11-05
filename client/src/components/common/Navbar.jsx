import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { RoleBadge } from './Badge';
import { 
  QrCode, 
  LogOut, 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  AlertTriangle, 
  Calendar, 
  History,
  Scan,
  BarChart3,
  MessageSquare,
  Trophy,
  Layers
} from 'lucide-react';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Title */}
          <div className="flex items-center space-x-3">
            <Link 
              to={user.role === 'student' ? '/student' : user.role === 'admin' ? '/admin' : '/instructor'} 
              className="flex items-center space-x-2.5 group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-400 p-0.5 shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-blue-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
                    CCDI QRScan
                  </span>
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 font-semibold px-1.5 py-0.5 rounded border border-blue-500/30">
                    PRO
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  Computer Communication Development Institute
                </p>
              </div>
            </Link>
          </div>

          {/* Navigation Links based on Role */}
          <nav className="hidden md:flex items-center space-x-1">
            {user.role === 'student' && (
              <>
                <Link
                  to="/student"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/student') ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </Link>
                <Link
                  to="/student/leaderboard"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/student/leaderboard') ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Leaderboard</span>
                </Link>
                <Link
                  to="/student/scan"
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-semibold shadow-md transition-all ${
                    isActive('/student/scan') 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-500/25' 
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
                  }`}
                >
                  <Scan className="w-4 h-4 animate-pulse" />
                  <span>Scan QR Code</span>
                </Link>
              </>
            )}

            {user.role === 'instructor' && (
              <>
                <Link
                  to="/instructor"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/instructor') ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </Link>
                <Link
                  to="/instructor/sections"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/instructor/sections') ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>Sections & Subjects</span>
                </Link>
                <Link
                  to="/instructor/analytics"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname.startsWith('/instructor/analytics') ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  <span>Analytics</span>
                </Link>
                <Link
                  to="/instructor/patterns"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/instructor/patterns') ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Risk & Pattern Alerts</span>
                </Link>
              </>
            )}

            {user.role === 'admin' && (
              <>
                <Link
                  to="/admin"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/admin') ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Overview</span>
                </Link>
                <Link
                  to="/admin/users"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/admin/users') ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Users & Faculty</span>
                </Link>
                <Link
                  to="/admin/sections"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/admin/sections') ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Sections & Rosters</span>
                </Link>
                <Link
                  to="/admin/logs"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/admin/logs') ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>System Logs</span>
                </Link>

              </>
            )}
          </nav>

          {/* User Profile & Actions */}
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex flex-col items-end text-right">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-slate-200">{user?.name || 'User'}</span>
                <RoleBadge role={user?.role} />
              </div>
              <span className="text-xs text-slate-400 font-mono">{user?.id_number || user?.email || ''}</span>
            </div>

            <Link to="/profile" title="My Profile">
              <img
                src={user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.id_number || user?.email || user?.name || 'ccdi')}`}
                alt={user?.name || 'User'}
                className="w-9 h-9 rounded-xl border border-slate-700 bg-slate-800 object-cover hover:ring-2 hover:ring-blue-500/50 hover:scale-105 transition-all"
              />
            </Link>

            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
