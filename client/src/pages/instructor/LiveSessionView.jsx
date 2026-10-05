import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import api from '../../api/axios';
import { StatusBadge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { 
  Tv, 
  RotateCw, 
  Users, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  FileSpreadsheet, 
  Lock, 
  ShieldAlert, 
  Search, 
  Edit3, 
  History, 
  Sparkles,
  ArrowLeft,
  Zap,
  BarChart3,
  Presentation,
  Upload,
  Loader2,
  Radio,
  MonitorPlay,
  ChevronLeft,
  ChevronRight,
  QrCode
} from 'lucide-react';

export const LiveSessionView = () => {
  const { id: sessionId } = useParams();
  const navigate = useNavigate();
  const { socket, joinSession, leaveSession, promptLeaderboard } = useSocket();

  const [sessionData, setSessionData] = useState(null);
  const [tokenData, setTokenData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Countdown timer for 30s rotation
  const [timeLeft, setTimeLeft] = useState(30);
  const [isRotating, setIsRotating] = useState(false);
  const [promptTimeLeft, setPromptTimeLeft] = useState(0);

  // Audio chime & UI controls
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Manual Override Modal
  const [overrideStudent, setOverrideStudent] = useState(null);
  const [overrideStatus, setOverrideStatus] = useState('present');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  // Close Session Confirmation Modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closingSession, setClosingSession] = useState(false);

  // Live incoming scan activity stream (latest 6 scans)
  const [recentScans, setRecentScans] = useState([]);

  // Active Presence Pop-Quiz (Quick Recap)
  const [showPromptModal, setShowPromptModal] = useState(false);
  const defaultQuestion = () => ({ id: Math.random().toString(), question_text: '', image_url: '', options: [{id:'A', text:''}, {id:'B', text:''}, {id:'C', text:''}, {id:'D', text:''}], correct_option: 'A', time_limit_seconds: 20 });
  const [promptDeck, setPromptDeck] = useState([defaultQuestion()]);
  const [activeDeckQueue, setActiveDeckQueue] = useState([]);
  const [activePrompt, setActivePrompt] = useState(null);
  const [promptStats, setPromptStats] = useState(null); // { answeredCount, totalPresent, distribution: {...} }

  // PPT Presentation & Prepared Recap State
  const [presentation, setPresentation] = useState(null);
  const [presentationSlides, setPresentationSlides] = useState([]);
  const [isSlideProjectorActive, setIsSlideProjectorActive] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [draftsCount, setDraftsCount] = useState(0);
  const [showPptModal, setShowPptModal] = useState(false);
  const [showAdvanceRecapModal, setShowAdvanceRecapModal] = useState(false);
  const [uploadingPpt, setUploadingPpt] = useState(false);
  const [pptUploadError, setPptUploadError] = useState('');
  const [savingDrafts, setSavingDrafts] = useState(false);
  const [openingPowerPoint, setOpeningPowerPoint] = useState(false);
  const [powerPointActiveBanner, setPowerPointActiveBanner] = useState(false);
  const pptFileInputRef = useRef(null);

  // Fullscreen container ref
  const containerRef = useRef(null);

  // Keyboard navigation for slide projector mode
  useEffect(() => {
    if (!isSlideProjectorActive || presentationSlides.length === 0) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setCurrentSlideIndex((prev) => Math.min(presentationSlides.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSlideProjectorActive, presentationSlides.length]);

  // Fetch initial session state
  const fetchSession = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/sessions/${sessionId}`);
      setSessionData(res.data);

      if (res.data.session.status === 'active') {
        // Fetch or rotate initial token
        const tokenRes = await api.get(`/sessions/${sessionId}/rotate-token`);
        setTokenData(tokenRes.data);
        setTimeLeft(30);
      }

      // Fetch prepared drafts and presentation if any
      try {
        const draftsRes = await api.get(`/prompts/session/${sessionId}/drafts`);
        if (draftsRes.data?.drafts?.length > 0) {
          setPromptDeck(draftsRes.data.drafts);
          setDraftsCount(draftsRes.data.drafts.length);
        }
        if (draftsRes.data?.presentation) {
          setPresentation(draftsRes.data.presentation);
        }
        if (draftsRes.data?.slides?.length > 0) {
          setPresentationSlides(draftsRes.data.slides);
        }
      } catch (e) {
        console.warn('Could not load drafts:', e.message);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load class session');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  // Join Socket.io session room & listen to real-time events
  useEffect(() => {
    if (!sessionId) return;
    joinSession(sessionId);

    if (socket) {
      // 1. QR Code rotated
      socket.on('qr_rotated', (newToken) => {
        setTokenData(newToken);
        setTimeLeft(30);
        setIsRotating(false);
      });

      // 2. Student scanned in real-time
      socket.on('student_scanned', (event) => {
        // Play scan chime
        if (soundEnabled) {
          playScanSound();
        }

        // Add to recent live scan feed
        setRecentScans((prev) => [event, ...prev.slice(0, 7)]);

        // Update roster status and stats
        setSessionData((prev) => {
          if (!prev) return prev;
          const updatedRoster = prev.roster.map((stu) => {
            if (stu.id === event.student.id) {
              return {
                ...stu,
                status: event.status,
                scanned_at: event.scannedAt,
                method: event.method
              };
            }
            return stu;
          });

          return {
            ...prev,
            roster: updatedRoster,
            stats: event.stats
          };
        });
      });

      // 3. Manual override updated
      socket.on('manual_override_updated', (event) => {
        setSessionData((prev) => {
          if (!prev) return prev;
          const updatedRoster = prev.roster.map((stu) => {
            if (stu.id === event.studentId) {
              return {
                ...stu,
                status: event.newStatus,
                method: 'manual_override'
              };
            }
            return stu;
          });

          return {
            ...prev,
            roster: updatedRoster,
            stats: event.stats,
            auditLogs: [
              {
                id: Math.random().toString(),
                student_name: event.studentName,
                new_status: event.newStatus,
                previous_status: event.previousStatus,
                reason: event.reason,
                changed_by_name: event.changedByName,
                timestamp: event.timestamp
              },
              ...(prev.auditLogs || [])
            ]
          };
        });
      });

      // 4. Session finalized and closed
      socket.on('session_closed', (event) => {
        setSessionData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            session: { ...prev.session, status: 'closed' },
            stats: event.stats
          };
        });
        setTokenData(null);
      });

      // 5. Active Prompt (Quick Recap) Updates
      socket.on('prompt:update', (data) => {
        setPromptStats((prev) => ({ ...prev, ...data }));
      });
      socket.on('prompt:reveal', (data) => {
        setPromptStats((prev) => ({ ...prev, distribution: data.stats, correctOption: data.correctOption }));
        // Play reveal sound
        if (soundEnabled) {
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
            osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.2);
            osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.4);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 1);
          } catch(e) {}
        }
      });

      // 6. When all questions done, leaderboard fires => clear recap panel
      socket.on('prompt:leaderboard', () => {
        setActivePrompt(null);
        setPromptStats(null);
      });
    }

    return () => {
      leaveSession(sessionId);
      if (socket) {
        socket.off('qr_rotated');
        socket.off('student_scanned');
        socket.off('manual_override_updated');
        socket.off('session_closed');
        socket.off('prompt:update');
        socket.off('prompt:reveal');
        socket.off('prompt:leaderboard');
      }
    };
  }, [sessionId, socket, joinSession, leaveSession, soundEnabled]);

  // 30-Second Rotation Interval Timer
  useEffect(() => {
    if (!sessionData || sessionData.session?.status !== 'active') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Trigger token rotation
          handleRotateToken();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionData, sessionId]);

  // Prompt Timer & Auto-Termination
  useEffect(() => {
    if (!activePrompt || promptStats?.correctOption) return;

    const interval = setInterval(() => {
      const left = Math.max(0, Math.ceil((activePrompt.end_time - Date.now()) / 1000));
      setPromptTimeLeft(left);
      
      if (left <= 0) {
        handleEndPromptEarly();
        clearInterval(interval);
      }
    }, 1000);

    setPromptTimeLeft(Math.max(0, Math.ceil((activePrompt.end_time - Date.now()) / 1000)));

    return () => clearInterval(interval);
  }, [activePrompt, promptStats?.correctOption]);

  const handleRotateToken = async () => {
    try {
      setIsRotating(true);
      const res = await api.get(`/sessions/${sessionId}/rotate-token`);
      setTokenData(res.data);
      setTimeLeft(30);
    } catch (err) {
      console.error('Failed to rotate token', err);
    } finally {
      setIsRotating(false);
    }
  };

  const playScanSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // Ignore
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const handleManualOverrideSubmit = async (e) => {
    e.preventDefault();
    if (!overrideStudent || !overrideReason) {
      alert('Please provide a reason for the manual attendance override');
      return;
    }

    try {
      setOverrideSubmitting(true);
      await api.post(`/sessions/${sessionId}/manual-override`, {
        studentId: overrideStudent.id,
        newStatus: overrideStatus,
        reason: overrideReason
      });
      setOverrideStudent(null);
      setOverrideReason('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update student status');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleCloseSession = async () => {
    try {
      setClosingSession(true);
      await api.post(`/sessions/${sessionId}/close`);
      setShowCloseModal(false);
      fetchSession();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to close session');
    } finally {
      setClosingSession(false);
    }
  };

  const downloadSessionCSV = () => {
    window.open(`/api/sessions/${sessionId}/export-csv`, '_blank');
  };

  const handleLaunchPrompt = async (e) => {
    e.preventDefault();
    if (promptDeck.length === 0) return;
    
    // Play start sound
    if (soundEnabled) {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      } catch(e) {}
    }

    const firstQ = promptDeck[0];
    const groupId = Math.random().toString(36).substring(7);
    const isLast = promptDeck.length === 1;

    try {
      const res = await api.post(`/prompts/session/${sessionId}/launch`, { 
        ...firstQ, 
        group_id: groupId,
        is_last: isLast
      });
      setActivePrompt({
        ...firstQ,
        id: res.data.promptId,
        end_time: Date.now() + (firstQ.time_limit_seconds * 1000),
        is_last: isLast
      });
      setPromptStats({ answeredCount: 0, totalPresent: (sessionData.stats?.present || 0) + (sessionData.stats?.late || 0) });
      setActiveDeckQueue(promptDeck.slice(1).map(q => ({ ...q, group_id: groupId })));
      setShowPromptModal(false);
      setShowAdvanceRecapModal(false);
      setDraftsCount(0);
      // Reset prompt deck for next time
      setPromptDeck([defaultQuestion()]);
    } catch (err) {
      console.error('Failed to launch prompt', err);
      alert('Failed to launch recap quiz.');
    }
  };

  const handleNextPrompt = async () => {
    if (activeDeckQueue.length === 0) {
       setActivePrompt(null);
       setPromptStats(null);
       return;
    }
    
    if (soundEnabled) {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      } catch(e) {}
    }

    const nextQ = activeDeckQueue[0];
    const isLast = activeDeckQueue.length === 1; // this next question is the final one
    try {
      const res = await api.post(`/prompts/session/${sessionId}/launch`, { ...nextQ, is_last: isLast });
      setActivePrompt({
        ...nextQ,
        id: res.data.promptId,
        end_time: Date.now() + (nextQ.time_limit_seconds * 1000),
        is_last: isLast
      });
      setPromptStats({ answeredCount: 0, totalPresent: (sessionData.stats?.present || 0) + (sessionData.stats?.late || 0) });
      setActiveDeckQueue(prev => prev.slice(1));
    } catch (err) {
      console.error('Failed to launch prompt', err);
      alert('Failed to launch next question.');
    }
  };

  const handleEndPromptEarly = async () => {
    if (!activePrompt) return;
    try {
      await api.post(`/prompts/session/${sessionId}/prompt/${activePrompt.id}/close`, {
        is_last: activePrompt.is_last || activeDeckQueue.length === 0
      });
    } catch (err) {
      console.error('Failed to end prompt early', err);
      alert('Failed to end prompt early.');
    }
  };

  const handleImageUpload = (e, index) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
       const newDeck = [...promptDeck];
       newDeck[index].image_url = reader.result;
       setPromptDeck(newDeck);
    };
    reader.readAsDataURL(file);
  };

  const handlePptFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingPpt(true);
      setPptUploadError('');
      const formData = new FormData();
      formData.append('presentation', file);

      const res = await api.post(`/prompts/session/${sessionId}/presentation`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setPresentation(res.data.presentation);
      if (res.data.slides?.length > 0) {
        setPresentationSlides(res.data.slides);
      }
      setShowPptModal(false);

      if (res.data.suggestedQuestions?.length > 0) {
        const formatted = res.data.suggestedQuestions.map(q => ({
          ...q,
          id: Math.random().toString()
        }));
        setPromptDeck(formatted);
      }

      // Automatically open the advance recap question builder modal!
      setShowAdvanceRecapModal(true);
    } catch (err) {
      console.error('PPT Upload failed', err);
      setPptUploadError(err.response?.data?.error || 'Failed to upload presentation.');
    } finally {
      setUploadingPpt(false);
      if (pptFileInputRef.current) pptFileInputRef.current.value = '';
    }
  };

  const handleOpenPowerPoint = async () => {
    try {
      setOpeningPowerPoint(true);
      await api.post('/prompts/launch-powerpoint');
      setPowerPointActiveBanner(true);
      setTimeout(() => setPowerPointActiveBanner(false), 14000);
    } catch (err) {
      console.warn('Backend launch error, attempting client protocol fallback:', err);
      try {
        window.location.href = 'ms-powerpoint:';
      } catch (e) {}
      setPowerPointActiveBanner(true);
      setTimeout(() => setPowerPointActiveBanner(false), 14000);
    } finally {
      setOpeningPowerPoint(false);
    }
  };

  const handleSaveDrafts = async () => {
    try {
      setSavingDrafts(true);
      await api.post(`/prompts/session/${sessionId}/drafts`, { questions: promptDeck });
      setDraftsCount(promptDeck.length);
      setShowAdvanceRecapModal(false);
      setShowPromptModal(false);
      alert(`✅ ${promptDeck.length} Quick Recap question(s) saved in advance! You can launch them at the end of class.`);
    } catch (err) {
      console.error('Failed to save draft prompts', err);
      alert('Failed to save recap questions.');
    } finally {
      setSavingDrafts(false);
    }
  };

  const handleOpenRecapModal = async () => {
    try {
      const draftsRes = await api.get(`/prompts/session/${sessionId}/drafts`);
      if (draftsRes.data?.drafts?.length > 0) {
        setPromptDeck(draftsRes.data.drafts);
        setDraftsCount(draftsRes.data.drafts.length);
      }
      if (draftsRes.data?.presentation) {
        setPresentation(draftsRes.data.presentation);
      }
      if (draftsRes.data?.slides?.length > 0) {
        setPresentationSlides(draftsRes.data.slides);
      }
    } catch (e) {
      console.warn('Could not refresh drafts:', e.message);
    }
    setShowPromptModal(true);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-slate-400">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p>Loading active class session projector screen...</p>
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Session Error</h2>
        <p className="text-xs text-slate-400">{error || 'Session not found'}</p>
        <Link to="/instructor" className="inline-block px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600">
          Back to Sections
        </Link>
      </div>
    );
  }

  const { session, roster, stats, auditLogs } = sessionData;
  const isActive = session.status === 'active';

  // Filter roster
  const filteredRoster = (roster || []).filter((stu) => {
    const matchesSearch = stu.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          stu.id_number.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    const currentStatus = (stu.status || (isActive ? 'pending' : 'absent')).toUpperCase();
    return currentStatus === statusFilter;
  });

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Link
            to={`/instructor/section/${session.section_id}`}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {session.section_name}
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                {session.subject_code} — {session.subject_title}
              </h1>
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  LIVE SESSION
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                  SESSION CLOSED
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Room: <span className="text-slate-200 font-semibold">{session.room}</span> • Started at: <span className="text-slate-200">{session.start_time}</span> • Late Cutoff: <span className="text-amber-300 font-semibold">{session.late_cutoff_minutes} min</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              soundEnabled ? 'bg-blue-950/60 border-blue-700/60 text-blue-300' : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
            title="Toggle Scan Sound Chime"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Toggle Fullscreen Projector Mode"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Projector View'}</span>
          </button>

          {/* Option to Open PowerPoint and Project Presentation */}
          <button
            onClick={handleOpenPowerPoint}
            disabled={openingPowerPoint}
            className="p-2.5 rounded-xl border border-purple-500/50 bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-purple-950/90 hover:from-purple-800 hover:to-indigo-800 text-purple-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-purple-950/50 ring-1 ring-purple-400/30 hover:ring-purple-400/60"
            title="Open Microsoft PowerPoint to choose and present your topic"
          >
            {openingPowerPoint ? (
              <Loader2 className="w-4 h-4 text-purple-300 animate-spin" />
            ) : (
              <MonitorPlay className="w-4 h-4 text-purple-300" />
            )}
            <span>{openingPowerPoint ? 'Opening PowerPoint...' : 'Project PPT'}</span>
            <span className="px-1.5 py-0.5 rounded-md bg-purple-950 text-purple-200 text-[10px] font-mono border border-purple-400/40">
              PowerPoint
            </span>
          </button>

          {/* Connect / Upload PPT Presentation */}
          <button
            onClick={() => setShowPptModal(true)}
            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              presentation 
                ? 'bg-indigo-950/70 border-indigo-500/50 text-indigo-300 hover:bg-indigo-900/60'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
            }`}
            title="Connect PowerPoint presentation & prepare Quick Recap questions"
          >
            <Presentation className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">
              {presentation ? `PPT: ${presentation.filename}` : 'Connect PPT'}
            </span>
            <span className="sm:hidden">PPT</span>
          </button>

          {isActive && (
            <button
              onClick={handleOpenRecapModal}
              className="p-2.5 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-slate-900 text-xs font-extrabold flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-900/20 relative"
            >
              <Zap className="w-4 h-4" />
              <span>Quick Recap</span>
              {draftsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-slate-950 text-amber-400 rounded-full text-[10px] font-black border border-amber-400/40">
                  {draftsCount} Ready
                </span>
              )}
            </button>
          )}

          <button
            onClick={downloadSessionCSV}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          {isActive && (
            <button
              onClick={() => setShowCloseModal(true)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white text-xs font-bold shadow-lg shadow-rose-900/30 flex items-center gap-1.5"
            >
              <Lock className="w-4 h-4" />
              <span>Finalize & Close</span>
            </button>
          )}
        </div>
      </div>

      {/* PowerPoint Redirection Active Banner */}
      {powerPointActiveBanner && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/90 via-indigo-950/80 to-slate-900 border border-purple-500/50 flex items-center justify-between gap-4 shadow-xl animate-in fade-in duration-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0">
              <MonitorPlay className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-white">PowerPoint Opened</h4>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/40">
                  READY
                </span>
              </div>
              <p className="text-xs text-purple-200/80 mt-0.5 truncate">
                Microsoft PowerPoint has opened. You can choose any presentation or topic you want to present there. (Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-white">Alt+Tab</kbd> anytime to return to this attendance session window).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenPowerPoint}
              disabled={openingPowerPoint}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow"
              title="Open PowerPoint again"
            >
              {openingPowerPoint ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
              <span>Re-open</span>
            </button>
            <button
              onClick={() => setPowerPointActiveBanner(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Dismiss notification"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Projector QR Centerpiece OR Slide Projector + Live Activity HUD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Rotating Dynamic QR Code OR Classroom PPT Slide Projector */}
        <div className={`${isSlideProjectorActive ? 'lg:col-span-8' : 'lg:col-span-5'} flex flex-col items-center justify-center glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 relative shadow-2xl transition-all duration-300`}>
          {isActive && activePrompt ? (
            <div className="w-full flex flex-col items-center space-y-6 animate-in fade-in zoom-in duration-500">
              <div className="w-full bg-slate-900 rounded-2xl p-6 border-2 border-amber-500/50 relative overflow-hidden shadow-[0_0_40px_-10px_rgba(245,158,11,0.3)]">
                <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
                  <div 
                    className="h-full bg-amber-400 transition-all duration-1000 ease-linear"
                    style={{ width: `${Math.max(0, ((activePrompt.end_time - Date.now()) / (activePrompt.time_limit_seconds * 1000)) * 100)}%` }}
                  ></div>
                </div>
                
                <div className="flex justify-between items-center mb-4">
                  <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs font-bold flex items-center gap-1.5">
                    <Zap className="w-4 h-4" /> LIVE RECAP
                  </span>
                  <span className="text-xl font-mono font-bold text-slate-300">
                    {promptTimeLeft}s
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-white text-center mb-6 leading-relaxed">
                  {activePrompt.question_text}
                </h3>
                {activePrompt.image_url && (
                  <img src={activePrompt.image_url} alt="Question Context" className="max-h-48 rounded-xl mx-auto mb-6 object-contain shadow-lg" />
                )}

                {promptStats?.correctOption ? (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-400 text-center mb-2">Results</h4>
                    {activePrompt.options.map((opt) => {
                      const count = promptStats.distribution?.[opt.id] || 0;
                      const total = promptStats.answeredCount || 1;
                      const pct = Math.round((count / total) * 100);
                      const isCorrect = opt.id === promptStats.correctOption;
                      
                      return (
                        <div key={opt.id} className={`relative p-3 rounded-xl border ${isCorrect ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/50'} flex justify-between items-center z-10 overflow-hidden`}>
                          <div className={`absolute top-0 left-0 h-full ${isCorrect ? 'bg-emerald-500/20' : 'bg-slate-800/50'} -z-10 transition-all duration-1000`} style={{ width: `${pct}%` }}></div>
                          <span className={`font-semibold ${isCorrect ? 'text-emerald-400' : 'text-slate-300'}`}>{opt.id}: {opt.text}</span>
                          <span className="text-sm font-mono text-slate-400">{count} ({pct}%)</span>
                          {isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                        </div>
                      )
                    })}
                    <button onClick={handleNextPrompt} className="w-full mt-4 py-3 bg-amber-500 hover:bg-amber-400 rounded-xl text-slate-900 font-bold transition-colors shadow-lg shadow-amber-900/40">
                      {activeDeckQueue.length > 0 ? `Next Question (${activeDeckQueue.length} left)` : "Finish Recap"}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {activePrompt.options.map((opt, i) => {
                      const colors = ['bg-rose-600', 'bg-blue-600', 'bg-amber-500', 'bg-emerald-600'];
                      return (
                        <div key={opt.id} className={`${colors[i % 4]} rounded-xl p-4 flex flex-col items-center justify-center min-h-[100px] text-center shadow-lg`}>
                          <span className="text-white/70 text-sm font-bold mb-1">{opt.id}</span>
                          <span className="text-white font-bold text-sm sm:text-base leading-tight drop-shadow-md">{opt.text}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {!promptStats?.correctOption && (
                <div className="flex flex-col items-center gap-4 mt-4 w-full px-6">
                  <div className="flex items-center gap-3 px-6 py-3 bg-slate-900 rounded-full border border-slate-800">
                    <Users className="w-5 h-5 text-blue-400" />
                    <span className="font-semibold text-slate-300">
                      <span className="text-white text-lg">{promptStats?.answeredCount || 0}</span> / {promptStats?.totalPresent || 0} Answered
                    </span>
                  </div>
                  <button onClick={handleEndPromptEarly} className="py-2 px-6 bg-rose-600 hover:bg-rose-500 rounded-xl text-white text-sm font-bold transition-colors shadow-lg shadow-rose-900/40">
                    End Question Early
                  </button>
                </div>
              )}
            </div>
          ) : isActive && isSlideProjectorActive && presentationSlides.length > 0 ? (
            /* Slide Projector Mode for Classroom Projection */
            <div className="w-full flex flex-col space-y-4 animate-in fade-in duration-300">
              {/* Slide Projection Stage Bar */}
              <div className="flex items-center justify-between flex-wrap gap-2 px-3.5 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-purple-950 border border-purple-500/40 text-purple-300 text-xs font-mono font-bold flex items-center gap-1.5">
                    <MonitorPlay className="w-3.5 h-3.5 text-purple-400" />
                    Slide {currentSlideIndex + 1} of {presentationSlides.length}
                  </span>
                  <span className="text-xs text-slate-400 font-medium truncate max-w-[200px]" title={presentation?.filename}>
                    {presentation?.filename}
                  </span>
                </div>

                {/* Slide Nav Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentSlideIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentSlideIndex === 0}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 transition-colors"
                    title="Previous Slide (← Left Arrow)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <select
                    value={currentSlideIndex}
                    onChange={(e) => setCurrentSlideIndex(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:ring-1 focus:ring-purple-500 font-mono"
                  >
                    {presentationSlides.map((s, idx) => (
                      <option key={idx} value={idx}>
                        Slide {idx + 1}: {s.title ? s.title.slice(0, 30) : `Slide ${idx + 1}`}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => setCurrentSlideIndex(prev => Math.min(presentationSlides.length - 1, prev + 1))}
                    disabled={currentSlideIndex === presentationSlides.length - 1}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 transition-colors"
                    title="Next Slide (→ Right Arrow)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setIsSlideProjectorActive(false)}
                    className="ml-2 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-colors"
                    title="Return to large attendance QR code centerpiece"
                  >
                    <QrCode className="w-3.5 h-3.5 text-blue-400" />
                    <span className="hidden sm:inline">Show Large QR</span>
                  </button>
                </div>
              </div>

              {/* Main Slide Canvas */}
              <div className="relative w-full min-h-[380px] sm:min-h-[440px] rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 border-2 border-purple-500/30 p-6 sm:p-8 flex flex-col justify-between shadow-2xl overflow-hidden">
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

                {/* Slide Header & Title */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] font-mono uppercase tracking-widest text-purple-400 font-bold flex items-center gap-1.5">
                      <Presentation className="w-3.5 h-3.5" /> Classroom Lecture Slide
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                      Use keyboard ← / → to change slides
                    </span>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight mb-6">
                    {presentationSlides[currentSlideIndex]?.title || `Slide ${currentSlideIndex + 1}`}
                  </h2>

                  {/* Slide Bullet Points or Body Text */}
                  {presentationSlides[currentSlideIndex]?.bullets && presentationSlides[currentSlideIndex]?.bullets.length > 0 ? (
                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                      {presentationSlides[currentSlideIndex].bullets.map((bullet, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200 text-sm sm:text-base leading-relaxed hover:border-purple-500/40 transition-colors shadow-sm"
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-purple-400 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                          <span className="font-normal">{bullet}</span>
                        </div>
                      ))}
                    </div>
                  ) : presentationSlides[currentSlideIndex]?.rawText ? (
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 text-sm sm:text-base leading-relaxed max-h-[250px] overflow-y-auto custom-scrollbar">
                      {presentationSlides[currentSlideIndex].rawText}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-slate-500 text-sm">
                      (No additional text extracted on this slide)
                    </div>
                  )}
                </div>

                {/* Floating PiP Mini Attendance QR */}
                {tokenData && (
                  <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <div className="relative p-1.5 rounded-xl bg-white shadow-lg shrink-0">
                        <img
                          src={tokenData.qrDataUrl}
                          alt="Live Attendance QR"
                          className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span>Live Attendance Check-in</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-amber-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                            Rotates: {timeLeft}s
                          </span>
                          <span className="text-[11px] font-mono text-blue-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                            Code: {tokenData.backupCode}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Students can scan anytime during lecture
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {draftsCount > 0 && (
                        <button
                          onClick={handleOpenRecapModal}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-extrabold flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-900/30"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Launch Quick Recap ({draftsCount})</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : isActive && tokenData ? (
            <div className="w-full flex flex-col items-center space-y-6 text-center">
              {/* Dynamic rotation timer badge */}
              <div className="flex items-center justify-between w-full max-w-xs">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <RotateCw className={`w-3.5 h-3.5 text-blue-400 ${isRotating ? 'animate-spin' : ''}`} />
                  <span>Version #{tokenData.version}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono font-bold text-amber-300">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Rotates in {timeLeft}s</span>
                </div>
              </div>

              {/* QR Code Container with 30s circular countdown effect */}
              <div className="relative p-4 rounded-3xl bg-white shadow-2xl qr-container transform hover:scale-[1.02] transition-transform">
                <img
                  src={tokenData.qrDataUrl}
                  alt="Dynamic Attendance QR Code"
                  className="w-64 h-64 sm:w-72 sm:h-72 object-contain"
                />
              </div>

              {/* Backup Code Display */}
              <div className="w-full max-w-xs p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-1">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                  Camera Damaged? Use Backup Code:
                </span>
                <div className="text-2xl sm:text-3xl font-mono font-black tracking-widest text-blue-400 bg-slate-950/80 py-1.5 rounded-xl border border-slate-800">
                  {tokenData.backupCode}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
                <span>Protected against photo sharing • Auto-rotates every 30 seconds</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-800 mx-auto flex items-center justify-center">
                <Lock className="w-8 h-8 text-slate-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-300">Session Closed</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                This attendance session has been finalized. All un-scanned students were recorded as absent.
              </p>
              <button
                onClick={downloadSessionCSV}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 inline-flex items-center gap-1.5 shadow-lg shadow-emerald-600/30"
              >
                <FileSpreadsheet className="w-4 h-4" /> Download Official CSV Report
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Real-time Live Attendance Dashboard & Roster */}
        <div className={`${isSlideProjectorActive ? 'lg:col-span-4' : 'lg:col-span-7'} space-y-6 transition-all duration-300`}>
          {/* Live KPI Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass-card p-4 rounded-2xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Present</span>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-2xl font-black text-emerald-400">{stats?.present || 0}</span>
                <span className="text-xs text-emerald-400/80 font-medium">On-Time</span>
              </div>
            </div>

            <div className="glass-card p-4 rounded-2xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Late</span>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-2xl font-black text-amber-400">{stats?.late || 0}</span>
                <span className="text-xs text-amber-400/80 font-medium">After Cutoff</span>
              </div>
            </div>

            <div className="glass-card p-4 rounded-2xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">
                {isActive ? 'Pending' : 'Absent'}
              </span>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className={`text-2xl font-black ${isActive ? 'text-slate-400' : 'text-rose-400'}`}>
                  {isActive ? stats?.pending || 0 : stats?.absent || 0}
                </span>
                <span className="text-xs text-slate-500">
                  / {stats?.totalEnrolled || 0}
                </span>
              </div>
            </div>

            <div className="glass-card p-4 rounded-2xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Turnout</span>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className={`text-2xl font-black ${stats?.attendanceRate >= 75 ? 'text-blue-400' : 'text-rose-400'}`}>
                  {stats?.attendanceRate || 0}%
                </span>
                <span className="text-xs text-slate-500 font-medium">Rate</span>
              </div>
            </div>
          </div>

          {/* Live Recent Scans Stream (Pop-in cards as students scan) */}
          {recentScans.length > 0 && (
            <div className="glass-card p-4 rounded-2xl border border-blue-500/30 bg-blue-950/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                  Live Incoming Scans
                </span>
                <span className="text-[10px] text-blue-400/80 font-mono">Real-time WebSocket feed</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {recentScans.map((scan, idx) => (
                  <div
                    key={scan.recordId || idx}
                    className="flex-shrink-0 flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-700 text-xs shadow-md animate-slide-in"
                  >
                    <img
                      src={scan.student.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${scan.student.idNumber}`}
                      alt={scan.student.name}
                      className="w-6 h-6 rounded-full border border-slate-600 bg-slate-800"
                    />
                    <div>
                      <div className="font-semibold text-slate-200 truncate max-w-[120px]">{scan.student.name}</div>
                      <div className="text-[10px] text-slate-400">{new Date(scan.scannedAt).toLocaleTimeString()}</div>
                    </div>
                    <StatusBadge status={scan.status} className="text-[10px] py-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status Filter tabs */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs self-stretch sm:self-auto overflow-x-auto">
              {['ALL', 'PRESENT', 'LATE', isActive ? 'PENDING' : 'ABSENT', 'EXCUSED'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    statusFilter === filter ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Full Session Roster Table */}
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="sticky top-0 bg-slate-900 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800 z-10">
                  <tr>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3">Student ID</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Scanned Time</th>
                    <th className="px-4 py-3 text-right">Manual Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRoster.map((stu) => {
                    const currentStatus = stu.status || (isActive ? 'pending' : 'absent');
                    return (
                      <tr key={stu.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-200 flex items-center gap-2.5">
                          <img
                            src={stu.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${stu.id_number}`}
                            alt={stu.name}
                            className="w-7 h-7 rounded-lg border border-slate-700 bg-slate-800"
                          />
                          <div>
                            <div className="font-semibold">{stu.name}</div>
                            <div className="text-[11px] text-slate-500 truncate max-w-xs">{stu.email}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400">{stu.id_number}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={currentStatus} />
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                          {stu.scanned_at ? new Date(stu.scanned_at).toLocaleTimeString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setOverrideStudent(stu);
                              setOverrideStatus(stu.status || 'present');
                              setOverrideReason('');
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] inline-flex items-center gap-1 font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Override</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Override Modal with Mandatory Audit Trail */}
      <Modal
        isOpen={!!overrideStudent}
        onClose={() => setOverrideStudent(null)}
        title="Manual Attendance Override"
        subtitle={`Audit logged override for ${overrideStudent?.name} (${overrideStudent?.id_number})`}
      >
        <form onSubmit={handleManualOverrideSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Set Attendance Status</label>
            <select
              value={overrideStatus}
              onChange={(e) => setOverrideStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="present">Present (On-Time)</option>
              <option value="late">Late (Tardy)</option>
              <option value="excused">Excused (Medical/Official)</option>
              <option value="absent">Absent</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Override Justification Reason (Required for Audit Trail)
            </label>
            <textarea
              rows={3}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Phone battery drained; camera lens broken; presented medical excuse slip..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setOverrideStudent(null)}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={overrideSubmitting}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30"
            >
              {overrideSubmitting ? 'Saving Override...' : 'Save & Log Override'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Close & Finalize Session Confirmation Modal */}
      <Modal
        isOpen={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        title="Finalize & Close Class Session"
        subtitle="This action will permanently finalize the attendance sheet."
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-300 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Auto-Absent Finalization Notice
            </p>
            <p>
              Closing this session will automatically mark all remaining <span className="font-bold text-white">{stats?.pending || 0} unscanned students</span> as <span className="font-bold text-rose-400">ABSENT</span> and invalidate all active QR tokens.
            </p>
          </div>

          {/* Quick Recap Option before Closing */}
          {draftsCount > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>Quick Recap Questions Ready ({draftsCount} Prepared)</span>
              </div>
              <p className="text-slate-300">
                You have {draftsCount} prepared recap question(s) for this lesson. Would you like to run the Quick Recap with your students before closing the session?
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowCloseModal(false);
                  setShowPromptModal(true);
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-extrabold bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30 transition-all hover:scale-[1.01]"
              >
                <Zap className="w-4 h-4 text-slate-950 fill-slate-950" />
                <span>Run Quick Recap First ({draftsCount} Questions)</span>
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCloseModal(false)}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCloseSession}
              disabled={closingSession}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-900/40"
            >
              {closingSession ? 'Closing...' : 'Yes, Close Session'}
            </button>
          </div>
        </div>
      </Modal>
      {/* Quick Recap Creation Modal */}
      <Modal
        isOpen={showPromptModal}
        onClose={() => setShowPromptModal(false)}
        title="Launch Quick Recap"
        subtitle="Verify active presence and award bonus points."
      >
        <form onSubmit={handleLaunchPrompt} className="space-y-6">
          <div className="max-h-[60vh] overflow-y-auto space-y-8 pr-2">
            {promptDeck.map((q, qIndex) => (
              <div key={q.id} className="p-4 rounded-xl border border-slate-700 bg-slate-900/50 space-y-4 relative">
                {promptDeck.length > 1 && (
                  <button type="button" onClick={() => setPromptDeck(promptDeck.filter((_, i) => i !== qIndex))} className="absolute top-2 right-2 text-rose-400 hover:text-rose-300">
                    <XCircle className="w-5 h-5" />
                  </button>
                )}
                <div className="flex justify-between items-center text-amber-500 font-bold text-xs uppercase tracking-wider">
                  Question {qIndex + 1}
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Question Text</label>
                  <input
                    type="text"
                    required
                    value={q.question_text}
                    onChange={(e) => {
                      const newDeck = [...promptDeck];
                      newDeck[qIndex].question_text = e.target.value;
                      setPromptDeck(newDeck);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. What is the Big-O time complexity of Binary Search?"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Optional Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, qIndex)}
                    className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-amber-500 file:text-slate-900 hover:file:bg-amber-400"
                  />
                  {q.image_url && <img src={q.image_url} alt="Preview" className="mt-2 h-16 rounded-md border border-slate-700 object-contain" />}
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {q.options.map((opt, i) => (
                    <div key={opt.id} className="space-y-1">
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct_option_${q.id}`}
                          checked={q.correct_option === opt.id}
                          onChange={() => {
                            const newDeck = [...promptDeck];
                            newDeck[qIndex].correct_option = opt.id;
                            setPromptDeck(newDeck);
                          }}
                          className="text-amber-500 focus:ring-amber-500"
                        />
                        Option {opt.id}
                      </label>
                      <input
                        type="text"
                        required
                        value={opt.text}
                        onChange={(e) => {
                          const newDeck = [...promptDeck];
                          newDeck[qIndex].options[i].text = e.target.value;
                          setPromptDeck(newDeck);
                        }}
                        className={`w-full bg-slate-950 border ${q.correct_option === opt.id ? 'border-amber-500' : 'border-slate-700'} rounded-xl px-3 py-2 text-sm text-white`}
                        placeholder={`Answer ${opt.id}...`}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Time Limit (Seconds)</label>
                  <input
                    type="number"
                    required
                    min="5" max="120"
                    value={q.time_limit_seconds}
                    onChange={(e) => {
                      const newDeck = [...promptDeck];
                      newDeck[qIndex].time_limit_seconds = parseInt(e.target.value) || 20;
                      setPromptDeck(newDeck);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            ))}
          </div>
          
          <button
            type="button"
            onClick={() => setPromptDeck([...promptDeck, defaultQuestion()])}
            className="w-full py-2 border-2 border-dashed border-slate-700 hover:border-amber-500 rounded-xl text-xs font-bold text-slate-400 hover:text-amber-500 transition-colors"
          >
            + Add Another Question
          </button>

          <div className="pt-2 flex flex-col sm:flex-row gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowPromptModal(false)}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveDrafts}
              disabled={savingDrafts}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold text-blue-300 bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/60 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              <span>{savingDrafts ? 'Saving...' : 'Save as Draft'}</span>
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 shadow-lg shadow-amber-900/40 flex justify-center items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Launch Deck ({promptDeck.length})
            </button>
          </div>
        </form>
      </Modal>

      {/* Upload PPT Presentation Modal */}
      <Modal
        isOpen={showPptModal}
        onClose={() => setShowPptModal(false)}
        title="Connect Lesson Presentation"
        subtitle="Upload your PowerPoint (.pptx) to auto-extract slide concepts and prepare Quick Recap questions in advance."
      >
        <div className="space-y-4">
          <input
            type="file"
            ref={pptFileInputRef}
            onChange={handlePptFileSelect}
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="hidden"
          />

          <div
            onClick={() => !uploadingPpt && pptFileInputRef.current?.click()}
            className="p-8 border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 rounded-2xl bg-indigo-950/20 hover:bg-indigo-950/40 transition-colors cursor-pointer text-center space-y-3"
          >
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 mx-auto flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-950/50">
              {uploadingPpt ? (
                <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
              ) : (
                <Presentation className="w-7 h-7 text-indigo-400" />
              )}
            </div>

            <div>
              <p className="text-sm font-bold text-white">
                {uploadingPpt ? 'Analyzing Presentation Slides...' : 'Click to Upload PowerPoint (.pptx)'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {uploadingPpt ? 'Extracting slide content & key concepts...' : 'Maximum size: 50MB. Slide titles and key concepts will be parsed automatically.'}
              </p>
            </div>
          </div>

          {pptUploadError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{pptUploadError}</span>
            </div>
          )}

          {presentation && (
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-slate-200">{presentation.filename}</span>
                <span className="text-slate-400">({presentation.slide_count} slides)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPptModal(false);
                  setShowAdvanceRecapModal(true);
                }}
                className="text-amber-400 hover:text-amber-300 font-bold"
              >
                Review Prepared Recap
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                setShowPptModal(false);
                handleOpenPowerPoint();
              }}
              disabled={openingPowerPoint}
              className="py-2 px-3.5 rounded-xl text-xs font-bold text-purple-200 bg-purple-950/80 hover:bg-purple-900 border border-purple-500/50 flex items-center gap-1.5 transition-colors shadow"
              title="Open Microsoft PowerPoint desktop application"
            >
              <MonitorPlay className="w-3.5 h-3.5 text-purple-300" />
              <span>Open PowerPoint App</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPptModal(false)}
              className="py-2 px-4 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Advance Recap Preparation Modal */}
      <Modal
        isOpen={showAdvanceRecapModal}
        onClose={() => setShowAdvanceRecapModal(false)}
        title="Prepare Quick Recap in Advance"
        subtitle={`Presentation "${presentation?.filename || 'Slides'}" parsed (${presentation?.slide_count || 0} slides found).`}
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200 space-y-2">
            <p className="font-bold flex items-center gap-1.5 text-amber-300">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Quick Recap Questions Generated from your Slides
            </p>
            <p className="text-slate-300">
              The system extracted key slide topics. Would you like to save these Quick Recap questions in advance so they are ready for the end of the lesson?
            </p>
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-6 pr-2">
            {promptDeck.map((q, qIndex) => (
              <div key={q.id || qIndex} className="p-4 rounded-xl border border-slate-700 bg-slate-900/60 space-y-3 relative">
                {promptDeck.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPromptDeck(promptDeck.filter((_, i) => i !== qIndex))}
                    className="absolute top-2 right-2 text-rose-400 hover:text-rose-300"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                )}
                <div className="flex justify-between items-center text-amber-400 font-bold text-xs uppercase tracking-wider">
                  Question {qIndex + 1}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Question Text</label>
                  <input
                    type="text"
                    required
                    value={q.question_text}
                    onChange={(e) => {
                      const newDeck = [...promptDeck];
                      newDeck[qIndex].question_text = e.target.value;
                      setPromptDeck(newDeck);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {q.options.map((opt, i) => (
                    <div key={opt.id} className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                        <input
                          type="radio"
                          name={`advance_correct_${q.id || qIndex}`}
                          checked={q.correct_option === opt.id}
                          onChange={() => {
                            const newDeck = [...promptDeck];
                            newDeck[qIndex].correct_option = opt.id;
                            setPromptDeck(newDeck);
                          }}
                          className="text-amber-500 focus:ring-amber-500"
                        />
                        Option {opt.id} {q.correct_option === opt.id && <span className="text-emerald-400 font-bold">(Correct)</span>}
                      </label>
                      <input
                        type="text"
                        required
                        value={opt.text}
                        onChange={(e) => {
                          const newDeck = [...promptDeck];
                          newDeck[qIndex].options[i].text = e.target.value;
                          setPromptDeck(newDeck);
                        }}
                        className={`w-full bg-slate-950 border ${q.correct_option === opt.id ? 'border-amber-500' : 'border-slate-700'} rounded-xl px-2.5 py-1.5 text-xs text-white`}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Time Limit (seconds)</label>
                  <input
                    type="number"
                    min="5"
                    max="120"
                    value={q.time_limit_seconds || 20}
                    onChange={(e) => {
                      const newDeck = [...promptDeck];
                      newDeck[qIndex].time_limit_seconds = parseInt(e.target.value) || 20;
                      setPromptDeck(newDeck);
                    }}
                    className="w-24 bg-slate-950 border border-slate-700 rounded-xl px-2 py-1 text-xs text-white"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPromptDeck([...promptDeck, defaultQuestion()])}
            className="w-full py-2 border border-dashed border-slate-700 hover:border-amber-500 rounded-xl text-xs font-bold text-slate-400 hover:text-amber-500 transition-colors"
          >
            + Add Another Question
          </button>

          <div className="pt-2 flex flex-col sm:flex-row gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowAdvanceRecapModal(false)}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700"
            >
              Skip / Decide Later
            </button>
            <button
              type="button"
              onClick={handleSaveDrafts}
              disabled={savingDrafts}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>{savingDrafts ? 'Saving...' : `Save ${promptDeck.length} Recap Questions for Lesson End`}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
