import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { StatusBadge, RiskBadge } from '../../components/common/Badge';
import { AttendanceTrendChart } from '../../components/charts/AttendanceTrendChart';
import { Modal } from '../../components/common/Modal';
import { 
  ArrowLeft, 
  Users, 
  Calendar, 
  FileSpreadsheet, 
  MapPin, 
  Clock, 
  TrendingUp, 
  Eye, 
  BookOpen, 
  AlertTriangle,
  Presentation,
  Play,
  Upload,
  Sparkles,
  CheckCircle2,
  XCircle,
  Zap,
  Loader2,
  FileText,
  ChevronRight,
  Tv,
  Plus,
  MonitorPlay
} from 'lucide-react';

export const SectionDetailsPage = () => {
  const { id: sectionId } = useParams();
  const navigate = useNavigate();

  const [sectionData, setSectionData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [activeTab, setActiveTab] = useState('prep'); // 'prep' | 'roster' | 'sessions'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Lecture & PPT Preparation State
  const [presentation, setPresentation] = useState(null);
  const [slides, setSlides] = useState([]);
  const defaultQuestion = () => ({ 
    id: Math.random().toString(), 
    question_text: '', 
    options: [{id:'A', text:''}, {id:'B', text:''}, {id:'C', text:''}, {id:'D', text:''}], 
    correct_option: 'A', 
    time_limit_seconds: 20 
  });
  const [draftPrompts, setDraftPrompts] = useState([]);
  const [uploadingPpt, setUploadingPpt] = useState(false);
  const [pptUploadError, setPptUploadError] = useState('');
  const [savingDrafts, setSavingDrafts] = useState(false);
  const [openingPowerPoint, setOpeningPowerPoint] = useState(false);
  const pptFileInputRef = useRef(null);

  // Start Session Modal State
  const [showStartModal, setShowStartModal] = useState(false);
  const [lateCutoff, setLateCutoff] = useState(15);
  const [startingSession, setStartingSession] = useState(false);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const [secRes, analyticsRes] = await Promise.all([
        api.get(`/sections/${sectionId}`),
        api.get(`/analytics/section/${sectionId}`)
      ]);
      setSectionData(secRes.data);
      setAnalyticsData(analyticsRes.data);

      // Fetch prepared lecture presentation & recap questions for this section
      try {
        const draftsRes = await api.get(`/prompts/section/${sectionId}/drafts`);
        if (draftsRes.data?.presentation) {
          setPresentation(draftsRes.data.presentation);
          setSlides(draftsRes.data.slides || []);
        }
        if (draftsRes.data?.drafts?.length > 0) {
          setDraftPrompts(draftsRes.data.drafts);
        }
      } catch (e) {
        console.warn('Could not load section drafts:', e.message);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch section details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [sectionId]);

  const handlePptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingPpt(true);
      setPptUploadError('');
      const formData = new FormData();
      formData.append('presentation', file);

      const res = await api.post(`/prompts/section/${sectionId}/presentation`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setPresentation(res.data.presentation);
      setSlides(res.data.slides || []);

      if (res.data.suggestedQuestions?.length > 0) {
        setDraftPrompts(res.data.suggestedQuestions.map(q => ({
          ...q,
          id: Math.random().toString()
        })));
      }
    } catch (err) {
      console.error('Failed to upload presentation', err);
      setPptUploadError(err.response?.data?.error || 'Failed to upload presentation.');
    } finally {
      setUploadingPpt(false);
      if (pptFileInputRef.current) pptFileInputRef.current.value = '';
    }
  };

  const handleSaveDrafts = async () => {
    try {
      const validQuestions = draftPrompts.filter(q => q.question_text && q.question_text.trim());
      if (validQuestions.length === 0) {
        alert('Please enter question text for at least one recap question before saving.');
        return;
      }

      setSavingDrafts(true);
      const res = await api.post(`/prompts/section/${sectionId}/drafts`, { questions: validQuestions });
      setDraftPrompts(validQuestions);
      alert(`✅ ${res.data.count || validQuestions.length} Quick Recap question(s) saved in advance! They will be automatically linked when you start the class session.`);
    } catch (err) {
      console.error('Failed to save recap questions', err);
      alert(err.response?.data?.error || 'Failed to save recap questions.');
    } finally {
      setSavingDrafts(false);
    }
  };

  const handleOpenPowerPoint = async () => {
    try {
      setOpeningPowerPoint(true);
      await api.post('/prompts/launch-powerpoint');
    } catch (err) {
      console.warn('Failed to open PowerPoint via API, trying protocol:', err);
      try {
        window.location.href = 'ms-powerpoint:';
      } catch (e) {}
    } finally {
      setOpeningPowerPoint(false);
    }
  };

  const handleStartSession = async (e) => {
    e?.preventDefault();
    try {
      setStartingSession(true);
      // Auto-save any prepared questions before starting
      if (draftPrompts.length > 0) {
        await api.post(`/prompts/section/${sectionId}/drafts`, { questions: draftPrompts }).catch(() => {});
      }

      const res = await api.post('/sessions', {
        sectionId,
        lateCutoffMinutes: parseInt(lateCutoff) || 15
      });

      setShowStartModal(false);
      navigate(`/instructor/session/${res.data.sessionId}`);
    } catch (err) {
      if (err.response?.data?.activeSessionId) {
        navigate(`/instructor/session/${err.response.data.activeSessionId}`);
      } else {
        alert(err.response?.data?.error || 'Failed to start class session.');
      }
    } finally {
      setStartingSession(false);
    }
  };

  const downloadTermCSV = async () => {
    try {
      const res = await api.get(`/sections/${sectionId}/export-csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Section_Attendance_${sectionId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download CSV: ' + (err.response?.data?.error || err.message));
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6 animate-pulse">
        <div className="h-32 bg-slate-800/60 rounded-3xl"></div>
        <div className="h-64 bg-slate-800/60 rounded-2xl"></div>
      </div>
    );
  }

  if (error || !sectionData) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Error</h2>
        <p className="text-xs text-slate-400">{error || 'Section not found'}</p>
        <Link to="/instructor" className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { section, roster, sessions } = sectionData;
  const closedSessions = (sessions || []).filter(s => s.status === 'closed');
  const activeSession = (sessions || []).find(s => s.status === 'active');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hidden PPT File Input */}
      <input
        type="file"
        ref={pptFileInputRef}
        onChange={handlePptUpload}
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className="hidden"
      />

      {/* Header Banner */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-blue-950/40 to-slate-900 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/instructor"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {section.name}
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                  {section.subject_code} — {section.subject_title}
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Instructor: <span className="text-slate-200 font-semibold">{section.instructor_name || 'N/A'}</span> • {section.instructor_department}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center flex-wrap gap-2.5">
            {activeSession ? (
              <Link
                to={`/instructor/session/${activeSession.id}`}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 animate-pulse"
              >
                <Tv className="w-4 h-4" />
                <span>Open Live Session Screen</span>
              </Link>
            ) : (
              <button
                onClick={() => setShowStartModal(true)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02]"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Start Class Session</span>
              </button>
            )}

            <Link
              to={`/instructor/patterns?sectionId=${section.id}`}
              className="px-4 py-2.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/70 border border-amber-600/50 text-amber-300 text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-amber-950/30"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Pattern Alerts</span>
            </Link>

            <button
              onClick={downloadTermCSV}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Matrix CSV</span>
            </button>
          </div>
        </div>

        {/* Info badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs text-slate-300">
          <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-blue-400" /> Room: {section.room}</div>
          <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-blue-400" /> {section.schedule}</div>
          <div className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-blue-400" /> {roster.length} Enrolled</div>
          <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-blue-400" /> {closedSessions.length} Completed Sessions</div>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="space-y-6">
        <div className="flex border-b border-slate-800 gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('prep')}
            className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'prep'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Presentation className="w-4 h-4" />
            <span>Lecture & PPT Preparation</span>
            {presentation && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {presentation.slide_count} slides
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('roster')}
            className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'roster'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Class Roster ({analyticsData?.studentRoster?.length || roster.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'sessions'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Class Sessions ({sessions.length})</span>
          </button>
        </div>

        {/* Tab 1: Lecture Preparation Studio */}
        {activeTab === 'prep' && (
          <div className="space-y-6">
            {/* Top Action / Upload Card */}
            {!presentation ? (
              <div
                onClick={() => !uploadingPpt && pptFileInputRef.current?.click()}
                className="p-10 border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 rounded-3xl bg-indigo-950/20 hover:bg-indigo-950/40 transition-all cursor-pointer text-center space-y-4 shadow-xl"
              >
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 mx-auto flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-950/50">
                  {uploadingPpt ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <Presentation className="w-8 h-8" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {uploadingPpt ? 'Analyzing Lecture Slides & Concepts...' : 'Upload Lecture PowerPoint (.pptx)'}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    {uploadingPpt 
                      ? 'Parsing slide content and generating recap questions in advance...' 
                      : 'Prepare your lesson before class starts. Upload your presentation slides to auto-generate Quick Recap questions and enable live Slide Projector Mode.'}
                  </p>
                </div>
                {pptUploadError && (
                  <div className="p-3 max-w-md mx-auto rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                    {pptUploadError}
                  </div>
                )}
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30">
                    <Upload className="w-4 h-4" />
                    <span>Select PowerPoint File (.pptx)</span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPowerPoint();
                    }}
                    disabled={openingPowerPoint}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-purple-200 bg-purple-950/80 hover:bg-purple-900 border border-purple-500/50 shadow-lg shadow-purple-950/40 transition-all"
                    title="Open Microsoft PowerPoint application to choose or prepare your topic"
                  >
                    {openingPowerPoint ? <Loader2 className="w-4 h-4 animate-spin" /> : <MonitorPlay className="w-4 h-4" />}
                    <span>Open PowerPoint App</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="glass-panel p-6 rounded-3xl border border-indigo-500/40 bg-gradient-to-br from-slate-900 via-indigo-950/30 to-slate-900 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                      <Presentation className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>LECTURE READY</span>
                        </span>
                        <span className="text-xs text-slate-400">
                          {slides.length} Slides Parsed
                        </span>
                      </div>
                      <h3 className="text-lg font-extrabold text-white mt-1">
                        {presentation.filename}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleOpenPowerPoint}
                      disabled={openingPowerPoint}
                      className="px-3.5 py-2 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-500/50 text-purple-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
                      title="Open Microsoft PowerPoint to choose and present your topic"
                    >
                      {openingPowerPoint ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-300" />
                      ) : (
                        <MonitorPlay className="w-3.5 h-3.5 text-purple-300" />
                      )}
                      <span>{openingPowerPoint ? 'Opening...' : 'Open PowerPoint'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => pptFileInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Replace PPT</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowStartModal(true)}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-extrabold shadow-lg shadow-blue-600/30 flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Start Class with this Lecture</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Two-column layout: Slides Outline & Quick Recap Questions */}
            {presentation && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Column 1: Lecture Slide Outline (5 cols) */}
                <div className="lg:col-span-5 glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-indigo-400" />
                      <span>Lecture Slide Outline ({slides.length})</span>
                    </h4>
                    <span className="text-[11px] text-slate-400">Projectable in class</span>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {slides.map((s, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                            Slide {s.slideNumber || idx + 1}
                          </span>
                        </div>
                        <h5 className="text-xs font-bold text-slate-200">
                          {s.title}
                        </h5>
                        {s.bullets?.length > 0 && (
                          <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-0.5">
                            {s.bullets.slice(0, 3).map((b, bIdx) => (
                              <li key={bIdx} className="truncate">{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Column 2: Prepared Quick Recap Questions (7 cols) */}
                <div className="lg:col-span-7 glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span>Prepared Quick Recap Questions ({draftPrompts.length})</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        These questions will be pushed directly to students' phones at the end of class.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveDrafts}
                      disabled={savingDrafts}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{savingDrafts ? 'Saving...' : 'Save Questions'}</span>
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {draftPrompts.map((q, qIndex) => (
                      <div key={q.id || qIndex} className="p-4 rounded-xl border border-slate-700 bg-slate-900/60 space-y-3 relative">
                        {draftPrompts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDraftPrompts(draftPrompts.filter((_, i) => i !== qIndex))}
                            className="absolute top-2.5 right-2.5 text-rose-400 hover:text-rose-300"
                            title="Remove Question"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                          Recap Question {qIndex + 1}
                        </span>

                        <div>
                          <input
                            type="text"
                            required
                            value={q.question_text}
                            onChange={(e) => {
                              const newDeck = [...draftPrompts];
                              newDeck[qIndex].question_text = e.target.value;
                              setDraftPrompts(newDeck);
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-amber-500"
                            placeholder="Question text..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {q.options.map((opt, i) => (
                            <div key={opt.id} className="space-y-1">
                              <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                                <input
                                  type="radio"
                                  name={`correct_opt_prep_${q.id || qIndex}`}
                                  checked={q.correct_option === opt.id}
                                  onChange={() => {
                                    const newDeck = [...draftPrompts];
                                    newDeck[qIndex].correct_option = opt.id;
                                    setDraftPrompts(newDeck);
                                  }}
                                  className="text-amber-500 focus:ring-amber-500"
                                />
                                <span>Option {opt.id}</span>
                                {q.correct_option === opt.id && <span className="text-emerald-400 font-bold">(Correct)</span>}
                              </label>
                              <input
                                type="text"
                                required
                                value={opt.text}
                                onChange={(e) => {
                                  const newDeck = [...draftPrompts];
                                  newDeck[qIndex].options[i].text = e.target.value;
                                  setDraftPrompts(newDeck);
                                }}
                                className={`w-full bg-slate-950 border ${q.correct_option === opt.id ? 'border-amber-500' : 'border-slate-700'} rounded-xl px-2.5 py-1.5 text-xs text-white`}
                                placeholder={`Answer ${opt.id}...`}
                              />
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>Time Limit:</span>
                          <input
                            type="number"
                            min="5"
                            max="120"
                            value={q.time_limit_seconds || 20}
                            onChange={(e) => {
                              const newDeck = [...draftPrompts];
                              newDeck[qIndex].time_limit_seconds = parseInt(e.target.value) || 20;
                              setDraftPrompts(newDeck);
                            }}
                            className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-white"
                          />
                          <span>seconds</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setDraftPrompts([...draftPrompts, defaultQuestion()])}
                    className="w-full py-2.5 border border-dashed border-slate-700 hover:border-amber-500 rounded-xl text-xs font-bold text-slate-400 hover:text-amber-500 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Another Recap Question</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Class Roster Table */}
        {activeTab === 'roster' && (
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Student</th>
                    <th className="px-5 py-3.5">Student ID</th>
                    <th className="px-5 py-3.5">Present</th>
                    <th className="px-5 py-3.5">Late</th>
                    <th className="px-5 py-3.5">Absent</th>
                    <th className="px-5 py-3.5">Attendance Rate</th>
                    <th className="px-5 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(analyticsData?.studentRoster || []).map((stu) => (
                    <tr key={stu.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-200 flex items-center gap-2.5">
                        <img
                          src={stu.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${stu.id_number}`}
                          alt={stu.name}
                          className="w-7 h-7 rounded-lg border border-slate-700 bg-slate-800"
                        />
                        <div>
                          <div className="font-semibold text-slate-200">{stu.name}</div>
                          <div className="text-[11px] text-slate-400">{stu.email}</div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-400">{stu.id_number}</td>
                      <td className="px-5 py-3.5 text-emerald-400 font-bold">{stu.presentCount || 0}</td>
                      <td className="px-5 py-3.5 text-amber-400 font-bold">{stu.lateCount || 0}</td>
                      <td className="px-5 py-3.5 text-rose-400 font-bold">{stu.absentCount || 0}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${stu.ratePercent >= 80 ? 'text-emerald-400' : stu.ratePercent >= 75 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {stu.ratePercent}%
                          </span>
                          <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${stu.ratePercent >= 80 ? 'bg-emerald-500' : stu.ratePercent >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${stu.ratePercent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {stu.absentCount >= 4 ? (
                          <RiskBadge riskLevel="CRITICAL" />
                        ) : stu.absentCount >= 3 ? (
                          <RiskBadge riskLevel="HIGH" />
                        ) : stu.ratePercent < 75 ? (
                          <RiskBadge riskLevel="WARNING" />
                        ) : (
                          <RiskBadge riskLevel="GOOD" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Class Sessions Table */}
        {activeTab === 'sessions' && (
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5">Start Time</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Present</th>
                    <th className="px-5 py-3.5">Late</th>
                    <th className="px-5 py-3.5">Absent</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(sessions || []).map((sess) => (
                    <tr key={sess.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-200">{sess.date}</td>
                      <td className="px-5 py-3.5 text-slate-400">{sess.start_time}</td>
                      <td className="px-5 py-3.5">
                        {sess.status === 'active' ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                            ACTIVE LIVE
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            CLOSED
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-emerald-400 font-semibold">{sess.present_count || 0}</td>
                      <td className="px-5 py-3.5 text-amber-400 font-semibold">{sess.late_count || 0}</td>
                      <td className="px-5 py-3.5 text-rose-400 font-semibold">{sess.absent_count || 0}</td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <Link
                          to={`/instructor/session/${sess.id}`}
                          className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Session</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Start Session Setup Modal */}
      <Modal
        isOpen={showStartModal}
        onClose={() => setShowStartModal(false)}
        title="Start Class Session"
        subtitle={`Launch live attendance & projector screen for ${section.name}`}
      >
        <form onSubmit={handleStartSession} className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Section:</span>
              <span className="text-white font-bold">{section.name}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Course:</span>
              <span className="text-slate-200">{section.subject_title}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Room:</span>
              <span className="text-slate-200">{section.room}</span>
            </div>
            {presentation && (
              <div className="flex justify-between text-indigo-300 font-semibold pt-1 border-t border-slate-800">
                <span>Lecture PPT:</span>
                <span>{presentation.filename} ({presentation.slide_count} slides)</span>
              </div>
            )}
            {draftPrompts.length > 0 && (
              <div className="flex justify-between text-amber-300 font-semibold">
                <span>Quick Recap:</span>
                <span>{draftPrompts.length} Question(s) Prepared</span>
              </div>
            )}
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
              Students scanning within {lateCutoff} minutes will be marked <span className="text-emerald-400 font-semibold">PRESENT</span>.
            </p>
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setShowStartModal(false)}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={startingSession}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 flex items-center justify-center gap-1.5"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{startingSession ? 'Launching...' : 'Launch Projector Screen'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
