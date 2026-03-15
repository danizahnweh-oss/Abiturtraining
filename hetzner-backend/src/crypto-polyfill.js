/**
 * Crypto-Polyfill: Web Crypto API → Node.js crypto
 *
 * Der bestehende Worker-Code nutzt crypto.subtle (Web Crypto API).
 * Node.js 22 unterstützt Web Crypto nativ über globalThis.crypto,
 * aber dieser Polyfill stellt sicher, dass alles kompatibel ist.
 *
 * Wichtig: Die PBKDF2-Implementierung MUSS identische Hashes erzeugen,
 * damit bestehende Passwörter weiterhin funktionieren!
 */

import { webcrypto } from 'node:crypto';

// Node.js 22 hat bereits globalThis.crypto, aber sicherheitshalber:
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

// Sicherstellen, dass crypto.subtle verfügbar ist
if (!globalThis.crypto.subtle) {
  globalThis.crypto.subtle = webcrypto.subtle;
}

// crypto.randomUUID() ist in Node.js 22 nativ verfügbar
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = webcrypto.randomUUID.bind(webcrypto);
}

/**
 * btoa/atob sind in Node.js 22 nativ verfügbar,
 * aber wir stellen sicher, dass sie existieren
 */
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
}
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
}

export default {};
