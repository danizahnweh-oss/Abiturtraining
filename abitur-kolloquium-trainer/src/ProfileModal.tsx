import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const API_BASE = "https://sag-abi-mediation-api.sanktannagymnasium.workers.dev";

interface ProfileModalProps {
  onClose: () => void;
}

export function ProfileModal({ onClose }: ProfileModalProps) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('eA');
  const [email, setEmail] = useState('');
  const [classGroup, setClassGroup] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // Focus-Trap: ersten fokussierbaren Button referenzieren
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus auf Close-Button beim Öffnen
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Focus-Trap: Tab/Shift+Tab innerhalb des Dialogs halten
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const els = Array.from(dialog.querySelectorAll<HTMLElement>(focusable));
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const studentName = sessionStorage.getItem('student_name') || '';
    setName(studentName);
    setLevel((sessionStorage.getItem('student_level') || 'eA').toLowerCase());

    if (!studentName) return;

    const token = sessionStorage.getItem('access_token') || '';
    fetch(API_BASE + '/api/get-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Access-Token': token },
      body: JSON.stringify({ student_name: studentName }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.profile) {
          setClassGroup(data.profile.class_group || '');
          setLevel(data.profile.level || 'eA');
          if (data.profile.created_at) {
            setCreatedAt(new Date(data.profile.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }));
          }
        }
        if (data.preferences) {
          setEmail(data.preferences.email || '');
        }
      })
      .catch(() => setMsg({ text: 'Profil konnte nicht geladen werden.', error: true }));
  }, []);

  async function saveProfile() {
    const token = sessionStorage.getItem('access_token') || '';
    try {
      const res = await fetch(API_BASE + '/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Access-Token': token },
        body: JSON.stringify({ student_name: name, level, email }),
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem('student_level', level);
        setMsg({ text: 'Änderungen gespeichert!', error: false });
        setTimeout(() => setMsg(null), 3000);
      } else {
        setMsg({ text: data.error || 'Fehler beim Speichern.', error: true });
      }
    } catch {
      setMsg({ text: 'Verbindungsfehler.', error: true });
    }
  }

  async function changePassword() {
    if (!oldPw) { setPwMsg({ text: 'Aktuelles Passwort eingeben.', error: true }); return; }
    if (!newPw || newPw.length < 6) { setPwMsg({ text: 'Neues Passwort muss mind. 6 Zeichen haben.', error: true }); return; }
    if (newPw !== confirmPw) { setPwMsg({ text: 'Passwörter stimmen nicht überein.', error: true }); return; }

    const token = sessionStorage.getItem('access_token') || '';
    try {
      const res = await fetch(API_BASE + '/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Access-Token': token },
        body: JSON.stringify({ student_name: name, old_password: oldPw, new_password: newPw }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.token) sessionStorage.setItem('access_token', data.token);
        setOldPw(''); setNewPw(''); setConfirmPw('');
        setPwMsg({ text: 'Passwort erfolgreich geändert!', error: false });
        setTimeout(() => setPwMsg(null), 3000);
      } else {
        setPwMsg({ text: data.error || 'Fehler beim Ändern.', error: true });
      }
    } catch {
      setPwMsg({ text: 'Verbindungsfehler.', error: true });
    }
  }

  function doLogout() {
    sessionStorage.removeItem('access');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('student_name');
    sessionStorage.removeItem('student_level');
    sessionStorage.removeItem('student_course');
    window.location.href = '/';
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profileModalTitle"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="profileModalTitle" className="text-lg font-semibold">Mein Profil</h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Schließen"
            className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Profil-Info */}
        <div className="space-y-3 mb-5">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 min-w-[70px]">Name</span>
            <span className="font-semibold text-sm">{name}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 min-w-[70px]">Klasse</span>
            <span className="text-sm">{classGroup || '–'}</span>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="profLevel" className="text-xs text-slate-500 min-w-[70px]">Kursstufe</label>
            <select
              id="profLevel"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="px-3 py-2 text-base border border-slate-200 rounded-lg bg-white min-h-[44px]"
            >
              <option value="eA">eA (erhöhtes Anforderungsniveau)</option>
              <option value="gA">gA (grundlegendes Anforderungsniveau)</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="profEmail" className="text-xs text-slate-500 min-w-[70px]">E-Mail</label>
            <input
              id="profEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Optional – für Erinnerungen"
              autoComplete="email"
              className="flex-1 px-3 py-2 text-base border border-slate-200 rounded-lg bg-white min-h-[44px]"
            />
          </div>
          {createdAt && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 min-w-[70px]">Dabei seit</span>
              <span className="text-xs text-slate-400">{createdAt}</span>
            </div>
          )}
        </div>

        {msg && (
          <div
            role="alert"
            className={`text-xs text-center p-2 rounded-lg mb-3 ${msg.error ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}
          >
            {msg.text}
          </div>
        )}

        <button
          onClick={saveProfile}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors min-h-[48px] mb-4"
        >
          Änderungen speichern
        </button>

        {/* Passwort ändern */}
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-semibold py-2 min-h-[44px] flex items-center select-none">
            Passwort ändern
          </summary>
          <div className="space-y-2 pt-2">
            <label htmlFor="oldPw" className="sr-only">Aktuelles Passwort</label>
            <input id="oldPw" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Aktuelles Passwort" autoComplete="current-password" className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg min-h-[44px]" />
            <label htmlFor="newPw" className="sr-only">Neues Passwort (mindestens 6 Zeichen)</label>
            <input id="newPw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Neues Passwort (min. 6 Zeichen)" autoComplete="new-password" className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg min-h-[44px]" />
            <label htmlFor="confirmPw" className="sr-only">Neues Passwort bestätigen</label>
            <input id="confirmPw" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Neues Passwort bestätigen" autoComplete="new-password" className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg min-h-[44px]" />
            {pwMsg && (
              <div role="alert" className={`text-xs text-center p-2 rounded-lg ${pwMsg.error ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                {pwMsg.text}
              </div>
            )}
            <button
              onClick={changePassword}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg transition-colors min-h-[44px] text-sm"
            >
              Passwort ändern
            </button>
          </div>
        </details>

        {/* Aktionen */}
        <div className="flex gap-2">
          <button onClick={doLogout} className="flex-1 py-2.5 border border-red-400 text-red-500 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors min-h-[44px]">
            Abmelden
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-500 rounded-lg text-sm hover:bg-slate-50 transition-colors min-h-[44px]">
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
