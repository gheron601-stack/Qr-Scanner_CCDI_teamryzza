import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/common/Navbar';

// Pages
import { LoginPage } from './pages/LoginPage';
import { RegisterStudentPage } from './pages/RegisterStudentPage';
import { RegisterStaffPage } from './pages/RegisterStaffPage';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { StudentScanPage } from './pages/student/StudentScanPage';
import { InstructorDashboard } from './pages/instructor/InstructorDashboard';
import { LiveSessionView } from './pages/instructor/LiveSessionView';
import { SectionDetailsPage } from './pages/instructor/SectionDetailsPage';
import { PatternAlertsPage } from './pages/instructor/PatternAlertsPage';
import { ExcuseReviewPage } from './pages/instructor/ExcuseReviewPage';
import { InstructorSectionsPage } from './pages/instructor/InstructorSectionsPage';
import { AttendanceInsightsPage } from './pages/instructor/AttendanceInsightsPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { ManageUsersPage } from './pages/admin/ManageUsersPage';
import { ManageSectionsPage } from './pages/admin/ManageSectionsPage';
import { ActivePromptOverlay } from './components/student/ActivePromptOverlay';
import { BadgesPage } from './components/student/BadgesPage';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ProfilePage } from './pages/ProfilePage';

// Protected Route Wrapper
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to their respective default home
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    if (user.role === 'instructor') return <Navigate to="/instructor" replace />;
    return <Navigate to="/student" replace />;
  }

  return children;
};

export const App = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Inter',sans-serif]">
      <Navbar />
      <main className="flex-1">
        <ActivePromptOverlay />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register/student" element={<RegisterStudentPage />} />
          <Route path="/register/staff" element={<RegisterStaffPage />} />

          {/* Student Routes */}
          <Route
            path="/student"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/scan"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentScanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/badges"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <BadgesPage />
              </ProtectedRoute>
            }
          />

          {/* Instructor Routes */}
          <Route
            path="/instructor"
            element={
              <ProtectedRoute allowedRoles={['instructor', 'admin']}>
                <InstructorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/session/:id"
            element={
              <ProtectedRoute allowedRoles={['instructor', 'admin']}>
                <LiveSessionView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/section/:id"
            element={
              <ProtectedRoute allowedRoles={['instructor', 'admin']}>
                <SectionDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/sections"
            element={
              <ProtectedRoute allowedRoles={['instructor', 'admin']}>
                <InstructorSectionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/analytics"
            element={
              <ProtectedRoute allowedRoles={['instructor', 'admin']}>
                <AttendanceInsightsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/patterns"
            element={
              <ProtectedRoute allowedRoles={['instructor', 'admin']}>
                <PatternAlertsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/excuses"
            element={
              <ProtectedRoute allowedRoles={['instructor', 'admin']}>
                <ExcuseReviewPage />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ManageUsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/sections"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ManageSectionsPage />
              </ProtectedRoute>
            }
          />

          {/* Profile — all roles */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Default Redirect */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="glass-panel border-t border-slate-800/80 py-4 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>CCDI QRScan • Dynamic Anti-Proxy Attendance Management System</span>
          <span>Computer Communication Development Institute — Capstone Project 2026</span>
        </div>
      </footer>
    </div>
  );
};
export default App;
