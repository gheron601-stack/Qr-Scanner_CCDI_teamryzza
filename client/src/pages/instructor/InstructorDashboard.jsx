import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { Modal } from '../../components/common/Modal';
import { AnnouncementsWidget } from '../../components/common/AnnouncementsWidget';
import { 
  Play, 
  Tv, 
  Users, 
  MapPin, 
  Clock, 
  AlertTriangle,
  ArrowRight,
  Sparkles,
  BookOpen,
  Plus,
  GraduationCap,
  Presentation
} from 'lucide-react';

export const InstructorDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Start Session Modal state
  const [selectedSection, setSelectedSection] = useState(null);
  const [lateCutoff, setLateCutoff] = useState(15);
  const [startingSession, setStartingSession] = useState(false);

  // Assign New Class Modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [unassignedSections, setUnassignedSections] = useState([]);
  const [assigningId, setAssigningId] = useState(null);
  const [assignError, setAssignError] = useState('');

  const fetchSections = async () => {
    try {
      setLoading(true);
      const res = await api.get('/sections');
      setSections(res.data.sections || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load assigned sections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSections();
  }, []);

  const openAssignModal = async () => {
    setAssignError('');
    setShowAssignModal(true);
    try {
      // Fetch ALL sections (admin endpoint returns all; we filter unassigned client-side)
      const res = await api.get('/sections/all-unassigned');
      setUnassignedSections(res.data.sections || []);
    } catch {
      // Fallback: hit the admin sections list and filter
      try {
        const res = await api.get('/admin/sections');
        const all = res.data.sections || [];
        setUnassignedSections(all.filter(s => !s.instructor_id));
      } catch {
        setAssignError('Could not load available sections.');
      }
    }
  };

  const handleAssignSection = async (sectionId) => {
    setAssigningId(sectionId);
    setAssignError('');
    try {
      await api.patch(`/sections/${sectionId}/assign-instructor`);
      setShowAssignModal(false);
      setUnassignedSections([]);
      fetchSections(); // refresh my sections list
    } catch (err) {
      setAssignError(err.response?.data?.error || 'Failed to assign section');
    } finally {
      setAssigningId(null);
    }
  };

  const handleStartSession = async (e) => {
    e.preventDefault();
    if (!selectedSection) return;

    try {
      setStartingSession(true);
      const res = await api.post('/sessions', {
        sectionId: selectedSection.id,
        lateCutoffMinutes: parseInt(lateCutoff) || 15
      });

      const sessionId = res.data.sessionId;
      setSelectedSection(null);
      // Navigate straight to the live projector screen
      navigate(`/instructor/session/${sessionId}`);
    } catch (err) {
      if (err.response?.data?.activeSessionId) {
        // Active session already running, navigate to it
        navigate(`/instructor/session/${err.response.data.activeSessionId}`);
      } else {
        alert(err.response?.data?.error || 'Failed to start session');
      }
    } finally {
      setStartingSession(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6 animate-pulse">
        <div className="h-28 bg-slate-800/60 rounded-3xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-56 bg-slate-800/60 rounded-2xl"></div>
          <div className="h-56 bg-slate-800/60 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-blue-950/40 to-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Faculty Attendance Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Welcome, {user?.name || 'Faculty Member'}
          </h1>
          <p className="text-sm text-slate-400">
            {user?.department || 'Information Technology Department'} • Manage class sessions, launch dynamic QR codes, and monitor live scans.
          </p>
        </div>

        {/* Risk Alerts shortcut */}
        <Link
          to="/instructor/patterns"
          className="inline-flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-xs font-bold text-amber-200 bg-amber-950/60 hover:bg-amber-900/70 border border-amber-600/50 shadow-lg shadow-amber-950/40 transition-all group"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          <span>View Risk & Pattern Alerts</span>
        </Link>
      </div>

      {/* Announcements Widget */}
      <AnnouncementsWidget />

      {/* Assigned Sections Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <span>My Assigned Sections ({sections.length})</span>
          </h2>
          <button
            onClick={openAssignModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600/80 hover:bg-blue-500 border border-blue-500/40 shadow-lg shadow-blue-600/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Assign New Class
          </button>
        </div>

        {sections.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {sections.map((sec) => (
              <div 
                key={sec.id} 
                className={`glass-card p-6 rounded-2xl border transition-all flex flex-col justify-between space-y-6 ${
                  sec.active_session_id 
                    ? 'border-blue-500/50 shadow-lg shadow-blue-500/10 bg-blue-950/20' 
                    : 'border-slate-800'
                }`}
              >
                <div>
                  {/* Header with status badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {sec.name}
                      </span>
                      <h3 className="text-lg font-bold text-slate-100 mt-2">
                        {sec.subject_code} — {sec.subject_title}
                      </h3>
                    </div>

                    {sec.active_session_id ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        SESSION LIVE
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium">
                        {sec.closed_sessions_count} sessions held
                      </span>
                    )}
                  </div>

                  {/* Section details */}
                  <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span>{sec.room}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      <span>{sec.enrolled_count} Enrolled Students</span>
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{sec.schedule} • {sec.academic_term}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2.5">
                  <Link
                    to={`/instructor/section/${sec.id}`}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-indigo-300 bg-indigo-950/80 hover:bg-indigo-900/90 border border-indigo-500/40 shadow-lg shadow-indigo-950/50 transition-all hover:scale-[1.02]"
                    title="Prepare lecture slides and recap questions before class"
                  >
                    <Presentation className="w-4 h-4 text-indigo-400" />
                    <span>Prepare Lecture & PPT</span>
                  </Link>

                  {sec.active_session_id ? (
                    <Link
                      to={`/instructor/session/${sec.active_session_id}`}
                      className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-600/30 transition-all"
                    >
                      <Tv className="w-4 h-4" />
                      <span>Live Session</span>
                    </Link>
                  ) : (
                    <button
                      onClick={() => { setSelectedSection(sec); setLateCutoff(15); }}
                      className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-600/30 transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Start Session</span>
                    </button>
                  )}

                  <Link
                    to={`/instructor/section/${sec.id}`}
                    className="p-2.5 rounded-xl text-xs font-semibold text-slate-400 bg-slate-900 hover:bg-slate-800 hover:text-white border border-slate-800 transition-colors flex items-center justify-center"
                    title="View Roster, History, and Matrix"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-panel p-10 rounded-3xl border border-slate-800 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 mx-auto flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-blue-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-200">No Class Sections Assigned Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                You don't have any teaching sections assigned to your account right now. You can self-assign an unassigned class or ask an administrator to assign your sections.
              </p>
            </div>
            <button
              onClick={openAssignModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Assign My First Class</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Assign New Class Modal ─────────────────────────────────── */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => { setShowAssignModal(false); setAssignError(''); }}
        title="Assign New Class"
        subtitle="Select an unassigned section to add to your dashboard"
      >
        <div className="space-y-3">
          {assignError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">{assignError}</div>
          )}
          {unassignedSections.length === 0 && !assignError && (
            <div className="py-10 flex flex-col items-center gap-2 text-slate-400">
              <GraduationCap className="w-8 h-8 text-slate-600" />
              <p className="text-sm">No unassigned sections available.</p>
              <p className="text-xs text-slate-500">Ask an admin to create new sections.</p>
            </div>
          )}
          {unassignedSections.map(sec => (
            <div
              key={sec.id}
              className="flex items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/40 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25">{sec.name}</span>
                  <span className="text-xs text-slate-400">{sec.subject_code}</span>
                </div>
                <p className="text-sm font-semibold text-slate-200 mt-1 truncate">{sec.subject_title}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{sec.room} • {sec.schedule}</p>
              </div>
              <button
                onClick={() => handleAssignSection(sec.id)}
                disabled={assigningId === sec.id}
                className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 shadow-lg shadow-blue-600/25 transition-all"
              >
                {assigningId === sec.id ? 'Assigning…' : 'Assign'}
              </button>
            </div>
          ))}
          <div className="pt-2">
            <button
              onClick={() => { setShowAssignModal(false); setAssignError(''); }}
              className="w-full py-2.5 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Start Session Setup Modal */}
      <Modal
        isOpen={!!selectedSection}
        onClose={() => setSelectedSection(null)}
        title="Start New Class Session"
        subtitle={`Launch live rotating QR attendance for ${selectedSection?.name} (${selectedSection?.subject_code})`}
      >
        <form onSubmit={handleStartSession} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>Course:</span>
              <span className="text-slate-200 font-semibold">{selectedSection?.subject_title}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Room:</span>
              <span className="text-slate-200">{selectedSection?.room}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Expected Roster:</span>
              <span className="text-slate-200">{selectedSection?.enrolled_count} Students</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Late Cutoff Threshold (Minutes)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="120"
                value={lateCutoff}
                onChange={(e) => setLateCutoff(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-blue-500"
                required
              />
              <span className="text-xs text-slate-400 font-medium">min</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Students scanning within {lateCutoff} minutes of start will be marked <span className="text-emerald-400 font-semibold">PRESENT</span>. Scans after will be marked <span className="text-amber-400 font-semibold">LATE</span>.
            </p>
          </div>

          <div className="pt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedSection(null)}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={startingSession}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 flex items-center justify-center gap-1.5"
            >
              {startingSession ? 'Launching...' : 'Launch Projector QR'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
