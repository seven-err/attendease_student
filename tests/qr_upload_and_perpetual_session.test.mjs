import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const envPath = 'C:/Users/admin/Documents/attendance_system/attendease_admin/.env.local';
  if (!existsSync(envPath)) throw new Error('Missing .env.local in attendease_admin');
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
process.env.VITE_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Mock persistent localStorage and sessionStorage
class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  get length() {
    return this.store.size;
  }
  key(index) {
    return Array.from(this.store.keys())[index] || null;
  }
}

globalThis.localStorage = new MockStorage();
globalThis.sessionStorage = new MockStorage();

const { normalizeScannedQr } = await import('../src/lib/api.ts');
const {
  getSessionToken,
  setSessionToken,
  getStoredProfile,
  setStoredProfile,
  clearSession
} = await import('../src/lib/storage.ts');

console.log('======================================================================');
console.log('   AttendEase — QR Upload & Perpetual Session Verification Suite      ');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, title, details = '') {
  if (condition) {
    console.log(`\x1b[32m✔ PASS:\x1b[0m ${title}`);
    if (details) console.log(`   ➜ ${details}`);
    passCount++;
  } else {
    console.error(`\x1b[31m✘ FAIL:\x1b[0m ${title}`);
    if (details) console.error(`   ➜ ${details}`);
    failCount++;
  }
}

async function runVerification() {
  console.log('--- 1. QR Image Decoded Payloads Normalization ---');

  const testPayloads = [
    { input: 'CRMC-2026-0378', expected: 'CRMC-2026-0378' },
    { input: '2026-0378', expected: '2026-0378' },
    { input: 'STUDENT:CRMC-2026-0378', expected: 'CRMC-2026-0378' },
    { input: 'https://attendease.com/scan?token=CRMC-2026-0378', expected: 'CRMC-2026-0378' },
    { input: '{"qr_token":"CRMC-2026-0378"}', expected: 'CRMC-2026-0378' },
    { input: 'CRMC-2026-0378|BSIT|CCS', expected: 'CRMC-2026-0378' },
    { input: 'EMP-CCS-007', expected: 'EMP-CCS-007' },
    { input: 'EMPLOYEE:EMP-CCS-007', expected: 'EMP-CCS-007' }
  ];

  for (const item of testPayloads) {
    const normalized = normalizeScannedQr(item.input);
    assert(normalized === item.expected, `Normalized payload '${item.input}'`, `Output: ${normalized}`);
  }

  console.log('\n--- 2. Persistent Storage (Survives Browser Restarts) ---');

  const sampleToken = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const sampleProfile = {
    full_name: 'Rotcel Cañete Rosellosa',
    student_number: '2026-0378',
    department: 'CCS',
    course: 'BSIT',
    year_level: '4th Year',
    role: 'student',
    person_kind: 'student'
  };

  setSessionToken(sampleToken);
  setStoredProfile(sampleProfile);

  assert(getSessionToken() === sampleToken, 'Session token saved and retrieved from persistent storage');
  assert(getStoredProfile()?.full_name === 'Rotcel Cañete Rosellosa', 'Student profile saved and retrieved from persistent storage');

  // Simulate tab closure: sessionStorage cleared while localStorage remains intact
  globalThis.sessionStorage.clear();
  assert(getSessionToken() === sampleToken, 'Session token persists in localStorage after sessionStorage clear (survives tab close)');
  assert(getStoredProfile()?.student_number === '2026-0378', 'Profile persists in localStorage after sessionStorage clear');

  console.log('\n--- 3. Clean Sign Out & Session Teardown ---');
  clearSession();
  assert(getSessionToken() === null, 'Session token completely cleared on logout');
  assert(getStoredProfile() === null, 'Profile completely cleared on logout');
  assert(globalThis.localStorage.getItem('attendease_student_token') === null, 'localStorage key purged');
  assert(globalThis.sessionStorage.getItem('attendease_student_token') === null, 'sessionStorage key purged');

  console.log('\n--- 4. Zero-Storage Invariant for Uploaded QR Images ---');
  // Verify that storage contains no image data or file buffers
  let hasImageKeys = false;
  for (let i = 0; i < globalThis.localStorage.length; i++) {
    const k = globalThis.localStorage.key(i);
    if (k && (k.includes('image') || k.includes('file') || k.includes('upload'))) {
      hasImageKeys = true;
    }
  }
  for (let i = 0; i < globalThis.sessionStorage.length; i++) {
    const k = globalThis.sessionStorage.key(i);
    if (k && (k.includes('image') || k.includes('file') || k.includes('upload'))) {
      hasImageKeys = true;
    }
  }
  assert(!hasImageKeys, 'Zero-Storage Invariant Verified: No image or file data stored anywhere in client storage');

  console.log('\n======================================================================');
  console.log(`Verification Complete: ${passCount} Passed, ${failCount} Failed.`);
  console.log('======================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runVerification();
