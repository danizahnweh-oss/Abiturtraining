/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, MicOff, GraduationCap, Play, Square, Settings2,
  ChevronDown, Clock, FileText, MessageCircle, Loader2,
  RotateCcw, PenLine, Volume2, ArrowLeft, Download,
} from 'lucide-react';
import {
  LiveSession, SUBJECTS, generateExamMaterial, generateWrittenFeedback,
  type ExamLevel, type ExamMode, type ExamMaterial, type PrueferTyp,
} from './lib/live-api';
import { downloadFeedbackPdf } from './lib/pdf-export';
import { AudioProcessor } from './lib/audio-utils';
import { CURRICULUM, getSchwerpunkte, getAvailableHalbjahre } from './lib/curriculum';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TutorialOverlay, KOLLOQUIUM_TOUR_STEPS, KOLLOQUIUM_STORAGE_KEY } from './TutorialOverlay';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ───────── Markdown-Hilfsfunktion ───────── */

function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

/* ───────── Timer hooks ───────── */

function useCountdown(initialSeconds: number) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const ref = useRef<number | null>(null);

  const start = useCallback(() => setRunning(true), []);
  const stop = useCallback(() => setRunning(false), []);
  const reset = useCallback((s: number) => { setRunning(false); setRemaining(s); }, []);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    ref.current = window.setInterval(() => {
      setRemaining(p => { if (p <= 1) { setRunning(false); return 0; } return p - 1; });
    }, 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running, remaining]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return { remaining, display: `${mm}:${ss}`, running, start, stop, reset };
}

function useStopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<number | null>(null);

  const start = useCallback(() => { setElapsed(0); setRunning(true); }, []);
  const stop = useCallback(() => setRunning(false), []);

  useEffect(() => {
    if (!running) return;
    ref.current = window.setInterval(() => setElapsed(p => p + 1), 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  let phase: 'referat' | 'fragen-schwerpunkt' | 'fragen-weitere' = 'referat';
  if (elapsed >= 15 * 60) phase = 'fragen-weitere';
  else if (elapsed >= 10 * 60) phase = 'fragen-schwerpunkt';

  return { elapsed, display: `${mm}:${ss}`, running, start, stop, phase };
}

/* ───────── Pill button helper ───────── */

function Pill({ active, disabled, onClick, children, className }: {
  active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "py-3 px-4 rounded-xl text-sm border transition-all text-left duration-200",
        active
          ? "bg-gradient-to-r from-emerald-50 to-emerald-100/50 border-emerald-300 text-emerald-800 shadow-sm shadow-emerald-100"
          : "bg-white border-black/5 opacity-50 hover:opacity-70 hover:border-black/10 hover:bg-slate-50/50 hover:shadow-sm",
        disabled && "cursor-not-allowed opacity-30 hover:opacity-30 hover:shadow-none",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ───────── Main component ───────── */

type Step = 'setup' | 'generating' | 'preparation' | 'exam' | 'feedback-choice' | 'feedback';

const PHASE_LABELS: Record<string, string> = {
  'referat': 'Kurzreferat (ca. 10 Min)',
  'fragen-schwerpunkt': 'Fragen zum Schwerpunkt (ca. 5 Min)',
  'fragen-weitere': 'Fragen zu weiteren Halbjahren (ca. 15 Min)',
};

export default function App() {
  /* Auth gate — redirect to main app if not logged in */
  useEffect(() => {
    if (sessionStorage.getItem('access') !== '1' || !sessionStorage.getItem('student_name')) {
      window.location.href = '/';
    }
  }, []);

  /* URL params */
  const fachFromUrl = new URLSearchParams(window.location.search).get('fach') || '';

  /* Config state */
  const [step, setStep] = useState<Step>('setup');
  const [subject, setSubject] = useState(fachFromUrl);
  const [examLevel, setExamLevel] = useState<ExamLevel>('gA');
  const [examMode, setExamMode] = useState<ExamMode>('gesamt');
  const [gestrichen, setGestrichen] = useState<'12/1' | '12/2' | ''>('');
  const [spHalbjahr, setSpHalbjahr] = useState('');
  const [schwerpunkt, setSchwerpunkt] = useState('');
  const [customSp, setCustomSp] = useState(false);
  const [customSchwerpunkte, setCustomSchwerpunkte] = useState<Record<string, string[]>>({});

  /* Material */
  const [material, setMaterial] = useState<ExamMaterial | null>(null);

  /* Session state */
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'>('disconnected');
  const [modelTx, setModelTx] = useState<string[]>([]);
  const [userTx, setUserTx] = useState<string[]>([]);
  const sessionRef = useRef<LiveSession | null>(null);
  const micRef = useRef<AudioProcessor | null>(null);

  /* Prüfer-Geschlecht (zufällig gewählt) */
  const [examinerGender, setExaminerGender] = useState<'male' | 'female'>('male');
  const prüferLabel = examinerGender === 'female' ? 'Prüferin' : 'Prüfer';

  /* Prüfertyp */
  const [prueferTyp, setPrueferTyp] = useState<PrueferTyp>('standard');

  /* Feedback */
  const [fbType, setFbType] = useState<'written' | 'oral' | null>(null);
  const [fbText, setFbText] = useState('');
  const [fbLoading, setFbLoading] = useState(false);

  /* Timers */
  const prep = useCountdown(30 * 60);
  const exam = useStopwatch();

  /* Derived */
  const isMathe = subject === 'Mathematik';
  const level = isMathe ? 'eA' : examLevel;
  const availHJ = gestrichen ? getAvailableHalbjahre(subject, gestrichen) : [];
  const spOptions = spHalbjahr
    ? (customSp
        ? (customSchwerpunkte[spHalbjahr] || []).filter(s => s.trim())
        : getSchwerpunkte(subject, spHalbjahr, level))
    : [];
  const weitereHJ = (gestrichen && spHalbjahr) ? availHJ.filter(h => h !== spHalbjahr) : [];
  const canGenerate = !!(subject && gestrichen && spHalbjahr && schwerpunkt);

  /* ── Reset helpers ── */
  const resetSpHalbjahr = () => { setSpHalbjahr(''); setSchwerpunkt(''); setCustomSp(false); setCustomSchwerpunkte({}); };

  const toggleCustomSp = () => {
    if (!customSp) {
      const init: Record<string, string[]> = {};
      availHJ.forEach(hj => { init[hj] = ['', '', '']; });
      setCustomSchwerpunkte(init);
    }
    setCustomSp(!customSp);
    setSchwerpunkt('');
    setSpHalbjahr('');
  };

  const updateCustomSp = (hj: string, idx: number, value: string) => {
    setCustomSchwerpunkte(prev => ({
      ...prev,
      [hj]: (prev[hj] || ['', '', '']).map((s, i) => i === idx ? value : s),
    }));
  };

  /* ── Actions ── */
  const handleGenerate = async () => {
    if (!canGenerate) return;

    // Geschlecht zufällig wählen
    const gender = Math.random() < 0.5 ? 'male' : 'female' as const;
    setExaminerGender(gender);

    // "Fragen" mode: skip material generation + prep, go straight to exam
    if (examMode === 'fragen') {
      setMaterial({ aufgabenstellung: '', material: '', hinweise: '' });
      setStep('exam');
      setModelTx([]);
      setUserTx([]);

      // Mikrofon parallel zum WebSocket-Aufbau initialisieren
      const processor = new AudioProcessor();
      processor.warmup().catch(() => {});
      micRef.current = processor;

      const session = new LiveSession({
        subject, examLevel: level, schwerpunkt, schwerpunktHalbjahr: spHalbjahr,
        weitereHalbjahre: weitereHJ, aufgabenstellung: '', material: '', examMode, gender, prueferTyp,
        onStatusChange: s => setStatus(s),
        onModelTranscription: t => setModelTx(prev => [...prev, t]),
        onUserTranscription: t => setUserTx(prev => [...prev, t]),
      }, processor);
      sessionRef.current = session;
      exam.start();
      await session.start();
      return;
    }

    setStep('generating');
    try {
      const m = await generateExamMaterial({
        subject, examLevel: level, schwerpunkt, schwerpunktHalbjahr: spHalbjahr, weitereHalbjahre: weitereHJ,
      });
      setMaterial(m);
    } catch {
      setMaterial({
        aufgabenstellung: `Erläutern Sie "${schwerpunkt}" und nehmen Sie kritisch Stellung.`,
        material: 'Nutzen Sie Ihr Vorwissen.',
        hinweise: 'Strukturieren Sie Ihr Referat. Planen Sie ca. 10 Minuten.',
      });
    }
    setStep('preparation');
    prep.reset(30 * 60);
    prep.start();

    // Mikrofon vorab initialisieren während der Vorbereitungszeit
    if (!micRef.current) {
      micRef.current = new AudioProcessor();
      micRef.current.warmup().catch(() => {});
    }
  };

  const startExam = async () => {
    if (!material) return;
    prep.stop();
    setStep('exam');
    setModelTx([]);
    setUserTx([]);

    const processor = micRef.current || undefined;
    micRef.current = null;

    const session = new LiveSession({
      subject, examLevel: level, schwerpunkt, schwerpunktHalbjahr: spHalbjahr,
      weitereHalbjahre: weitereHJ, aufgabenstellung: material.aufgabenstellung, material: material.material,
      examMode, gender: examinerGender, prueferTyp,
      onStatusChange: s => setStatus(s),
      onModelTranscription: t => setModelTx(prev => [...prev, t]),
      onUserTranscription: t => setUserTx(prev => [...prev, t]),
    }, processor);
    sessionRef.current = session;
    exam.start();
    await session.start();
  };

  const stopExam = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    exam.stop();
    setStatus('disconnected');
    setStep('feedback-choice');
  };

  const handleWrittenFb = async () => {
    setFbType('written');
    setFbLoading(true);
    setStep('feedback');
    try {
      const fb = await generateWrittenFeedback({
        subject, examLevel: level, schwerpunkt, modelTranscription: modelTx, userTranscription: userTx,
      });
      setFbText(fb);
    } catch {
      setFbText('Feedback konnte nicht generiert werden.');
    }
    setFbLoading(false);
  };

  const handleOralFb = async () => {
    setFbType('oral');
    setStep('feedback');
    setModelTx([]);

    const transcript = modelTx.map((m, i) => {
      const u = userTx[i] || '';
      return `${u ? `Prüfling: ${u}\n` : ''}Prüfer: ${m}`;
    }).join('\n');

    const session = new LiveSession({
      subject, examLevel: level, schwerpunkt, schwerpunktHalbjahr: spHalbjahr,
      weitereHalbjahre: weitereHJ, aufgabenstellung: material?.aufgabenstellung || '',
      material: material?.material || '',
      gender: examinerGender, feedbackMode: true, examTranscript: transcript,
      onStatusChange: s => setStatus(s),
      onModelTranscription: t => setModelTx(prev => [...prev, t]),
      onUserTranscription: t => setUserTx(prev => [...prev, t]),
    });
    sessionRef.current = session;
    await session.start();
  };

  const stopFeedback = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setStatus('disconnected');
  };

  const fullReset = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    micRef.current?.stopRecording();
    micRef.current = null;
    setStep('setup');
    setStatus('disconnected');
    setModelTx([]);
    setUserTx([]);
    setMaterial(null);
    setFbType(null);
    setFbText('');
    setExamMode('gesamt');
    setPrueferTyp('standard');
    setGestrichen('');
    setSpHalbjahr('');
    setSchwerpunkt('');
    prep.reset(30 * 60);
  };

  /* ───────── RENDER ───────── */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100 text-slate-800 font-sans selection:bg-emerald-200/50">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/70 border-b border-white/50 transition-all w-full">
        <div className="max-w-4xl mx-auto py-4 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); sessionRef.current?.stop(); window.location.href = '/'; }}
              className="w-10 h-10 bg-white/80 backdrop-blur-sm rounded-xl flex items-center justify-center border border-black/5 hover:bg-white hover:shadow-sm transition-all shadow-sm"
              title="Zurück zur Startseite"
            >
              <ArrowLeft size={20} className="opacity-60" />
            </a>
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 ring-1 ring-black/5 ring-inset">
              <GraduationCap size={24} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600">Kolloquium Trainer</h1>
          </div>

          {step !== 'setup' && step !== 'generating' && (
            <div className="flex items-center gap-3">
              {step === 'exam' && (
                <span className="text-xs font-medium opacity-50 uppercase tracking-wider hidden sm:block">
                  {PHASE_LABELS[exam.phase]}
                </span>
              )}
              {(step === 'exam' || (step === 'feedback' && fbType === 'oral')) && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm shadow-sm rounded-full border border-black/5">
                  <div className={cn(
                    "w-2 h-2 rounded-full animate-pulse",
                    status === 'connected' ? "bg-emerald-500" : status === 'error' ? "bg-red-500" : "bg-amber-500",
                  )} />
                  <span className="text-xs font-medium uppercase tracking-wider opacity-60">
                    {status === 'connected' ? 'Live' : status === 'error' ? 'Fehler' : status === 'reconnecting' ? 'Verbindet neu...' : 'Verbindet...'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 relative z-0">
        <AnimatePresence mode="wait">

          {/* ════════ SETUP ════════ */}
          {step === 'setup' && (
            <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="grid gap-8">
              <TutorialOverlay steps={KOLLOQUIUM_TOUR_STEPS} storageKey={KOLLOQUIUM_STORAGE_KEY} />
              <div className="bg-white/80 backdrop-blur-md p-8 rounded-3xl shadow-xl shadow-emerald-50/50 border border-emerald-100/50 ring-1 ring-white">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                    <Settings2 size={20} />
                  </div>
                  <h2 className="text-lg font-medium text-slate-800">Kolloquium konfigurieren</h2>
                </div>

                <div className="space-y-6">
                  {/* Subject */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Prüfungsfach</label>
                    <div className="relative">
                      <select
                        value={subject}
                        onChange={e => { setSubject(e.target.value); setGestrichen(''); resetSpHalbjahr(); if (e.target.value === 'Mathematik') setExamLevel('eA'); }}
                        className="w-full appearance-none bg-[#F9F9F9] border border-black/5 rounded-2xl px-5 py-4 pr-12 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all cursor-pointer"
                      >
                        <option value="" disabled>Fach auswählen...</option>
                        {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none" />
                    </div>
                  </div>

                  {/* Level */}
                  {subject && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">
                        Anforderungsniveau
                        {isMathe && <span className="normal-case tracking-normal ml-2 opacity-70">(Mathe nur eA)</span>}
                      </label>
                      <div className="flex gap-3">
                        <Pill active={level === 'gA'} disabled={isMathe} onClick={() => { if (!isMathe) { setExamLevel('gA'); setSchwerpunkt(''); } }} className="flex-1 text-center">gA – grundlegend</Pill>
                        <Pill active={level === 'eA'} onClick={() => { setExamLevel('eA'); setSchwerpunkt(''); }} className="flex-1 text-center">eA – erhöht</Pill>
                      </div>
                    </div>
                  )}

                  {/* Halbjahr streichen */}
                  {subject && CURRICULUM[subject] && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Halbjahr streichen</label>
                      <p className="text-xs opacity-50 ml-1 -mt-1">Welches Halbjahr möchtest du von der Prüfung ausschließen?</p>
                      <div className="flex gap-3">
                        <Pill active={gestrichen === '12/1'} onClick={() => { setGestrichen('12/1'); resetSpHalbjahr(); }} className="flex-1 text-center">
                          <span className="font-medium">12/1</span>
                        </Pill>
                        <Pill active={gestrichen === '12/2'} onClick={() => { setGestrichen('12/2'); resetSpHalbjahr(); }} className="flex-1 text-center">
                          <span className="font-medium">12/2</span>
                        </Pill>
                      </div>
                    </div>
                  )}

                  {/* Eigene Schwerpunkte Toggle */}
                  {gestrichen && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Schwerpunkte</label>
                      <p className="text-xs opacity-50 ml-1 -mt-1">Hat dein Lehrer eigene Schwerpunkte festgelegt?</p>
                      <div className="flex gap-3">
                        <Pill active={!customSp} onClick={() => { if (customSp) { setCustomSp(false); setCustomSchwerpunkte({}); setSchwerpunkt(''); setSpHalbjahr(''); } }} className="flex-1 text-center">
                          <span className="font-medium">LehrplanPLUS</span>
                        </Pill>
                        <Pill active={customSp} onClick={() => { if (!customSp) toggleCustomSp(); }} className="flex-1 text-center">
                          <span className="font-medium">Eigene</span>
                        </Pill>
                      </div>
                    </div>
                  )}

                  {/* Eigene Schwerpunkte Eingabe */}
                  {customSp && availHJ.length > 0 && (
                    <div className="space-y-4">
                      <p className="text-xs opacity-50 ml-1">Gib für jedes Halbjahr 3 Schwerpunktthemen ein:</p>
                      {availHJ.map(hj => (
                        <div key={hj} className="space-y-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                          <label className="text-xs font-semibold uppercase tracking-widest opacity-60 ml-1">{hj}</label>
                          {[0, 1, 2].map(i => (
                            <input
                              key={i}
                              type="text"
                              value={customSchwerpunkte[hj]?.[i] || ''}
                              onChange={e => updateCustomSp(hj, i, e.target.value)}
                              placeholder={`Schwerpunkt ${i + 1}`}
                              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-emerald-400 min-h-[44px]"
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Schwerpunkt Halbjahr */}
                  {gestrichen && (!customSp || availHJ.some(hj => (customSchwerpunkte[hj] || []).filter(s => s.trim()).length > 0)) && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Schwerpunkt-Halbjahr</label>
                      <p className="text-xs opacity-50 ml-1 -mt-1">Aus welchem Halbjahr kommt dein Schwerpunktthema?</p>
                      <div className="flex gap-3">
                        {availHJ.map(hj => {
                          const hjHasTopics = !customSp || (customSchwerpunkte[hj] || []).filter(s => s.trim()).length > 0;
                          return (
                            <Pill key={hj} active={spHalbjahr === hj} disabled={!hjHasTopics} onClick={() => { if (hjHasTopics) { setSpHalbjahr(hj); setSchwerpunkt(''); } }} className="flex-1 text-center">
                              <span className="font-medium">{hj}</span>
                            </Pill>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Schwerpunkt */}
                  {spHalbjahr && spOptions.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Schwerpunktthema</label>
                      <div className="grid gap-2">
                        {spOptions.map(opt => (
                          <Pill key={opt} active={schwerpunkt === opt} onClick={() => setSchwerpunkt(opt)} className="w-full">
                            {opt}
                          </Pill>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prüfungsmodus */}
                  {schwerpunkt && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Prüfungsmodus</label>
                      <p className="text-xs opacity-50 ml-1 -mt-1">Was möchtest du üben?</p>
                      <div className="grid gap-2">
                        <Pill active={examMode === 'gesamt'} onClick={() => setExamMode('gesamt')} className="w-full">
                          <span className="font-medium">Gesamte Prüfung</span>
                          <span className="block text-xs opacity-60 mt-0.5">Kurzreferat + Fragen zum Schwerpunkt + Fragen zu weiteren Halbjahren (ca. 30 Min)</span>
                        </Pill>
                        <Pill active={examMode === 'referat'} onClick={() => setExamMode('referat')} className="w-full">
                          <span className="font-medium">Nur Kurzreferat</span>
                          <span className="block text-xs opacity-60 mt-0.5">Vorbereitung + Kurzreferat mit Feedback (ca. 10 Min)</span>
                        </Pill>
                        <Pill active={examMode === 'fragen'} onClick={() => setExamMode('fragen')} className="w-full">
                          <span className="font-medium">Nur Fragenteil</span>
                          <span className="block text-xs opacity-60 mt-0.5">Fragen zum Schwerpunkt + weitere Halbjahre, ohne Referat (ca. 20 Min)</span>
                        </Pill>
                      </div>
                    </div>
                  )}

                  {/* Prüfertyp */}
                  {schwerpunkt && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Prüfertyp</label>
                      <p className="text-xs opacity-50 ml-1 -mt-1">Wie soll sich der/die Prüfer/in verhalten?</p>
                      <div className="grid gap-2">
                        <Pill active={prueferTyp === 'standard'} onClick={() => setPrueferTyp('standard')} className="w-full">
                          <span className="font-medium">Standard</span>
                          <span className="block text-xs opacity-60 mt-0.5">Wohlwollend, aber anspruchsvoll — wie in der echten Prüfung</span>
                        </Pill>
                        <Pill active={prueferTyp === 'streng'} onClick={() => setPrueferTyp('streng')} className="w-full">
                          <span className="font-medium">Streng</span>
                          <span className="block text-xs opacity-60 mt-0.5">Fordernd, hakt bei Ungenauigkeiten sofort nach</span>
                        </Pill>
                        <Pill active={prueferTyp === 'freundlich'} onClick={() => setPrueferTyp('freundlich')} className="w-full">
                          <span className="font-medium">Freundlich</span>
                          <span className="block text-xs opacity-60 mt-0.5">Ermutigend, gibt Hilfestellungen und lobt gute Ansätze</span>
                        </Pill>
                        <Pill active={prueferTyp === 'zeitdruck'} onClick={() => setPrueferTyp('zeitdruck')} className="w-full">
                          <span className="font-medium">Zeitdruck</span>
                          <span className="block text-xs opacity-60 mt-0.5">Streng getaktet — geht bei langen Antworten zügig weiter</span>
                        </Pill>
                        <Pill active={prueferTyp === 'detailfragen'} onClick={() => setPrueferTyp('detailfragen')} className="w-full">
                          <span className="font-medium">Detailfragen</span>
                          <span className="block text-xs opacity-60 mt-0.5">Geht in die Tiefe — fragt immer „Warum?" und fordert Belege</span>
                        </Pill>
                      </div>
                    </div>
                  )}
                </div>

                {/* Summary + Start */}
                {canGenerate && (
                  <div className="mt-6 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-sm">
                    <p className="font-medium text-emerald-800 mb-1">Zusammenfassung:</p>
                    <p className="text-emerald-700 opacity-80">
                      {subject} ({level}) · {examMode === 'gesamt' ? 'Gesamte Prüfung' : examMode === 'referat' ? 'Nur Referat' : 'Nur Fragen'} · {prueferTyp !== 'standard' ? `Prüfertyp: ${prueferTyp} · ` : ''}Schwerpunkt aus {spHalbjahr}: <em>{schwerpunkt}</em> · Gestrichen: {gestrichen} · Teil 2: {weitereHJ.join(', ')}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="w-full mt-6 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl py-4 font-medium flex items-center justify-center gap-2 hover:from-emerald-600 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 active:scale-[0.98]"
                >
                  <Play size={18} fill="currentColor" />
                  {examMode === 'fragen' ? 'Prüfung starten' : 'Aufgabenstellung generieren'}
                </button>
              </div>
            </motion.div>
          )}

          {/* ════════ GENERATING ════════ */}
          {step === 'generating' && (
            <motion.div key="generating" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-24 min-h-[50vh]">
              <div className="bg-white/80 backdrop-blur-lg p-12 rounded-3xl shadow-xl shadow-emerald-50/50 ring-1 ring-white border border-emerald-100/50 text-center flex flex-col items-center max-w-sm w-full">
                <div className="mb-6 relative">
                  <div className="absolute inset-0 bg-emerald-400 blur-xl opacity-20 rounded-full animate-pulse" />
                  <Loader2 size={48} className="text-emerald-500 animate-spin relative" />
                </div>
                <p className="text-lg font-medium text-slate-800">Aufgabenstellung wird erstellt...</p>
                <p className="text-sm text-slate-500 mt-2">Dies kann einen Moment dauern.</p>
              </div>
            </motion.div>
          )}

          {/* ════════ PREPARATION ════════ */}
          {step === 'preparation' && material && (
            <motion.div key="preparation" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-6">
              {/* Timer bar */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-black/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                    <Clock size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest opacity-40">Vorbereitungszeit</p>
                    <p className="text-sm opacity-60">Erstelle dein Kurzreferat. Kein ausformuliertes Manuskript!</p>
                  </div>
                </div>
                <div className={cn(
                  "text-3xl font-mono font-bold tabular-nums",
                  prep.remaining <= 60 ? "text-red-500 drop-shadow-sm" : prep.remaining <= 5 * 60 ? "text-amber-500" : "text-emerald-600",
                )}>
                  {prep.display}
                </div>
              </div>

              {/* Aufgabenstellung */}
              <div className="bg-white/90 backdrop-blur-md rounded-3xl p-8 shadow-lg shadow-emerald-50/30 border border-emerald-100/50 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-400 to-emerald-600" />
                <div className="flex items-center gap-2 mb-4 text-emerald-600">
                  <FileText size={18} />
                  <h3 className="font-semibold text-sm uppercase tracking-wider">Aufgabenstellung</h3>
                </div>
                <p className="text-lg leading-relaxed whitespace-pre-wrap text-slate-800">{renderMarkdown(material.aufgabenstellung)}</p>
              </div>

              {/* Material */}
              <div className="bg-white/90 backdrop-blur-md rounded-3xl p-8 shadow-sm border border-black/5">
                <h3 className="font-semibold text-sm uppercase tracking-wider opacity-50 mb-4">Material</h3>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap opacity-80 leading-relaxed">
                  {renderMarkdown(material.material)}
                </div>
              </div>

              {/* Hinweise */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-100/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
                <h3 className="font-semibold text-sm uppercase tracking-wider text-amber-700 mb-2">Hinweise</h3>
                <p className="text-sm text-amber-800 opacity-80 whitespace-pre-wrap">{renderMarkdown(material.hinweise)}</p>
              </div>

              <button
                onClick={startExam}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl py-4 font-medium flex items-center justify-center gap-2 hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 active:scale-[0.98]"
              >
                <Mic size={18} />
                Prüfung starten
              </button>
            </motion.div>
          )}

          {/* ════════ EXAM ════════ */}
          {step === 'exam' && (
            <motion.div key="exam" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
              <div className="w-full bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-2xl shadow-emerald-100/60 ring-1 ring-white border border-emerald-100/50 overflow-hidden">
                {/* Phase bar */}
                <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-emerald-100/50 border-b border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {examMode === 'referat' ? (
                      <span className="text-xs font-medium uppercase tracking-wider text-emerald-700">Kurzreferat</span>
                    ) : examMode === 'fragen' ? (
                      (['fragen-schwerpunkt', 'fragen-weitere'] as const).map(p => (
                        <span key={p} className={cn(
                          "text-xs font-medium uppercase tracking-wider transition-all",
                          exam.phase === p || (exam.phase === 'referat' && p === 'fragen-schwerpunkt') ? "text-emerald-700" : "opacity-30",
                        )}>
                          {p === 'fragen-schwerpunkt' ? 'Fragen SP' : 'Fragen HJ'}
                        </span>
                      ))
                    ) : (
                      (['referat', 'fragen-schwerpunkt', 'fragen-weitere'] as const).map(p => (
                        <span key={p} className={cn(
                          "text-xs font-medium uppercase tracking-wider transition-all",
                          exam.phase === p ? "text-emerald-700" : "opacity-30",
                        )}>
                          {p === 'referat' ? 'Referat' : p === 'fragen-schwerpunkt' ? 'Fragen SP' : 'Fragen HJ'}
                        </span>
                      ))
                    )}
                  </div>
                  <span className="text-sm font-mono font-bold text-emerald-600 tabular-nums">{exam.display}</span>
                </div>

                <div className="p-8 flex flex-col items-center text-center">
                  {/* Mic visual */}
                  <div className="mb-8 relative mt-4">
                    <motion.div
                      animate={{ scale: status === 'connected' ? [1, 1.2, 1] : 1, opacity: status === 'connected' ? [0.4, 0.7, 0.4] : 0.1 }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      className="absolute inset-0 bg-emerald-400 rounded-full blur-2xl"
                    />
                    <motion.div
                      animate={{ scale: status === 'connected' ? [1, 1.05, 1] : 1 }}
                      transition={{ repeat: Infinity, duration: 2, delay: 0.2, ease: "easeInOut" }}
                      className="relative w-32 h-32 bg-gradient-to-tr from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center text-white shadow-[0_0_40px_-10px_rgba(16,185,129,0.5)] ring-4 ring-white/50"
                    >
                      {status === 'connected' ? <Mic size={48} /> : <MicOff size={48} className="opacity-50" />}
                    </motion.div>
                  </div>

                  <h2 className="text-xl font-semibold mb-1 text-slate-800">{subject}</h2>
                  <div className="flex items-center gap-2 mb-2 flex-wrap justify-center">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{level}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">SP: {spHalbjahr}</span>
                  </div>
                  <p className="text-emerald-600 font-medium text-sm mb-6">{schwerpunkt}</p>

                  {/* Transcription */}
                  <div className="w-full max-w-lg bg-gradient-to-b from-slate-50 to-white shadow-inner rounded-2xl p-6 min-h-[120px] flex flex-col justify-center border border-black/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-100 to-transparent opacity-50" />
                    {status === 'reconnecting' ? (
                      <p className="text-sm text-amber-600 italic">Verbindung wird wiederhergestellt... Bitte kurz warten.</p>
                    ) : status === 'connecting' ? (
                      <div className="text-center">
                        <Loader2 size={24} className="text-emerald-500 animate-spin mx-auto mb-3" />
                        <p className="text-sm opacity-50 italic">Verbindung {examinerGender === 'female' ? 'zur' : 'zum'} {prüferLabel} wird hergestellt...</p>
                        <p className="text-xs opacity-35 mt-2">Dies kann bis zu 2 Minuten dauern. Bitte hab Geduld.</p>
                        <div className="mt-3 px-4 py-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                          <p className="text-sm text-emerald-700 font-medium">Tipp: Begrüße {examinerGender === 'female' ? 'die' : 'den'} {prüferLabel} – das hilft, das Gespräch zu starten!</p>
                        </div>
                      </div>
                    ) : status === 'error' ? (
                      <p className="text-sm text-red-500 italic">Verbindungsfehler. Bitte Prüfung beenden und neu starten.</p>
                    ) : modelTx.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest opacity-30 mb-2">{prüferLabel}</p>
                        <p className="text-base leading-relaxed text-slate-800">{modelTx[modelTx.length - 1]}</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-sm opacity-40 italic mb-3">{examinerGender === 'female' ? 'Die' : 'Der'} {prüferLabel} wird gleich beginnen...</p>
                        <div className="px-4 py-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                          <p className="text-sm text-emerald-700 font-medium">Tipp: Begrüße {examinerGender === 'female' ? 'die' : 'den'} {prüferLabel} – das hilft, das Gespräch zu starten!</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom bar */}
                <div className="bg-slate-50/80 p-5 flex items-center justify-between border-t border-black/5">
                  {status === 'connected' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-medium opacity-60">Mikrofon aktiv</span>
                    </div>
                  ) : (
                    <div />
                  )}
                  <button onClick={stopExam} className="bg-gradient-to-r from-red-50 to-white text-red-600 hover:text-red-700 border border-red-100 hover:border-red-200 px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:shadow-md transition-all active:scale-[0.98]">
                    <Square size={16} fill="currentColor" />
                    Prüfung beenden
                  </button>
                </div>
              </div>

              <p className="mt-6 text-sm opacity-40 text-center max-w-md">
                {examMode === 'referat'
                  ? "Halte dein Kurzreferat. Nutze deine Notizen als Stütze."
                  : examMode === 'fragen'
                    ? (exam.elapsed < 5 * 60
                      ? `${examinerGender === 'female' ? 'Die' : 'Der'} ${prüferLabel} stellt Fragen zu deinem Schwerpunktthema.`
                      : `${examinerGender === 'female' ? 'Die' : 'Der'} ${prüferLabel} fragt jetzt zu den weiteren Halbjahren.`)
                    : exam.phase === 'referat'
                      ? "Halte dein Kurzreferat. Nutze deine Notizen als Stütze."
                      : exam.phase === 'fragen-schwerpunkt'
                        ? `${examinerGender === 'female' ? 'Die' : 'Der'} ${prüferLabel} stellt Fragen zu deinem Schwerpunktthema.`
                        : `${examinerGender === 'female' ? 'Die' : 'Der'} ${prüferLabel} fragt jetzt zu den weiteren Halbjahren.`}
              </p>
            </motion.div>
          )}

          {/* ════════ FEEDBACK CHOICE ════════ */}
          {step === 'feedback-choice' && (
            <motion.div key="fb-choice" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
              <div className="bg-white/80 backdrop-blur-md rounded-3xl p-10 shadow-xl shadow-emerald-50/50 border border-emerald-100/50 ring-1 ring-white max-w-xl w-full text-center">
                <GraduationCap size={44} className="text-emerald-500 mx-auto mb-5 opacity-80" />
                <h2 className="text-2xl font-semibold mb-2 text-slate-800">Prüfung abgeschlossen!</h2>
                <p className="opacity-60 mb-8 text-slate-600">Wie möchtest du dein Feedback erhalten?</p>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={handleWrittenFb}
                    className="p-6 rounded-3xl bg-white border border-black/5 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-50 hover:-translate-y-1 transition-all duration-300 text-left group"
                  >
                    <PenLine size={28} className="text-emerald-600 mb-3 group-hover:scale-110 transition-transform" />
                    <p className="font-semibold mb-1 text-slate-800">Schriftlich</p>
                    <p className="text-xs opacity-60">Detailliertes schriftliches Feedback mit Punkteeinschätzung und Tipps.</p>
                  </button>
                  <button
                    onClick={handleOralFb}
                    className="p-6 rounded-3xl bg-white border border-black/5 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-50 hover:-translate-y-1 transition-all duration-300 text-left group"
                  >
                    <Volume2 size={28} className="text-emerald-600 mb-3 group-hover:scale-110 transition-transform" />
                    <p className="font-semibold mb-1 text-slate-800">Mündlich</p>
                    <p className="text-xs opacity-60">{examinerGender === 'female' ? 'Die KI-Prüferin' : 'Der KI-Prüfer'} bespricht dein Ergebnis live mit dir.</p>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ════════ FEEDBACK ════════ */}
          {step === 'feedback' && (
            <motion.div key="feedback" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-6">

              {fbType === 'written' && (
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
                  <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <PenLine size={22} className="text-emerald-600" />
                    Feedback
                  </h2>
                  {fbLoading ? (
                    <div className="flex flex-col items-center py-12">
                      <Loader2 size={36} className="text-emerald-600 animate-spin mb-4" />
                      <p className="opacity-50">Feedback wird erstellt...</p>
                    </div>
                  ) : (
                    <>
                      <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">{fbText}</div>
                      <div className="mt-6 pt-5 border-t border-black/5 flex justify-end">
                        <button
                          onClick={() => downloadFeedbackPdf({ subject, schwerpunkt, level, feedbackText: fbText })}
                          className="bg-white text-emerald-700 border border-emerald-200 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-emerald-50 transition-all hover:shadow-sm active:scale-95 text-sm"
                        >
                          <Download size={16} />
                          Als PDF herunterladen
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {fbType === 'oral' && (
                <div className="bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-2xl shadow-emerald-100/60 ring-1 ring-white border border-emerald-100/50 overflow-hidden">
                  <div className="p-8 flex flex-col items-center text-center">
                    <div className="mb-8 relative mt-4">
                      <motion.div
                        animate={{ scale: status === 'connected' ? [1, 1.15, 1] : 1, opacity: status === 'connected' ? [0.4, 0.7, 0.4] : 0.1 }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        className="absolute inset-0 bg-emerald-400 rounded-full blur-xl"
                      />
                      <motion.div
                        animate={{ scale: status === 'connected' ? [1, 1.05, 1] : 1 }}
                        transition={{ repeat: Infinity, duration: 2, delay: 0.2, ease: "easeInOut" }}
                        className="relative w-28 h-28 bg-gradient-to-tr from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center text-white shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)] ring-4 ring-white/50"
                      >
                        {status === 'connected' ? <Volume2 size={40} /> : <Loader2 size={40} className="animate-spin opacity-50" />}
                      </motion.div>
                    </div>
                    <h2 className="text-xl font-semibold mb-1 text-slate-800">Mündliches Feedback</h2>
                    <p className="text-sm opacity-50 mb-6 text-slate-500">{examinerGender === 'female' ? 'Die' : 'Der'} {prüferLabel} bespricht dein Ergebnis mit dir.</p>

                    <div className="w-full max-w-lg bg-gradient-to-b from-slate-50 to-white shadow-inner rounded-2xl p-6 min-h-[100px] flex flex-col justify-center border border-black/5 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-100 to-transparent opacity-50" />
                      {status === 'connecting' ? (
                        <div className="text-center">
                          <Loader2 size={24} className="text-emerald-500 animate-spin mx-auto mb-3" />
                          <p className="text-sm opacity-50 italic">Verbindung wird hergestellt...</p>
                          <p className="text-xs opacity-35 mt-2">Dies kann bis zu 2 Minuten dauern. Bitte hab Geduld.</p>
                        </div>
                      ) : modelTx.length > 0 ? (
                        <p className="text-base leading-relaxed text-slate-800">{modelTx[modelTx.length - 1]}</p>
                      ) : (
                        <p className="text-sm opacity-40 italic">Feedback wird gleich beginnen...</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50/80 p-5 flex justify-end border-t border-black/5">
                    <button onClick={stopFeedback} className="bg-white text-slate-600 border border-black/10 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-slate-50 transition-all hover:shadow-sm active:scale-95">
                      Feedback beenden
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={fullReset}
                className="mx-auto flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                <RotateCcw size={16} />
                Neue Prüfung starten
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 text-center pointer-events-none pb-3 px-4">
        <p className="text-[11px] text-gray-400 leading-relaxed max-w-2xl mx-auto">
          Alle Pr&uuml;fungen, Bewertungen und Feedback werden mithilfe von KI erstellt.
          Die Richtigkeit kann nicht garantiert werden.
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-15 mt-1">
          Powered by Gemini 2.5 Live API
        </p>
      </footer>
    </div>
  );
}
