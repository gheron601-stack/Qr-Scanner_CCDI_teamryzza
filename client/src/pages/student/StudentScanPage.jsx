import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import confetti from 'canvas-confetti';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import { StatusBadge } from '../../components/common/Badge';
import { 
  Scan, 
  Camera, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  Sparkles, 
  Keyboard, 
  ShieldCheck,
  MapPin,
  Clock,
  BookOpen,
  Zap,
  Radio
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

// Web Audio API chime player
function playSuccessChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
    osc.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.35); // D6

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch {
    // Audio context may be restricted by browser policy before user interaction
  }
}

export const StudentScanPage = () => {
  const { user } = useAuth();
  const { joinSession } = useSocket();
  const navigate = useNavigate();

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [scanError, setScanError] = useState('');
  
  // Manual backup code fallback
  const [showManualInput, setShowManualInput] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [manualSessionId, setManualSessionId] = useState('');
  const [activeSessionsList, setActiveSessionsList] = useState([]);

  const html5QrCodeRef = useRef(null);
  const scannerContainerId = 'qr-reader-container';

  // Fetch sections with active sessions for backup code fallback
  useEffect(() => {
    const fetchActiveSessions = async () => {
      try {
        const res = await api.get('/sections');
        const active = (res.data.sections || []).filter(s => s.active_session_id);
        setActiveSessionsList(active);
        if (active.length > 0) {
          setManualSessionId(active[0].active_session_id);
        }
      } catch (err) {
        console.error('Failed to load active sections', err);
      }
    };
    fetchActiveSessions();
  }, []);

  const startScanner = async () => {
    setCameraError('');
    setScanError('');
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(scannerContainerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false
        });
      }

      setScanning(true);

      const config = {
        fps: 15,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0
      };

      await html5QrCodeRef.current.start(
        { facingMode: 'environment' }, // prefer back camera on phone
        config,
        onScanSuccess,
        onScanFailure
      );
    } catch (err) {
      console.error('Camera init error:', err);
      setCameraError(err?.message || 'Could not access camera. Please allow camera permissions or enter backup code.');
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }
      setScanning(false);
    } catch (err) {
      console.error('Failed to stop camera scanner', err);
    }
  };

  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, []);

  const onScanSuccess = async (decodedText) => {
    // Temporarily pause scanner to avoid duplicate parallel requests
    stopScanner();
    await handleProcessScan({ token: decodedText });
  };

  const onScanFailure = () => {
    // Frame failed to detect QR code - silent ignore
  };

  const handleProcessScan = async (payload) => {
    try {
      setSubmitting(true);
      setScanError('');

      const res = await api.post('/scan', payload);
      const data = res.data;

      // Play chime & launch confetti
      playSuccessChime();
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      setScanResult(data);
      if (data?.session?.id) {
        joinSession(data.session.id);
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Scan validation failed. Please try rescanning.';
      setScanError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!backupCode || !manualSessionId) {
      setScanError('Please select a class session and enter the 6-character backup code.');
      return;
    }

    await handleProcessScan({
      sessionId: manualSessionId,
      backupCode: backupCode.trim().toUpperCase()
    });
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-10 space-y-6">
      {/* Header with Back button */}
      <div className="flex items-center justify-between">
        <Link 
          to="/student"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors p-2 rounded-xl bg-slate-900 border border-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Dashboard</span>
        </Link>
        <div className="text-right">
          <span className="text-xs text-slate-400">Scanning as</span>
          <p className="text-xs font-bold text-slate-200">{user?.name || 'Student'}</p>
        </div>
      </div>

      {/* Main Scanner Container */}
      {!scanResult ? (
        <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-6 relative overflow-hidden">
          <div className="text-center space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              <Scan className="w-3.5 h-3.5 animate-pulse" />
              <span>Dynamic Camera Scanner</span>
            </div>
            <h2 className="text-xl font-black text-white font-['Outfit']">
              Scan Classroom QR Code
            </h2>
            <p className="text-xs text-slate-400">
              Point your phone camera at the projector screen in the classroom.
            </p>
          </div>

          {/* Error Banner */}
          {scanError && (
            <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Scan Error</p>
                <p className="mt-0.5">{scanError}</p>
                <button
                  onClick={() => { setScanError(''); startScanner(); }}
                  className="mt-2 inline-flex items-center gap-1 font-semibold text-white bg-rose-600 hover:bg-rose-500 px-3 py-1 rounded-lg text-[11px]"
                >
                  <RefreshCw className="w-3 h-3" /> Rescan Current Code
                </button>
              </div>
            </div>
          )}

          {/* Camera Viewfinder */}
          {!showManualInput ? (
            <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-slate-700/80 shadow-inner">
              <div id={scannerContainerId} className="w-full min-h-[300px] flex items-center justify-center text-slate-500 text-xs" />

              {/* Viewfinder overlay reticle */}
              {scanning && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="w-56 h-56 border-2 border-blue-400/80 rounded-2xl relative shadow-lg shadow-blue-500/20 animate-pulse-subtle">
                    <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-blue-400 -mt-1 -ml-1 rounded-tl" />
                    <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-blue-400 -mt-1 -mr-1 rounded-tr" />
                    <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-blue-400 -mb-1 -ml-1 rounded-bl" />
                    <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-blue-400 -mb-1 -mr-1 rounded-br" />
                    <div className="absolute inset-x-0 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-pulse" />
                  </div>
                </div>
              )}

              {/* Camera loading / permission state */}
              {cameraError && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <Camera className="w-10 h-10 text-slate-500" />
                  <p className="text-xs text-rose-300 font-medium">{cameraError}</p>
                  <button
                    onClick={() => setShowManualInput(true)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500"
                  >
                    Enter 6-Digit Backup Code Instead
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Manual Backup Code Input Fallback */
            <form onSubmit={handleManualSubmit} className="space-y-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="text-center space-y-1">
                <Keyboard className="w-8 h-8 text-blue-400 mx-auto" />
                <h3 className="text-sm font-bold text-slate-200">Enter Screen Backup Code</h3>
                <p className="text-xs text-slate-400">
                  Type the 6-character code currently displayed under the QR code on the projector.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Class Session</label>
                <select
                  value={manualSessionId}
                  onChange={(e) => setManualSessionId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500"
                >
                  {activeSessionsList.length > 0 ? (
                    activeSessionsList.map((sec) => (
                      <option key={sec.active_session_id} value={sec.active_session_id}>
                        {sec.name} — {sec.subject_code} ({sec.room})
                      </option>
                    ))
                  ) : (
                    <option value="">No currently active sessions found</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">6-Character Backup Code</label>
                <input
                  type="text"
                  maxLength={6}
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 9F4B2A"
                  className="w-full text-center tracking-widest font-mono font-black text-2xl uppercase bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-white focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !manualSessionId}
                className="w-full py-3 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-600/30"
              >
                {submitting ? 'Verifying Code...' : 'Submit Attendance'}
              </button>
            </form>
          )}

          {/* Toggle manual / camera fallback */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                const nextState = !showManualInput;
                setShowManualInput(nextState);
                if (nextState) stopScanner();
                else startScanner();
              }}
              className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>{showManualInput ? 'Switch back to Camera Scan' : 'Camera broken? Use Backup Code'}</span>
            </button>

            {!showManualInput && (
              <button
                type="button"
                onClick={() => { stopScanner(); startScanner(); }}
                className="text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Restart Camera</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Attendance Success Confirmation Card */
        <div className="glass-panel p-8 rounded-3xl border border-emerald-500/40 shadow-2xl bg-gradient-to-b from-slate-900 via-emerald-950/20 to-slate-900 text-center space-y-6 animate-scale-up">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 mx-auto flex items-center justify-center shadow-xl shadow-emerald-500/20">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
          </div>

          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>ATTENDANCE RECORDED!</span>
            </div>
            <h2 className="text-2xl font-black text-white font-['Outfit']">
              Scan Confirmed
            </h2>
            <p className="text-xs text-slate-300">
              Your attendance has been verified and permanently logged to the server database.
            </p>
          </div>

          {/* Real-time Classroom Presence Notice */}
          <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl flex items-center justify-center gap-2 text-xs text-indigo-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <Radio className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>Connected to Live Classroom — Stay on this screen for Quick Recap Pop Quizzes!</span>
          </div>

          {/* Gamification Banner */}
          {scanResult.gamification && (
            <div className="bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/20 border border-amber-500/30 rounded-2xl p-4 animate-bounce-subtle">
              <div className="flex items-center justify-between text-amber-200 font-bold mb-2">
                <span className="flex items-center gap-2">
                  <span className="text-xl">⚡</span> XP Earned
                </span>
                <span className="text-lg">+{scanResult.gamification.xpEarned} XP</span>
              </div>
              <div className="text-xs text-amber-100/70 text-left">
                {scanResult.isEarly ? "Awesome! Early bird bonus applied!" : "Keep up the good attendance!"}
              </div>
              
              {scanResult.gamification.streak > 0 && (
                <div className="mt-3 pt-3 border-t border-amber-500/20 flex items-center justify-between text-xs text-amber-200">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm">🔥</span> Current Streak
                  </span>
                  <span className="font-bold">{scanResult.gamification.streak} Sessions</span>
                </div>
              )}
              
              {scanResult.gamification.newBadges?.length > 0 && (
                <div className="mt-3 space-y-2">
                  {scanResult.gamification.newBadges.map(badge => (
                    <div key={badge.key} className="flex items-center gap-2 bg-slate-900/50 p-2 rounded-lg border border-yellow-500/30">
                      <span className="text-2xl">{badge.emoji}</span>
                      <div className="text-left">
                        <div className="text-xs font-bold text-yellow-300">New Badge Unlocked!</div>
                        <div className="text-xs text-slate-300">{badge.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Receipt Info Box */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-left space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <span className="text-slate-400">Attendance Status:</span>
              <StatusBadge status={scanResult.status} />
            </div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <span className="text-slate-400">Student:</span>
              <span className="font-semibold text-slate-200">{scanResult.student?.name} ({scanResult.student?.idNumber})</span>
            </div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <span className="text-slate-400">Subject / Course:</span>
              <span className="font-semibold text-slate-200">{scanResult.session?.subjectCode} — {scanResult.session?.sectionName}</span>
            </div>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <span className="text-slate-400">Room:</span>
              <span className="text-slate-200">{scanResult.session?.room}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Timestamp:</span>
              <span className="font-mono text-slate-300">{new Date(scanResult.scannedAt).toLocaleTimeString()} ({new Date(scanResult.scannedAt).toLocaleDateString()})</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link
              to="/student"
              className="flex-1 py-3 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 transition-all text-center"
            >
              Return to Student Dashboard
            </Link>
            <button
              onClick={() => { setScanResult(null); setScanError(''); startScanner(); }}
              className="py-3 px-4 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Scan Another Code
            </button>
          </div>
        </div>
      )}

      {/* Security note */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2.5">
        <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <span>
          Protected by Dynamic Rotating HMAC Cryptography. Screenshotting or sharing QR codes will fail once rotated.
        </span>
      </div>
    </div>
  );
};
