/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import {
  Mic, MicOff, GraduationCap, Play, Square, Settings2,
  ChevronDown, Clock, FileText, MessageCircle, Loader2,
  RotateCcw, PenLine, Volume2, ArrowLeft, Download,
  Quote, BarChart3, Image, ChevronUp, X, User,
} from 'lucide-react';
import {
  LiveSession, StatefulLiveSession, SUBJECTS, generateExamMaterial, generateMatheAufgaben, generateMaterialImpulse, generateWrittenFeedback,
  type ExamLevel, type ExamMode, type ExamMaterial, type MaterialImpuls, type PrueferTyp,
} from './lib/live-api';
import { GeoGebraGraph } from './GeoGebraGraph';

const USE_STATEFUL_SESSIONS = false;
import { downloadFeedbackPdf } from './lib/pdf-export';
import { AudioProcessor } from './lib/audio-utils';
import { CURRICULUM, getSchwerpunkte, getAvailableHalbjahre, getMatheStreichbareGebiete, getMatheVerfuegbareGebiete } from './lib/curriculum';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TutorialOverlay, KOLLOQUIUM_TOUR_STEPS, KOLLOQUIUM_STORAGE_KEY } from './TutorialOverlay';
import { ProfileModal } from './ProfileModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ───────── Markdown + LaTeX Hilfsfunktion ───────── */

function renderLatexSegment(text: string, key: number): React.ReactNode {
  // Suche nach LaTeX-Blöcken: $$...$$ (Display) und $...$ (Inline) und \begin{}...\end{}
  const latexPattern = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\begin\{[a-z]+\}[\s\S]*?\\end\{[a-z]+\})/g;
  const parts = text.split(latexPattern);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    if (!part) return null;
    // Display-Mathe: $$...$$
    if (part.startsWith('$$') && part.endsWith('$$')) {
      const tex = part.slice(2, -2).trim();
      try {
        return <span key={`${key}-${i}`} dangerouslySetInnerHTML={{
          __html: katex.renderToString(tex, { displayMode: true, throwOnError: false })
        }} />;
      } catch { return <span key={`${key}-${i}`}>{part}</span>; }
    }
    // Inline-Mathe: $...$
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const tex = part.slice(1, -1).trim();
      try {
        return <span key={`${key}-${i}`} dangerouslySetInnerHTML={{
          __html: katex.renderToString(tex, { displayMode: false, throwOnError: false })
        }} />;
      } catch { return <span key={`${key}-${i}`}>{part}</span>; }
    }
    // \begin{...}...\end{...} Blöcke
    if (part.startsWith('\\begin{')) {
      try {
        return <span key={`${key}-${i}`} dangerouslySetInnerHTML={{
          __html: katex.renderToString(part, { displayMode: true, throwOnError: false })
        }} />;
      } catch { return <span key={`${key}-${i}`}>{part}</span>; }
    }
    return <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>;
  });
}

function renderMarkdown(text: string) {
  // Erst Bold-Markdown auflösen, dann LaTeX
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{renderLatexSegment(part.slice(2, -2), i)}</strong>
      : renderLatexSegment(part, i)
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

  const start = useCallback((fromSeconds?: number) => { setElapsed(fromSeconds ?? 0); setRunning(true); }, []);
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
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

/* ───────── SVG-Charts für Material-Impulse ───────── */

const CHART_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function BarChartSVG({ labels, werte, einheit }: { labels: string[]; werte: number[]; einheit?: string }) {
  const max = Math.max(...werte, 1);
  const barH = 28;
  const gap = 8;
  const labelW = 120;
  const chartW = 300;
  const svgH = labels.length * (barH + gap);

  return (
    <svg viewBox={`0 0 ${labelW + chartW + 60} ${svgH}`} className="w-full max-w-md" role="img" aria-label={`Balkendiagramm: ${labels.map((l, i) => `${l} ${werte[i]}${einheit ? ' ' + einheit : ''}`).join(', ')}`}>
      {labels.map((label, i) => {
        const y = i * (barH + gap);
        const w = (werte[i] / max) * chartW;
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + barH / 2 + 5} textAnchor="end" className="fill-slate-600" fontSize="13">{label}</text>
            <rect x={labelW} y={y} width={w} height={barH} rx={4} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={0.85} />
            <text x={labelW + w + 6} y={y + barH / 2 + 5} className="fill-slate-700 font-medium" fontSize="13">
              {werte[i]}{einheit ? ` ${einheit}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PieChartSVG({ labels, werte, einheit }: { labels: string[]; werte: number[]; einheit?: string }) {
  const total = werte.reduce((a, b) => a + b, 0) || 1;
  const r = 60;
  const cx = 80;
  const cy = 80;
  let cumulative = 0;

  const slices = werte.map((v, i) => {
    const start = cumulative / total;
    cumulative += v;
    const end = cumulative / total;
    const startAngle = start * 2 * Math.PI - Math.PI / 2;
    const endAngle = end * 2 * Math.PI - Math.PI / 2;
    const largeArc = (end - start) > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return <path key={i} d={d} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={0.85} />;
  });

  return (
    <div className="flex items-start gap-4 flex-wrap">
      <svg viewBox="0 0 160 160" className="w-32 h-32 shrink-0" role="img" aria-label={`Kreisdiagramm: ${labels.map((l, i) => `${l} ${werte[i]}${einheit ? ' ' + einheit : ''}`).join(', ')}`}>
        {slices}
      </svg>
      <div className="flex flex-col gap-1 text-sm min-w-0">
        {labels.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-slate-600 truncate">{label}: <strong>{werte[i]}{einheit ? ` ${einheit}` : ''}</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
}

const IMPULS_ICONS: Record<string, React.ReactNode> = {
  zitat: <Quote size={18} />,
  statistik: <BarChart3 size={18} />,
  quelle: <FileText size={18} />,
  schaubild: <Image size={18} />,
};

const IMPULS_LABELS: Record<string, string> = {
  zitat: 'Zitat',
  statistik: 'Statistik',
  quelle: 'Quelle',
  schaubild: 'Schaubild',
};

function MaterialImpulsCard({ impuls, onMinimize }: { impuls: MaterialImpuls; onMinimize: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.97 }}
      className="w-full bg-gradient-to-b from-amber-50 to-white border border-amber-200 rounded-2xl shadow-lg shadow-amber-100/40 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3 bg-amber-100/60 border-b border-amber-200/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-800">
          {IMPULS_ICONS[impuls.typ] || <FileText size={18} />}
          <span className="text-xs font-semibold uppercase tracking-wider">{IMPULS_LABELS[impuls.typ] || 'Material'}</span>
        </div>
        <button
          onClick={onMinimize}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-amber-200/50 transition-colors text-amber-700"
          title="Minimieren"
        >
          <ChevronUp size={18} />
        </button>
      </div>
      {/* Inhalt */}
      <div className="p-5 space-y-3 max-h-[300px] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <h4 className="font-semibold text-slate-800 text-base">{impuls.titel}</h4>
        {impuls.chartDaten && impuls.chartDaten.typ === 'balken' && (
          <BarChartSVG labels={impuls.chartDaten.labels} werte={impuls.chartDaten.werte} einheit={impuls.chartDaten.einheit} />
        )}
        {impuls.chartDaten && impuls.chartDaten.typ === 'kreis' && (
          <PieChartSVG labels={impuls.chartDaten.labels} werte={impuls.chartDaten.werte} einheit={impuls.chartDaten.einheit} />
        )}
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{renderMarkdown(impuls.inhalt)}</p>
        <p className="text-xs text-slate-500 italic">Quelle: {impuls.quellenangabe}</p>
      </div>
    </motion.div>
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

  /* Wiederherstellbare Prüfung aus sessionStorage */
  const [recoveryData, setRecoveryData] = useState<any>(null);

  /* Config state */
  const [step, setStep] = useState<Step>('setup');
  const [showProfile, setShowProfile] = useState(false);
  const [subject, setSubject] = useState(fachFromUrl);
  const [examLevel, setExamLevel] = useState<ExamLevel>('gA');
  const [examMode, setExamMode] = useState<ExamMode>('gesamt');
  const [gestrichen, setGestrichen] = useState('');
  const [spHalbjahr, setSpHalbjahr] = useState('');
  const [schwerpunkt, setSchwerpunkt] = useState('');
  const [customSp, setCustomSp] = useState(false);
  const [customSchwerpunkte, setCustomSchwerpunkte] = useState<Record<string, string[]>>({});

  /* Material */
  const [material, setMaterial] = useState<ExamMaterial | null>(null);

  /* Material-Impulse für den Fragenteil */
  const [matImpulse, setMatImpulse] = useState<MaterialImpuls[]>([]);
  const [activeImpuls, setActiveImpuls] = useState<number | null>(null);
  const [shownImpulse, setShownImpulse] = useState<Set<number>>(new Set());
  const [mitMaterial, setMitMaterial] = useState(true);

  /* Session state */
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'>('disconnected');
  const [modelTx, setModelTx] = useState<string[]>([]);
  const [userTx, setUserTx] = useState<string[]>([]);
  const sessionRef = useRef<LiveSession | StatefulLiveSession | null>(null);
  const micRef = useRef<AudioProcessor | null>(null);

  /* Refs für Transkripte (für Reconnect-Kontext-Wiederherstellung) */
  const modelTxRef = useRef<string[]>([]);
  const userTxRef = useRef<string[]>([]);
  useEffect(() => { modelTxRef.current = modelTx; }, [modelTx]);
  useEffect(() => { userTxRef.current = userTx; }, [userTx]);
  const getTranscripts = useCallback(() => ({ modelTx: modelTxRef.current, userTx: userTxRef.current }), []);

  /* Refs für Audio-Muting (Referat-Phase) */
  const examElapsedRef = useRef(0);
  const modelTxCountRef = useRef(0);

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
  // Mathe: Gebiete statt Halbjahre
  const matheGebiete = isMathe && gestrichen ? getMatheVerfuegbareGebiete(gestrichen) : [];
  const availHJ = !isMathe && gestrichen ? getAvailableHalbjahre(subject, gestrichen as '12/1' | '12/2') : [];
  const spOptions = !isMathe && spHalbjahr
    ? (customSp
        ? (customSchwerpunkte[spHalbjahr] || []).filter(s => s.trim())
        : getSchwerpunkte(subject, spHalbjahr, level))
    : [];
  // Mathe: das eine nicht-gewählte Gebiet; andere Fächer: weitere Halbjahre
  const weitereHJ = isMathe
    ? (schwerpunkt ? matheGebiete.filter(g => g !== schwerpunkt) : matheGebiete)
    : ((gestrichen && spHalbjahr) ? availHJ.filter(h => h !== spHalbjahr) : []);
  const canGenerate = isMathe
    ? !!(subject && gestrichen && schwerpunkt)
    : !!(subject && gestrichen && spHalbjahr && schwerpunkt);

  /* ── elapsed-Ref synchron halten (für Audio-Muting-Callbacks) ── */
  useEffect(() => { examElapsedRef.current = exam.elapsed; }, [exam.elapsed]);

  /** Erzeugt einen Audio-Muting-Callback, der examMode einmalig einfängt.
   *  examMode ändert sich während der Prüfung nie → direktes Capture ist sicher. */
  const makeShouldPlayAudio = (mode: ExamMode) => (): boolean => {
    // Im Fragen-Modus: immer abspielen
    if (mode === 'fragen') return true;
    // Referat/Gesamt: Erste Model-Äußerung (Begrüßung) abspielen
    if (modelTxCountRef.current <= 1) return true;
    // Danach stumm bis Referat-Phase vorbei (10 Min)
    if (mode === 'referat') return false;
    if (examElapsedRef.current < 600) return false;
    return true;
  };

  /* ── Material-Impuls Timer ── */
  useEffect(() => {
    if (step !== 'exam' || matImpulse.length === 0) return;

    // Zeitpunkte im weiteren-HJ-Teil:
    // gesamt: weiterer HJ ab ~15 min → Material 1 bei 18 min, Material 2 bei 25 min
    // fragen: weiterer HJ ab ~5 min → Material 1 bei 8 min, Material 2 bei 15 min
    const offsets = examMode === 'fragen'
      ? [8 * 60, 15 * 60]
      : [18 * 60, 25 * 60];

    offsets.forEach((triggerAt, idx) => {
      if (idx < matImpulse.length && exam.elapsed >= triggerAt && !shownImpulse.has(idx)) {
        setActiveImpuls(idx);
        setShownImpulse(prev => new Set(prev).add(idx));
      }
    });
  }, [step, exam.elapsed, matImpulse, examMode, shownImpulse]);

  /* ── Prüfungs-Wiederherstellung nach Seiten-Reload ── */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('kolloquium_active_exam');
      if (!raw) return;
      const data = JSON.parse(raw);
      // Nur anbieten wenn die Prüfung nicht älter als 30 Minuten ist
      if (Date.now() - data.timestamp > 30 * 60 * 1000) {
        sessionStorage.removeItem('kolloquium_active_exam');
        return;
      }
      setRecoveryData(data);
    } catch { /* ignorieren */ }
  }, []);

  const resumeExam = async () => {
    if (!recoveryData) return;
    const d = recoveryData;
    setRecoveryData(null);

    // State aus dem Backup wiederherstellen
    setSubject(d.subject);
    setExamLevel(d.examLevel);
    setExamMode(d.examMode);
    setSchwerpunkt(d.schwerpunkt);
    setSpHalbjahr(d.spHalbjahr);
    setGestrichen(d.gestrichen || '');
    setExaminerGender(d.examinerGender || 'male');
    setPrueferTyp(d.prueferTyp || 'standard');
    setMaterial(d.material || null);
    setMatImpulse(d.matImpulse || []);
    setModelTx(d.modelTx || []);
    setUserTx(d.userTx || []);

    setStep('exam');

    // Mikrofon initialisieren
    const processor = new AudioProcessor();
    processor.warmup().catch(() => {});
    micRef.current = processor;

    modelTxCountRef.current = (d.modelTx || []).length;
    const SessionClass = USE_STATEFUL_SESSIONS ? StatefulLiveSession : LiveSession;
    const session = new SessionClass({
      subject: d.subject, examLevel: d.examLevel, schwerpunkt: d.schwerpunkt,
      schwerpunktHalbjahr: d.spHalbjahr,
      weitereHalbjahre: d.weitereHJ || [],
      aufgabenstellung: d.material?.aufgabenstellung || '',
      material: d.material?.material || '',
      materialImpulse: d.matImpulse?.length > 0 ? d.matImpulse : undefined,
      examMode: d.examMode, gender: d.examinerGender || 'male',
      prueferTyp: d.prueferTyp || 'standard',
      shouldPlayModelAudio: makeShouldPlayAudio(d.examMode),
      getTranscripts,
      onStatusChange: s => setStatus(s),
      onModelTranscription: t => { modelTxCountRef.current++; setModelTx(prev => [...prev, t]); },
      onUserTranscription: t => setUserTx(prev => [...prev, t]),
    }, processor);
    sessionRef.current = session;
    // Timer bei der gespeicherten Zeit fortsetzen
    exam.start(d.elapsed || 0);
    await session.start();
  };

  const dismissRecovery = () => {
    setRecoveryData(null);
    sessionStorage.removeItem('kolloquium_active_exam');
  };

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

    // Mathe: spHalbjahr = Schwerpunkt-Gebiet (z.B. "Analysis")
    const configHalbjahr = isMathe ? schwerpunkt : spHalbjahr;

    // "Fragen" mode: skip referat material generation + prep
    if (examMode === 'fragen') {
      // Material-Impulse generieren (falls aktiviert)
      let impulse: MaterialImpuls[] = [];
      if (mitMaterial) {
        setStep('generating');
        try {
          impulse = await generateMaterialImpulse({
            subject, examLevel: level, schwerpunkt, schwerpunktHalbjahr: configHalbjahr, weitereHalbjahre: weitereHJ, isMathe,
          });
        } catch { impulse = []; }
        setMatImpulse(impulse);
      }
      setActiveImpuls(null);
      setShownImpulse(new Set());

      setMaterial({ aufgabenstellung: '', material: '', hinweise: '' });
      setStep('exam');
      setModelTx([]);
      setUserTx([]);

      // Mikrofon parallel zum WebSocket-Aufbau initialisieren
      const processor = new AudioProcessor();
      processor.warmup().catch(() => {});
      micRef.current = processor;

      modelTxCountRef.current = 0;
      const SessionClass = USE_STATEFUL_SESSIONS ? StatefulLiveSession : LiveSession;
      const session = new SessionClass({
        subject, examLevel: level, schwerpunkt, schwerpunktHalbjahr: configHalbjahr,
        weitereHalbjahre: weitereHJ, aufgabenstellung: '', material: '',
        materialImpulse: impulse.length > 0 ? impulse : undefined,
        examMode, gender, prueferTyp, shouldPlayModelAudio: makeShouldPlayAudio(examMode),
        getTranscripts,
        onStatusChange: s => setStatus(s),
        onModelTranscription: t => { modelTxCountRef.current++; setModelTx(prev => [...prev, t]); },
        onUserTranscription: t => setUserTx(prev => [...prev, t]),
      }, processor);
      sessionRef.current = session;
      exam.start();
      await session.start();
      return;
    }

    setStep('generating');
    setActiveImpuls(null);
    setShownImpulse(new Set());
    try {
      // Material + Impulse parallel generieren
      const examConfigForGen = { subject, examLevel: level, schwerpunkt, schwerpunktHalbjahr: configHalbjahr, weitereHalbjahre: weitereHJ, isMathe };
      const promises: [Promise<ExamMaterial>, Promise<MaterialImpuls[]>] = [
        isMathe ? generateMatheAufgaben(examConfigForGen) : generateExamMaterial(examConfigForGen),
        mitMaterial ? generateMaterialImpulse(examConfigForGen) : Promise.resolve([]),
      ];
      const [m, impulse] = await Promise.all(promises);
      setMaterial(m);
      setMatImpulse(impulse);
    } catch {
      if (isMathe) {
        setMaterial({
          aufgabenstellung: `Erläutern Sie grundlegende Konzepte des Gebiets ${schwerpunkt}. Gehen Sie auf zentrale Definitionen, Sätze und Rechenverfahren ein.`,
          material: `Gebiet: ${schwerpunkt}`,
          hinweise: 'Sie haben 30 Minuten Vorbereitungszeit. Notieren Sie sich Lösungswege und Ergebnisse.',
        });
      } else {
        setMaterial({
          aufgabenstellung: `Erläutern Sie den Schwerpunkt "${schwerpunkt}" im Kontext des Halbjahres ${spHalbjahr}. Gehen Sie dabei auf zentrale Begriffe, Zusammenhänge und aktuelle Bezüge ein. Nehmen Sie abschließend kritisch Stellung.`,
          material: `Material 1 – Fachlicher Impuls:\nSetzen Sie sich mit dem Themenbereich "${schwerpunkt}" auseinander. Berücksichtigen Sie dabei die im Unterricht behandelten Fachtexte, Modelle und Theorien.\n\nMaterial 2 – Transferaufgabe:\nReflektieren Sie, inwiefern die zentralen Konzepte aus "${schwerpunkt}" auf aktuelle gesellschaftliche oder wissenschaftliche Fragestellungen übertragen werden können. Beziehen Sie eigene Beispiele ein.`,
          hinweise: 'Strukturieren Sie Ihr Referat klar in Einleitung, Hauptteil und Schluss. Beziehen Sie die Materialien in Ihren Vortrag ein. Planen Sie ca. 10 Minuten für den Vortrag.',
        });
      }
      setMatImpulse([]);
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

    modelTxCountRef.current = 0;
    const SessionClass = USE_STATEFUL_SESSIONS ? StatefulLiveSession : LiveSession;
    const configHj = isMathe ? schwerpunkt : spHalbjahr;
    const session = new SessionClass({
      subject, examLevel: level, schwerpunkt, schwerpunktHalbjahr: configHj,
      weitereHalbjahre: weitereHJ, aufgabenstellung: material.aufgabenstellung, material: material.material,
      materialImpulse: matImpulse.length > 0 ? matImpulse : undefined,
      examMode, gender: examinerGender, prueferTyp, shouldPlayModelAudio: makeShouldPlayAudio(examMode),
      getTranscripts,
      onStatusChange: s => setStatus(s),
      onModelTranscription: t => { modelTxCountRef.current++; setModelTx(prev => [...prev, t]); },
      onUserTranscription: t => setUserTx(prev => [...prev, t]),
    }, processor);
    sessionRef.current = session;
    exam.start();
    await session.start();
  };

  const stopExam = () => {
    // Transkripte sichern bevor Session gestoppt wird (für Feedback)
    try {
      sessionStorage.setItem('kolloquium_transcript_backup', JSON.stringify({
        modelTx, userTx, timestamp: Date.now(),
      }));
    } catch { /* sessionStorage voll */ }

    sessionRef.current?.stop();
    sessionRef.current = null;
    exam.stop();
    setStatus('disconnected');
    setStep('feedback-choice');
    sessionStorage.removeItem('kolloquium_active_exam');
  };

  /** Transkript-Fallback: Lokal → sessionStorage-Backup → Server (StatefulLiveSession) */
  const getTranscriptsWithFallback = async (): Promise<{ mTx: string[]; uTx: string[] }> => {
    // 1) Lokale Transkripte
    if (modelTx.length > 0 || userTx.length > 0) return { mTx: [...modelTx], uTx: [...userTx] };
    // 2) sessionStorage-Backup
    try {
      const backup = JSON.parse(sessionStorage.getItem('kolloquium_transcript_backup') || '{}');
      if (backup.modelTx?.length > 0) return { mTx: backup.modelTx, uTx: backup.userTx || [] };
    } catch { /* ignorieren */ }
    // 3) Server-Transkript (StatefulLiveSession)
    if (sessionRef.current && 'getServerTranscript' in sessionRef.current) {
      const entries = await (sessionRef.current as StatefulLiveSession).getServerTranscript();
      if (entries.length > 0) {
        return {
          mTx: entries.filter(e => e.role === 'pruefer').map(e => e.text),
          uTx: entries.filter(e => e.role === 'pruefling').map(e => e.text),
        };
      }
    }
    return { mTx: [], uTx: [] };
  };

  const handleWrittenFb = async () => {
    setFbType('written');
    setFbLoading(true);
    setStep('feedback');

    const { mTx, uTx } = await getTranscriptsWithFallback();
    if (mTx.length === 0 && uTx.length === 0) {
      setFbText('Leider konnte kein Prüfungstranskript aufgezeichnet werden. Feedback ist nur möglich, wenn die Prüfung vollständig durchgeführt wurde. Bitte starte eine neue Prüfung.');
      setFbLoading(false);
      return;
    }

    // 3 Versuche mit Backoff
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const fb = await generateWrittenFeedback({
          subject, examLevel: level, schwerpunkt, modelTranscription: mTx, userTranscription: uTx,
          materialImpulse: matImpulse.length > 0 ? matImpulse : undefined,
        });
        setFbText(fb);
        setFbLoading(false);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Unbekannter Fehler';
        console.error(`Feedback-Versuch ${attempt + 1} fehlgeschlagen:`, err);
        if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    setFbText(`Feedback konnte nach 3 Versuchen nicht generiert werden (${lastError}). Bitte versuche es erneut oder starte eine neue Prüfung.`);
    setFbLoading(false);
  };

  const handleOralFb = async () => {
    setFbType('oral');
    setStep('feedback');

    // Transkript sichern BEVOR modelTx geleert wird
    const { mTx, uTx } = await getTranscriptsWithFallback();
    const transcript = mTx.map((m, i) => {
      const u = uTx[i] || '';
      return `${u ? `Prüfling: ${u}\n` : ''}Prüfer: ${m}`;
    }).join('\n');

    if (!transcript.trim()) {
      setModelTx(['Leider konnte kein Prüfungstranskript aufgezeichnet werden. Mündliches Feedback ist nur möglich, wenn die Prüfung vollständig durchgeführt wurde. Bitte starte eine neue Prüfung.']);
      return;
    }

    setModelTx([]); // Jetzt erst leeren für neue Feedback-Transkription

    const SessionClass = USE_STATEFUL_SESSIONS ? StatefulLiveSession : LiveSession;
    const session = new SessionClass({
      subject, examLevel: level, schwerpunkt, schwerpunktHalbjahr: spHalbjahr,
      weitereHalbjahre: weitereHJ, aufgabenstellung: material?.aufgabenstellung || '',
      material: material?.material || '',
      gender: examinerGender, feedbackMode: true, examTranscript: transcript,
      getTranscripts,
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
    modelTxCountRef.current = 0;
    setStep('setup');
    setStatus('disconnected');
    setModelTx([]);
    setUserTx([]);
    setMaterial(null);
    setMatImpulse([]);
    setActiveImpuls(null);
    setShownImpulse(new Set());
    setMitMaterial(true);
    setFbType(null);
    setFbText('');
    setExamMode('gesamt');
    setPrueferTyp('standard');
    setGestrichen('');
    setSpHalbjahr('');
    setSchwerpunkt('');
    prep.reset(30 * 60);
    sessionStorage.removeItem('kolloquium_active_exam');
    sessionStorage.removeItem('kolloquium_transcript_backup');
  };

  /* ── Prüfungsstatus in sessionStorage sichern (für Wiederherstellung nach Reload) ── */
  useEffect(() => {
    if (step !== 'exam') return;
    const save = () => {
      try {
        sessionStorage.setItem('kolloquium_active_exam', JSON.stringify({
          subject, examLevel: level, examMode, schwerpunkt, spHalbjahr,
          weitereHJ, gestrichen, material, matImpulse,
          modelTx, userTx, elapsed: exam.elapsed,
          examinerGender, prueferTyp, timestamp: Date.now(),
        }));
      } catch { /* sessionStorage voll */ }
    };
    save();
    const interval = setInterval(save, 15_000);
    return () => clearInterval(interval);
  }, [step, exam.elapsed, modelTx, userTx, subject, level, examMode, schwerpunkt, spHalbjahr, weitereHJ, gestrichen, material, matImpulse, examinerGender, prueferTyp]);

  /* ── Bei Verbindungsfehler sofort Transkripte sichern ── */
  useEffect(() => {
    if (step !== 'exam' || (status !== 'error' && status !== 'reconnecting')) return;
    try {
      sessionStorage.setItem('kolloquium_active_exam', JSON.stringify({
        subject, examLevel: level, examMode, schwerpunkt, spHalbjahr,
        weitereHJ, gestrichen, material, matImpulse,
        modelTx, userTx, elapsed: exam.elapsed,
        examinerGender, prueferTyp, timestamp: Date.now(),
      }));
      sessionStorage.setItem('kolloquium_transcript_backup', JSON.stringify({
        modelTx, userTx, timestamp: Date.now(),
      }));
    } catch { /* sessionStorage voll */ }
  }, [status]);

  /* ───────── RENDER ───────── */

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100 text-slate-800 font-sans selection:bg-emerald-200/50">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/70 border-b border-white/50 transition-all w-full">
        <div className="max-w-4xl mx-auto py-4 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); sessionRef.current?.stop(); window.location.href = '/'; }}
              className="w-11 h-11 bg-white/80 backdrop-blur-sm rounded-xl flex items-center justify-center border border-black/5 hover:bg-white hover:shadow-sm transition-all shadow-sm"
              aria-label="Zurück zur Startseite"
            >
              <ArrowLeft size={20} className="opacity-60" aria-hidden="true" />
            </a>
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 ring-1 ring-black/5 ring-inset">
              <GraduationCap size={24} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600">Kolloquium Trainer</h1>
          </div>

          <div className="flex items-center gap-3">
            {step !== 'setup' && step !== 'generating' && step === 'exam' && (
              <span className="text-xs font-medium opacity-50 uppercase tracking-wider hidden sm:block">
                {PHASE_LABELS[exam.phase]}
              </span>
            )}
            {step !== 'setup' && step !== 'generating' && (step === 'exam' || (step === 'feedback' && fbType === 'oral')) && (
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
            <button
              onClick={() => setShowProfile(true)}
              className="w-11 h-11 bg-white/80 backdrop-blur-sm rounded-xl flex items-center justify-center border border-black/5 hover:bg-white hover:shadow-sm transition-all shadow-sm"
              aria-label="Profil öffnen"
            >
              <User size={18} className="opacity-60" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      <main className="max-w-4xl mx-auto px-6 py-10 relative z-0">
        <AnimatePresence mode="wait">

          {/* ════════ SETUP ════════ */}
          {step === 'setup' && (
            <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="grid gap-8">
              <TutorialOverlay steps={KOLLOQUIUM_TOUR_STEPS} storageKey={KOLLOQUIUM_STORAGE_KEY} />

              {/* ── Recovery-Banner: Unterbrochene Prüfung fortsetzen ── */}
              {recoveryData && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-amber-50/90 backdrop-blur-md p-5 rounded-2xl border border-amber-200/60 shadow-lg shadow-amber-100/30"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg text-amber-600 shrink-0 mt-0.5">
                      <RotateCcw size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-amber-900 text-sm">Unterbrochene Prüfung gefunden</h3>
                      <p className="text-xs text-amber-700 mt-1">
                        {recoveryData.subject} – {recoveryData.schwerpunkt}
                        {' '}({Math.floor((recoveryData.elapsed || 0) / 60)} Min. gelaufen)
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={resumeExam}
                      className="flex-1 py-3 px-4 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors"
                    >
                      Prüfung fortsetzen
                    </button>
                    <button
                      onClick={dismissRecovery}
                      className="py-3 px-4 bg-white/80 border border-amber-200 rounded-xl text-sm text-amber-700 hover:bg-white transition-colors"
                    >
                      Verwerfen
                    </button>
                  </div>
                </motion.div>
              )}

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
                        aria-label="Prüfungsfach auswählen"
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

                  {/* ── Mathe: Gebiet ausschließen ── */}
                  {isMathe && subject && CURRICULUM[subject] && (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Gebiet ausschließen</label>
                        <p className="text-xs opacity-50 ml-1 -mt-1">Welches Gebiet möchtest du ausschließen? (Analysis ist immer dabei)</p>
                        <div className="flex gap-3">
                          {getMatheStreichbareGebiete().map(g => (
                            <Pill key={g} active={gestrichen === g} onClick={() => { setGestrichen(g); setSchwerpunkt(''); }} className="flex-1 text-center">
                              <span className="font-medium">{g}</span>
                            </Pill>
                          ))}
                        </div>
                      </div>
                      {/* ── Mathe: Schwerpunkt wählen ── */}
                      {gestrichen && (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Schwerpunkt wählen</label>
                          <p className="text-xs opacity-50 ml-1 -mt-1">Aus welchem Gebiet kommen deine Aufgaben für den Vortrag?</p>
                          <div className="flex gap-3">
                            {matheGebiete.map(g => (
                              <Pill key={g} active={schwerpunkt === g} onClick={() => setSchwerpunkt(g)} className="flex-1 text-center">
                                <span className="font-medium">{g}</span>
                              </Pill>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Andere Fächer: Halbjahr streichen + Schwerpunkte ── */}
                  {!isMathe && subject && CURRICULUM[subject] && (
                    <>
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
                    </>
                  )}

                  {/* Prüfungsmodus */}
                  {schwerpunkt && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Prüfungsmodus</label>
                      <p className="text-xs opacity-50 ml-1 -mt-1">Was möchtest du üben?</p>
                      <div className="grid gap-2">
                        <Pill active={examMode === 'gesamt'} onClick={() => setExamMode('gesamt')} className="w-full">
                          <span className="font-medium">Gesamte Prüfung</span>
                          <span className="block text-xs opacity-60 mt-0.5">{isMathe ? `Vortrag + Fragen ${schwerpunkt} (15 Min) · Fragen ${weitereHJ[0]} (15 Min)` : 'Kurzreferat + Fragen zum Schwerpunkt + Fragen zu weiteren Halbjahren (ca. 30 Min)'}</span>
                        </Pill>
                        <Pill active={examMode === 'referat'} onClick={() => setExamMode('referat')} className="w-full">
                          <span className="font-medium">{isMathe ? 'Nur Aufgaben-Vortrag' : 'Nur Kurzreferat'}</span>
                          <span className="block text-xs opacity-60 mt-0.5">{isMathe ? `Vorbereitung + Aufgaben-Vortrag zu ${schwerpunkt} (10 Min)` : 'Vorbereitung + Kurzreferat mit Feedback (ca. 10 Min)'}</span>
                        </Pill>
                        <Pill active={examMode === 'fragen'} onClick={() => setExamMode('fragen')} className="w-full">
                          <span className="font-medium">Nur Fragenteil</span>
                          <span className="block text-xs opacity-60 mt-0.5">{isMathe ? `Fragen ${schwerpunkt} (5 Min) + Fragen ${weitereHJ[0]} (15 Min), ohne Vortrag` : 'Fragen zum Schwerpunkt + weitere Halbjahre, ohne Referat (ca. 20 Min)'}</span>
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
                  {/* Materialimpulse Toggle — nur bei gesamt/fragen */}
                  {schwerpunkt && examMode !== 'referat' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest opacity-40 ml-1">Materialimpulse</label>
                      <p className="text-xs opacity-50 ml-1 -mt-1">Sollen im Fragenteil Materialien (Statistik, Zitat etc.) eingeblendet werden?</p>
                      <div className="flex gap-3">
                        <Pill active={mitMaterial} onClick={() => setMitMaterial(true)} className="flex-1 text-center">
                          <span className="font-medium">Mit Material</span>
                          <span className="block text-xs opacity-60 mt-0.5">1–2 Materialien im weiteren-HJ-Teil</span>
                        </Pill>
                        <Pill active={!mitMaterial} onClick={() => setMitMaterial(false)} className="flex-1 text-center">
                          <span className="font-medium">Ohne Material</span>
                          <span className="block text-xs opacity-60 mt-0.5">Nur mündliche Fragen</span>
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
                      {subject} ({level}) · {examMode === 'gesamt' ? 'Gesamte Prüfung' : examMode === 'referat' ? (isMathe ? 'Nur Vortrag' : 'Nur Referat') : 'Nur Fragen'} · {prueferTyp !== 'standard' ? `Prüfertyp: ${prueferTyp} · ` : ''}{isMathe ? <>Schwerpunkt: <em>{schwerpunkt}</em> · Teil 2: {weitereHJ[0]} · Ausgeschlossen: {gestrichen}</> : <>Schwerpunkt aus {spHalbjahr}: <em>{schwerpunkt}</em> · Gestrichen: {gestrichen} · Teil 2: {weitereHJ.join(', ')}</>}
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
                    <p className="text-sm opacity-60">{isMathe ? 'Bearbeite die Aufgaben und bereite deinen Vortrag vor!' : 'Erstelle dein Kurzreferat. Kein ausformuliertes Manuskript!'}</p>
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
                {material.grafiken && material.grafiken.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {material.grafiken.map((g, i) => (
                      <GeoGebraGraph key={i} grafik={g} />
                    ))}
                  </div>
                )}
              </div>

              {/* Hinweise */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-100/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
                <h3 className="font-semibold text-sm uppercase tracking-wider text-amber-700 mb-2">Hinweise</h3>
                <p className="text-sm text-amber-800 opacity-80 whitespace-pre-wrap">{renderMarkdown(material.hinweise)}</p>
              </div>

              {/* KI-Hinweis */}
              <p className="flex items-center gap-1.5 text-xs text-slate-400 px-1">
                🤖 KI-generiert – Inhalte können Fehler enthalten.
              </p>

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
                  <div className="flex items-center gap-2">
                    {/* Material-Chips (minimierte Materialien) */}
                    {matImpulse.map((m, idx) => (
                      shownImpulse.has(idx) && activeImpuls !== idx ? (
                        <button
                          key={idx}
                          onClick={() => setActiveImpuls(idx)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 hover:bg-amber-100 transition-colors min-h-[44px]"
                          aria-label={`Material ${idx + 1} anzeigen`}
                        >
                          <span aria-hidden="true">{IMPULS_ICONS[m.typ] || <FileText size={14} />}</span>
                          <span className="text-xs font-medium">M{idx + 1}</span>
                        </button>
                      ) : null
                    ))}
                    <span className="text-sm font-mono font-bold text-emerald-600 tabular-nums">{exam.display}</span>
                  </div>
                </div>

                {/* Reconnect-Hinweis */}
                {(status === 'reconnecting' || status === 'error') && (
                  <div role="alert" aria-live="assertive" className={cn(
                    "mx-6 mt-4 px-4 py-3 rounded-xl text-sm flex items-center gap-3",
                    status === 'reconnecting'
                      ? "bg-amber-50 border border-amber-200 text-amber-800"
                      : "bg-red-50 border border-red-200 text-red-800",
                  )}>
                    {status === 'reconnecting' ? (
                      <Loader2 size={16} className="animate-spin shrink-0" />
                    ) : (
                      <X size={16} className="shrink-0" />
                    )}
                    <span className="flex-1">
                      {status === 'reconnecting'
                        ? 'Verbindung wird wiederhergestellt... Das Gespräch wird nahtlos fortgesetzt.'
                        : 'Verbindung verloren. Dein bisheriges Gespräch ist gespeichert.'}
                    </span>
                    {status === 'error' && (
                      <button
                        onClick={() => sessionRef.current?.retryConnect()}
                        className="shrink-0 px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
                      >
                        Erneut verbinden
                      </button>
                    )}
                  </div>
                )}

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
                      {status === 'connected' ? <Mic size={48} aria-hidden="true" /> : <MicOff size={48} className="opacity-50" aria-hidden="true" />}
                      <span className="sr-only">{status === 'connected' ? 'Mikrofon aktiv' : 'Mikrofon inaktiv'}</span>
                    </motion.div>
                  </div>

                  <h2 className="text-xl font-semibold mb-1 text-slate-800">{subject}</h2>
                  <div className="flex items-center gap-2 mb-2 flex-wrap justify-center">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{level}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">SP: {spHalbjahr}</span>
                  </div>
                  <p className="text-emerald-600 font-medium text-sm mb-6">{schwerpunkt}</p>

                  {/* Transcription */}
                  <div className="w-full max-w-lg bg-gradient-to-b from-slate-50 to-white shadow-inner rounded-2xl p-6 min-h-[120px] flex flex-col justify-center border border-black/5 relative overflow-hidden" aria-live="polite" aria-atomic="true">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-100 to-transparent opacity-50" />
                    {status === 'reconnecting' ? (
                      <div className="text-center">
                        <Loader2 size={24} className="text-amber-500 animate-spin mx-auto mb-3" />
                        <p className="text-sm text-amber-600 font-medium">Verbindung wird wiederhergestellt...</p>
                        <p className="text-xs text-amber-500 mt-1">Das Gespräch wird fortgesetzt. Bitte einen Moment Geduld.</p>
                      </div>
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
                    ) : status === 'connected' ? (
                      <div className="text-center">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse mx-auto mb-3" />
                        <p className="text-sm opacity-50">{examinerGender === 'female' ? 'Die' : 'Der'} {prüferLabel} hört zu.</p>
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

                  {/* Material-Impuls Card */}
                  <AnimatePresence>
                    {activeImpuls !== null && matImpulse[activeImpuls] && (
                      <div className="w-full max-w-lg mt-4">
                        <MaterialImpulsCard
                          impuls={matImpulse[activeImpuls]}
                          onMinimize={() => setActiveImpuls(null)}
                        />
                      </div>
                    )}
                  </AnimatePresence>
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
                    <div className="flex flex-col items-center py-12" role="status" aria-live="polite">
                      <Loader2 size={36} className="text-emerald-600 animate-spin mb-4" aria-hidden="true" />
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

                    <div className="w-full max-w-lg bg-gradient-to-b from-slate-50 to-white shadow-inner rounded-2xl p-6 min-h-[100px] flex flex-col justify-center border border-black/5 relative overflow-hidden" aria-live="polite" aria-atomic="true">
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
    </MotionConfig>
  );
}
