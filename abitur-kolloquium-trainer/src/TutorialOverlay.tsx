import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface TutorialStep {
  type?: 'welcome';
  target?: string;
  title: string;
  text: string;
  pos?: 'top' | 'bottom' | 'left' | 'right';
}

interface TutorialOverlayProps {
  steps: TutorialStep[];
  storageKey: string;
  onComplete?: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export function TutorialOverlay({ steps, storageKey, onComplete }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // Fokus beim Öffnen merken und beim Schließen wiederherstellen
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Tour nur zeigen wenn noch nicht abgeschlossen
  useEffect(() => {
    if (!localStorage.getItem(storageKey)) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setVisible(true);
    }
  }, [storageKey]);

  // Fokus in Tooltip setzen wenn Schritt wechselt
  useEffect(() => {
    if (!visible) return;
    // Kurz warten bis Animation abgeschlossen
    const t = setTimeout(() => {
      tooltipRef.current?.focus();
    }, 100);
    return () => clearTimeout(t);
  }, [visible, currentStep]);

  // Ziel-Element finden und Rect berechnen
  useEffect(() => {
    if (!visible) return;
    const step = steps[currentStep];
    if (!step || step.type === 'welcome') {
      setTargetRect(null);
      return;
    }
    if (step.target) {
      const el = document.querySelector(step.target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Kurz warten bis Scroll abgeschlossen
        const timer = setTimeout(() => {
          const rect = el.getBoundingClientRect();
          setTargetRect({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            bottom: rect.bottom,
            right: rect.right,
          });
        }, 300);
        return () => clearTimeout(timer);
      }
    }
    setTargetRect(null);
  }, [visible, currentStep, steps]);

  const endTour = useCallback(() => {
    localStorage.setItem(storageKey, '1');
    setVisible(false);
    onComplete?.();
    // Fokus zurücksetzen
    previousFocusRef.current?.focus();
  }, [storageKey, onComplete]);

  const nextStep = useCallback(() => {
    if (currentStep >= steps.length - 1) {
      endTour();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, steps.length, endTour]);

  // Tastatur-Navigation
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); nextStep(); }
      if (e.key === 'ArrowLeft' && currentStep > 0) { e.preventDefault(); setCurrentStep(prev => prev - 1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, endTour, nextStep, currentStep]);

  if (!visible || steps.length === 0) return null;

  const step = steps[currentStep];
  const isWelcome = step.type === 'welcome';
  const isLast = currentStep === steps.length - 1;
  const pad = 8;

  // Tooltip-Position berechnen
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect || isWelcome) return {};
    const pos = step.pos || 'bottom';
    const style: React.CSSProperties = { position: 'fixed' };

    if (pos === 'bottom') {
      style.top = targetRect.bottom + pad + 8;
      style.left = targetRect.left + targetRect.width / 2;
      style.transform = 'translateX(-50%)';
    } else if (pos === 'top') {
      style.bottom = window.innerHeight - targetRect.top + pad + 8;
      style.left = targetRect.left + targetRect.width / 2;
      style.transform = 'translateX(-50%)';
    } else if (pos === 'left') {
      style.top = targetRect.top + targetRect.height / 2;
      style.right = window.innerWidth - targetRect.left + pad + 8;
      style.transform = 'translateY(-50%)';
    } else if (pos === 'right') {
      style.top = targetRect.top + targetRect.height / 2;
      style.left = targetRect.right + pad + 8;
      style.transform = 'translateY(-50%)';
    }

    return style;
  };

  // Screenreader-Ankündigung des aktuellen Schritts
  const stepAnnouncement = `Schritt ${currentStep + 1} von ${steps.length}: ${step.title}`;

  return (
    <div
      className="fixed inset-0 z-[10000]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorialTitle"
    >
      {/* Screenreader-Live-Region für Schritt-Wechsel */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {stepAnnouncement}
      </div>

      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/50"
        onClick={endTour}
        aria-hidden="true"
      />

      {/* Spotlight */}
      {targetRect && !isWelcome && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="fixed rounded-xl pointer-events-none"
          aria-hidden="true"
          style={{
            top: targetRect.top - pad,
            left: targetRect.left - pad,
            width: targetRect.width + pad * 2,
            height: targetRect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            zIndex: 10001,
          }}
        />
      )}

      {/* Welcome-Modal oder Tooltip */}
      <AnimatePresence mode="wait">
        {isWelcome ? (
          <motion.div
            key={`welcome-${currentStep}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 flex items-center justify-center z-[10002]"
          >
            <div
              ref={tooltipRef}
              tabIndex={-1}
              className="bg-white rounded-3xl p-8 max-w-md w-[90%] text-center shadow-2xl outline-none"
            >
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="text-xs font-semibold text-emerald-600/60" aria-hidden="true">
                  {currentStep + 1}/{steps.length}
                </span>
                {/* Fortschritts-Punkte mit Beschriftung */}
                <div className="flex gap-1" role="group" aria-label={`Tour-Fortschritt: Schritt ${currentStep + 1} von ${steps.length}`}>
                  {steps.map((_, i) => (
                    <span
                      key={i}
                      aria-current={i === currentStep ? 'step' : undefined}
                      className={`w-1.5 h-1.5 rounded-full ${i === currentStep ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    />
                  ))}
                </div>
              </div>
              <h2 id="tutorialTitle" className="text-xl font-semibold text-slate-800 mb-2">{step.title}</h2>
              <p className="text-sm text-slate-500 leading-relaxed mb-6">{step.text}</p>
              <div className="flex items-center justify-between">
                <button
                  onClick={endTour}
                  className="text-xs text-slate-400 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-emerald-500 focus-visible:outline-offset-2 transition-colors px-3 py-2 min-h-[44px]"
                >
                  Tour überspringen
                </button>
                <button
                  onClick={nextStep}
                  className="bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 transition-colors min-h-[44px]"
                >
                  Los geht's
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`tooltip-${currentStep}`}
            ref={tooltipRef}
            tabIndex={-1}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="z-[10002] bg-white rounded-2xl p-5 max-w-xs shadow-xl border border-slate-100 outline-none"
            style={getTooltipStyle()}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-emerald-600/60" aria-hidden="true">
                {currentStep + 1}/{steps.length}
              </span>
              <div className="flex gap-1" role="group" aria-label={`Tour-Fortschritt: Schritt ${currentStep + 1} von ${steps.length}`}>
                {steps.map((_, i) => (
                  <span
                    key={i}
                    aria-current={i === currentStep ? 'step' : undefined}
                    className={`w-1.5 h-1.5 rounded-full ${i === currentStep ? 'bg-emerald-500' : 'bg-slate-200'}`}
                  />
                ))}
              </div>
            </div>
            <h3 id="tutorialTitle" className="text-base font-medium text-slate-800 mb-1">{step.title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-4">{step.text}</p>
            <div className="flex items-center justify-between">
              <button
                onClick={endTour}
                className="text-xs text-slate-400 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-emerald-500 focus-visible:outline-offset-2 transition-colors px-2 py-1 min-h-[44px]"
              >
                Überspringen
              </button>
              <button
                onClick={nextStep}
                className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 transition-colors min-h-[44px]"
              >
                {isLast ? 'Fertig' : 'Weiter'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Tour-Schritte für den Kolloquiumstrainer
export const KOLLOQUIUM_TOUR_STEPS: TutorialStep[] = [
  {
    type: 'welcome',
    title: 'Kolloquiumstrainer',
    text: 'Übe mündliche Prüfungen mit einem KI-Prüfer. Du sprichst per Mikrofon — wie im echten Kolloquium.',
  },
  {
    target: 'select',
    title: 'Fach wählen',
    text: 'Wähle das Fach, in dem du das Kolloquium ablegen möchtest.',
    pos: 'bottom',
  },
  {
    target: '[class*="flex gap-3"]:has([class*="flex-1 text-center"])',
    title: 'Halbjahr streichen',
    text: 'Wähle, welches Halbjahr du streichst (nur 12/1 oder 12/2). Die Schwerpunkte passen sich automatisch an.',
    pos: 'bottom',
  },
];

export const KOLLOQUIUM_STORAGE_KEY = 'kolloquium_tour_done';
