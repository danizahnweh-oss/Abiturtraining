/**
 * GeoGebraGraph – React-Komponente für interaktive Mathematik-Graphen.
 * Lädt deployggb.js von GeoGebra lazy (nur einmal pro Seite).
 */

import React, { useEffect, useRef, useState } from 'react';

export interface GeoGebraGrafik {
  id: string;
  type: 'graphing' | '3d' | 'probability';
  commands: string[];
}

// Globaler Lazy-Loader-Zustand
let ggbScriptLoaded = false;
let ggbScriptLoading = false;
const ggbLoadCallbacks: Array<() => void> = [];
let ggbCounter = 0;

function loadGeoGebraScript(): Promise<void> {
  return new Promise(resolve => {
    if (ggbScriptLoaded) { resolve(); return; }
    ggbLoadCallbacks.push(resolve);
    if (ggbScriptLoading) return;
    ggbScriptLoading = true;
    const s = document.createElement('script');
    s.src = 'https://www.geogebra.org/apps/deployggb.js';
    const timeout = setTimeout(() => {
      ggbScriptLoading = false;
      ggbLoadCallbacks.forEach(cb => cb());
      ggbLoadCallbacks.length = 0;
    }, 10000);
    s.onload = () => {
      clearTimeout(timeout);
      ggbScriptLoaded = true;
      ggbScriptLoading = false;
      ggbLoadCallbacks.forEach(cb => cb());
      ggbLoadCallbacks.length = 0;
    };
    s.onerror = () => {
      clearTimeout(timeout);
      ggbScriptLoading = false;
      ggbLoadCallbacks.forEach(cb => cb());
      ggbLoadCallbacks.length = 0;
    };
    document.head.appendChild(s);
  });
}

/** Passt den sichtbaren Koordinatenbereich automatisch an die gezeichneten Objekte an. */
function autoFit(api: any, type: string) {
  if (type === '3d' || type === 'probability') return;
  const names: string[] = api.getAllObjectNames() || [];
  const ax: number[] = [], ay: number[] = [];
  for (const name of names) {
    const t = api.getObjectType(name);
    if (t === 'point') {
      const px = api.getXcoord(name), py = api.getYcoord(name);
      if (isFinite(px) && isFinite(py)) { ax.push(px); ay.push(py); }
    } else if (t === 'function') {
      for (let x = -20; x <= 20; x += 0.25) {
        const y = api.getValue(`${name}(${x})`);
        if (isFinite(y)) { ax.push(x); ay.push(y); }
      }
    }
  }
  if (ax.length < 2) return;
  const xlo = Math.min(...ax), xhi = Math.max(...ax);
  const ylo = Math.min(...ay), yhi = Math.max(...ay);
  const xp = Math.max((xhi - xlo) * 0.12, 1);
  const yp = Math.max((yhi - ylo) * 0.15, 0.5);
  api.setCoordSystem(
    Math.min(xlo - xp, -1), Math.max(xhi + xp, 1),
    Math.min(ylo - yp, -0.5), Math.max(yhi + yp, 0.5)
  );
}

interface Props {
  grafik: GeoGebraGrafik;
}

export function GeoGebraGraph({ grafik }: Props) {
  const containerId = useRef(`ggb_koll_${ggbCounter++}`);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      await loadGeoGebraScript();
      if (cancelled) return;

      const GGBApplet = (window as any).GGBApplet;
      if (!GGBApplet) { setStatus('error'); return; }

      const appName = ({ graphing: 'graphing', '3d': '3d', probability: 'probability' })[grafik.type] ?? 'graphing';
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const container = document.getElementById(containerId.current);
      if (!container) return;

      const params = {
        appName,
        width: container.clientWidth || 320,
        height: grafik.type === '3d' ? 380 : 300,
        showToolBar: false,
        showAlgebraInput: false,
        showMenuBar: false,
        enableRightClick: false,
        enableShiftDragZoom: true,
        enableLabelDrags: false,
        showResetIcon: false,
        showZoomButtons: true,
        scaleContainerClass: 'ggb-koll-container',
        allowUpscale: true,
        language: 'de',
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
        appletOnLoad: (api: any) => {
          if (cancelled) return;
          try {
            if (api.setErrorDialogsActive) api.setErrorDialogsActive(false);
            // Alle Objekte schwarz zeichnen
            for (const cmd of grafik.commands) api.evalCommand(cmd);
            const names: string[] = api.getAllObjectNames() || [];
            for (const n of names) api.setColor(n, 0, 0, 0);
            autoFit(api, grafik.type);
            if (isDark) api.evalCommand('SetBackgroundColor(0.07, 0.1, 0.16)');
          } catch (e) {
            console.warn('[GeoGebra] Befehlsfehler:', e);
          }
          setStatus('ready');
        },
      };

      new GGBApplet(params, true).inject(containerId.current);
    }

    init();
    return () => { cancelled = true; };
  }, [grafik]);

  return (
    <div className="my-3">
      {grafik.id && (
        <p className="text-xs font-semibold text-slate-500 mb-1">{grafik.id}</p>
      )}
      <div className="ggb-koll-container relative rounded-xl overflow-hidden border border-slate-200">
        <div id={containerId.current} style={{ width: '100%' }} />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-xs text-slate-400">
            Grafik wird geladen…
          </div>
        )}
        {status === 'error' && (
          <div className="h-16 flex items-center justify-center text-xs text-slate-400">
            Grafik konnte nicht geladen werden.
          </div>
        )}
      </div>
    </div>
  );
}
