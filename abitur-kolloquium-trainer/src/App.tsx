/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, MicOff, GraduationCap, Play, Square, Settings2,
  ChevronDown, Clock, FileText, MessageCircle, Loader2,
  RotateCcw, PenLine, Volume2, ArrowLeft,
} from 'lucide-react';
import {
  LiveSession, SUBJECTS, generateExamMaterial, generateWrittenFeedback,
  type ExamLevel, type ExamMode, type ExamMaterial,
} from './lib/live-api';
import { CURRICULUM, getSchwerpunkte, getAvailableHalbjahre } from './lib/curriculum';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
        "py-3 px-4 rounded-xl text-sm border transition-all text-left",
        active
          ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm"
          : "bg-[#F9F9F9] border-black/5 opacity-50 hover:opacity-70",
        disabled && "cursor-not-allowed opacity-30 hover:opacity-30",
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

  /* Material */
  const [material, setMaterial] = useState<ExamMaterial | null>(null);

  /* Session state */
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'>('disconnected');
  const [modelTx, setModelTx] = useState<string[]>([]);
  const [userTx, setUserTx] = useState<string[]>([]);
  const sessionRef = useRef<LiveSession | null>(null);

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
  const spOptions = spHalbjahr ? getSchwerpunkte(subject, spHalbjahr) : [];
  const weitereHJ = (gestrichen && spHalbjahr) ? availHJ.filter(h => h !== spHalbjahr) : [];
  const canGenerate = !!(subject && gestrichen && spHalbjahr && schwerpunkt);

  /* ── Reset helpers ── */
  const resetSpHalbjahr = () => { setSpHalbjahr(''); setSchwerpunkt(''); };

  /* ── Actions ── */
  const handleGenerate = async () => {
    if (!canGenerate) return;

    // "Fragen" mode: skip material generation + prep, go straight to exam
    if (examMode === 'fragen') {
      setMaterial({ aufgabenstellung: '', material: '', hinweise: '' });
      setStep('exam');
      setModelTx([]);
      setUserTx([]);

      const session = new LiveSession({
        subject, examLevel: level, schwerpunkt, schwerpunktHalbjahr: spHalbjahr,
        weitereHalbjahre: weitereHJ, aufgabenstellung: '', material: '', examMode,
        onStatusChange: s => setStatus(s),
        onModelTranscription: t => setModelTx(prev => [...prev, t]),
        onUserTranscription: t => setUserTx(prev => [...prev, t]),
      });
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
  };

  const startExam = async () => {
    if (!material) return;
    prep.stop();
    setStep('exam');
    setModelTx([]);
    setUserTx([]);

    const session = new LiveSession({
      subject, examLevel: level, schwerpunkt, schwerpunktHalbjahr: spHalbjahr,
      weitereHalbjahre: weitereHJ, aufgabenstellung: material.aufgabenstellung, material: material.material,
      examMode,
      onStatusChange: s => setStatus(s),
      onModelTranscription: t => setModelTx(prev => [...prev, t]),
      onUserTranscription: t => setUserTx(prev => [...prev, t]),
    });
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
      feedbackMode: true, examTranscript: transcript,
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
    setStep('setup');
    setStatus('disconnected');
    setModelTx([]);
    setUserTx([]);
    setMaterial(null);
    setFbType(null);
    setFbText('');
    setExamMode('gesamt');
    setGestrichen('');
    setSpHalbjahr('');
    setSchwerpunkt('');
    prep.reset(30 * 60);
  };

  /* ───────── RENDER ───────── */

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="max-w-4xl mx-auto pt-10 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); sessionRef.current?.stop(); window.location.href = '/'; }}
            className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-black/5 hover:bg-gray-50 transition-colors shadow-sm"
            title="Zurück zur Startseite"
          >
            <ArrowLeft size={20} className="opacity-60" />
          </a>
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <GraduationCap size={24} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Kolloquium Trainer</h1>
        </div>

        {step !== 'setup' && step !== 'generating' && (
          <div className="flex items-center gap-3">
            {step === 'exam' && (
              <span className="text-xs font-medium opacity-50 uppercase tracking-wider hidden sm:block">
                {PHASE_LABELS[exam.phase]}
              </span>
            )}
            {(step === 'exam' || (step === 'feedback' && fbType === 'oral')) && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-black/5 shadow-sm">
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
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <AnimatePresence mode="wait">

          {/* ════════ SETUP ════════ */}
          {step === 'setup' && (
            <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="grid gap-8">
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5">
                <div className="flex items-center gap-3 mb-6 text-emerald-600">
                  <Settings2 size={20} />
                  <h2 className="text-lg font-medium">Kolloquium konfigurieren</h2>
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
                        <Pill active={level === 'gA'} disabled={isMathe} onClick={() => !isMathe && setExamLevel('gA')} className="flex-1 text-center">gA – grundlegend</Pill>
                        <Pill active={level === 'eA'} onClick={() => setExamLevel('eA')} className="flex-1 text-center">eA – erhöht</Pill>
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

                  {/* Schwerpunkt Halbjahr */}
                  {gestrichen && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Schwerpunkt-Halbjahr</label>
                      <p className="text-xs opacity-50 ml-1 -mt-1">Aus welchem Halbjahr kommt dein Schwerpunktthema?</p>
                      <div className="flex gap-3">
                        {availHJ.map(hj => (
                          <Pill key={hj} active={spHalbjahr === hj} onClick={() => { setSpHalbjahr(hj); setSchwerpunkt(''); }} className="flex-1 text-center">
                            <span className="font-medium">{hj}</span>
                          </Pill>
                        ))}
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
                </div>

                {/* Summary + Start */}
                {canGenerate && (
                  <div className="mt-6 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-sm">
                    <p className="font-medium text-emerald-800 mb-1">Zusammenfassung:</p>
                    <p className="text-emerald-700 opacity-80">
                      {subject} ({level}) · {examMode === 'gesamt' ? 'Gesamte Prüfung' : examMode === 'referat' ? 'Nur Referat' : 'Nur Fragen'} · Schwerpunkt aus {spHalbjahr}: <em>{schwerpunkt}</em> · Gestrichen: {gestrichen} · Teil 2: {weitereHJ.join(', ')}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="w-full mt-6 bg-emerald-600 text-white rounded-2xl py-4 font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-30 disabled:hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200"
                >
                  <Play size={18} fill="currentColor" />
                  {examMode === 'fragen' ? 'Prüfung starten' : 'Aufgabenstellung generieren'}
                </button>
              </div>
            </motion.div>
          )}

          {/* ════════ GENERATING ════════ */}
          {step === 'generating' && (
            <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-24">
              <Loader2 size={48} className="text-emerald-600 animate-spin mb-6" />
              <p className="text-lg font-medium">Aufgabenstellung wird erstellt...</p>
              <p className="text-sm opacity-50 mt-2">Dies kann einen Moment dauern.</p>
            </motion.div>
          )}

          {/* ════════ PREPARATION ════════ */}
          {step === 'preparation' && material && (
            <motion.div key="preparation" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-6">
              {/* Timer bar */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-black/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock size={20} className="text-emerald-600" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest opacity-40">Vorbereitungszeit</p>
                    <p className="text-sm opacity-60">Erstelle dein Kurzreferat. Kein ausformuliertes Manuskript!</p>
                  </div>
                </div>
                <div className={cn(
                  "text-3xl font-mono font-bold tabular-nums",
                  prep.remaining <= 60 ? "text-red-500" : prep.remaining <= 5 * 60 ? "text-amber-500" : "text-emerald-600",
                )}>
                  {prep.display}
                </div>
              </div>

              {/* Aufgabenstellung */}
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
                <div className="flex items-center gap-2 mb-4 text-emerald-600">
                  <FileText size={18} />
                  <h3 className="font-semibold text-sm uppercase tracking-wider">Aufgabenstellung</h3>
                </div>
                <p className="text-lg leading-relaxed whitespace-pre-wrap">{material.aufgabenstellung}</p>
              </div>

              {/* Material */}
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
                <h3 className="font-semibold text-sm uppercase tracking-wider opacity-50 mb-4">Material</h3>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap opacity-80 leading-relaxed">
                  {material.material}
                </div>
              </div>

              {/* Hinweise */}
              <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-amber-700 mb-2">Hinweise</h3>
                <p className="text-sm text-amber-800 opacity-80 whitespace-pre-wrap">{material.hinweise}</p>
              </div>

              <button
                onClick={startExam}
                className="w-full bg-emerald-600 text-white rounded-2xl py-4 font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
              >
                <Mic size={18} />
                Prüfung starten
              </button>
            </motion.div>
          )}

          {/* ════════ EXAM ════════ */}
          {step === 'exam' && (
            <motion.div key="exam" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
              <div className="w-full bg-white rounded-3xl shadow-xl border border-black/5 overflow-hidden">
                {/* Phase bar */}
                <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
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
                  <div className="mb-6 relative">
                    <motion.div
                      animate={{ scale: status === 'connected' ? [1, 1.1, 1] : 1, opacity: status === 'connected' ? [.4, .7, .4] : .3 }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="absolute inset-0 bg-emerald-500 rounded-full blur-2xl"
                    />
                    <div className="relative w-28 h-28 bg-emerald-600 rounded-full flex items-center justify-center text-white shadow-2xl">
                      {status === 'connected' ? <Mic size={40} /> : <MicOff size={40} className="opacity-50" />}
                    </div>
                  </div>

                  <h2 className="text-xl font-semibold mb-1">{subject}</h2>
                  <div className="flex items-center gap-2 mb-2 flex-wrap justify-center">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{level}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">SP: {spHalbjahr}</span>
                  </div>
                  <p className="text-emerald-600 font-medium text-sm mb-6">{schwerpunkt}</p>

                  {/* Transcription */}
                  <div className="w-full max-w-lg bg-[#F9F9F9] rounded-2xl p-6 min-h-[100px] flex flex-col justify-center border border-black/5">
                    {status === 'reconnecting' ? (
                      <p className="text-sm text-amber-600 italic">Verbindung wird wiederhergestellt... Bitte kurz warten.</p>
                    ) : status === 'connecting' ? (
                      <p className="text-sm opacity-40 italic">Verbindung wird hergestellt...</p>
                    ) : status === 'error' ? (
                      <p className="text-sm text-red-500 italic">Verbindungsfehler. Bitte Prüfung beenden und neu starten.</p>
                    ) : modelTx.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest opacity-30 mb-2">Prüfer</p>
                        <p className="text-base leading-relaxed">{modelTx[modelTx.length - 1]}</p>
                      </div>
                    ) : (
                      <p className="text-sm opacity-40 italic">Der Prüfer wird gleich beginnen...</p>
                    )}
                  </div>
                </div>

                {/* Bottom bar */}
                <div className="bg-[#F9F9F9] p-5 flex items-center justify-between border-t border-black/5">
                  {status === 'connected' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-medium opacity-60">Mikrofon aktiv</span>
                    </div>
                  ) : (
                    <div />
                  )}
                  <button onClick={stopExam} className="bg-white text-red-500 border border-red-100 px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-red-50 transition-all shadow-sm">
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
                    ? "Der Prüfer stellt Fragen zu deinem Schwerpunktthema."
                    : "Der Prüfer fragt jetzt zu den weiteren Halbjahren.")
                  : exam.phase === 'referat'
                  ? "Halte dein Kurzreferat. Nutze deine Notizen als Stütze."
                  : exam.phase === 'fragen-schwerpunkt'
                  ? "Der Prüfer stellt Fragen zu deinem Schwerpunktthema."
                  : "Der Prüfer fragt jetzt zu den weiteren Halbjahren."}
              </p>
            </motion.div>
          )}

          {/* ════════ FEEDBACK CHOICE ════════ */}
          {step === 'feedback-choice' && (
            <motion.div key="fb-choice" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
              <div className="bg-white rounded-3xl p-10 shadow-sm border border-black/5 max-w-xl w-full text-center">
                <GraduationCap size={40} className="text-emerald-600 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold mb-2">Prüfung abgeschlossen!</h2>
                <p className="opacity-60 mb-8">Wie möchtest du dein Feedback erhalten?</p>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={handleWrittenFb}
                    className="p-6 rounded-2xl border border-black/5 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-left group"
                  >
                    <PenLine size={28} className="text-emerald-600 mb-3" />
                    <p className="font-semibold mb-1">Schriftlich</p>
                    <p className="text-xs opacity-60">Detailliertes schriftliches Feedback mit Punkteeinschätzung und Tipps.</p>
                  </button>
                  <button
                    onClick={handleOralFb}
                    className="p-6 rounded-2xl border border-black/5 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-left group"
                  >
                    <Volume2 size={28} className="text-emerald-600 mb-3" />
                    <p className="font-semibold mb-1">Mündlich</p>
                    <p className="text-xs opacity-60">Der KI-Prüfer bespricht dein Ergebnis live mit dir.</p>
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
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">{fbText}</div>
                  )}
                </div>
              )}

              {fbType === 'oral' && (
                <div className="bg-white rounded-3xl shadow-xl border border-black/5 overflow-hidden">
                  <div className="p-8 flex flex-col items-center text-center">
                    <div className="mb-6 relative">
                      <motion.div
                        animate={{ scale: status === 'connected' ? [1, 1.08, 1] : 1, opacity: status === 'connected' ? [.3, .6, .3] : .2 }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute inset-0 bg-emerald-500 rounded-full blur-xl"
                      />
                      <div className="relative w-24 h-24 bg-emerald-600 rounded-full flex items-center justify-center text-white shadow-xl">
                        {status === 'connected' ? <Volume2 size={36} /> : <Loader2 size={36} className="animate-spin opacity-50" />}
                      </div>
                    </div>
                    <h2 className="text-lg font-semibold mb-1">Mündliches Feedback</h2>
                    <p className="text-sm opacity-50 mb-6">Der Prüfer bespricht dein Ergebnis mit dir.</p>

                    <div className="w-full max-w-lg bg-[#F9F9F9] rounded-2xl p-5 min-h-[80px] flex flex-col justify-center border border-black/5">
                      {modelTx.length > 0 ? (
                        <p className="text-base leading-relaxed">{modelTx[modelTx.length - 1]}</p>
                      ) : (
                        <p className="text-sm opacity-40 italic">Feedback wird gleich beginnen...</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-[#F9F9F9] p-5 flex justify-end border-t border-black/5">
                    <button onClick={stopFeedback} className="bg-white text-gray-600 border border-black/10 px-5 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all">
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
