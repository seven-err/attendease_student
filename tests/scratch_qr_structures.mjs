import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envPath = 'C:/Users/admin/Documents/attendance_system/attendease_admin/.env.local';
const env = {};
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) continue;
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export function normalizeScannedQr(raw) {
  if (!raw) return '';
  let token = String(raw).trim();

  // 1. URL extraction
  if (token.startsWith('http://') || token.startsWith('https://')) {
    try {
      const url = new URL(token);
      const param =
        url.searchParams.get('token') ||
        url.searchParams.get('qr') ||
        url.searchParams.get('qr_token') ||
        url.searchParams.get('code') ||
        url.searchParams.get('id') ||
        url.searchParams.get('student') ||
        url.searchParams.get('person_number') ||
        url.searchParams.get('student_number');

      if (param) {
        token = param.trim();
      } else {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
          token = segments[segments.length - 1].trim();
        }
      }
    } catch {
      // Ignore URL parse error
    }
  }

  // 2. JSON payload extraction
  if ((token.startsWith('{') && token.endsWith('}')) || (token.startsWith('"{') && token.endsWith('}"'))) {
    try {
      const parsed = JSON.parse(token.startsWith('"{') ? JSON.parse(token) : token);
      const val =
        parsed.qr_token ||
        parsed.token ||
        parsed.qr ||
        parsed.student_number ||
        parsed.person_number ||
        parsed.student_id ||
        parsed.person_id ||
        parsed.id ||
        parsed.code;

      if (val && typeof val === 'string') {
        token = val.trim();
      }
    } catch {
      // Ignore JSON parse error
    }
  }

  // 3. Prefix stripping (e.g. STUDENT:..., QR=..., ID: ...)
  const prefixMatch = token.match(/^(?:student|employee|qr|id|code|attendee|token)[\s:=_-]+(.+)$/i);
  if (prefixMatch) {
    token = prefixMatch[1].trim();
  }

  // 4. Delimited barcode payload extraction (e.g. 'CRMC-2026-0378|BSIT|4th Year')
  if (token.includes('|') || token.includes(';') || token.includes('\t')) {
    const parts = token.split(/[|;\t]+/).map(p => p.trim()).filter(Boolean);
    const bestPart = parts.find(p =>
      /^CRMC-\d{4}-\d{4}$/i.test(p) ||
      /^\d{4}-\d{4}$/.test(p) ||
      /^EMP-[A-Za-z0-9]+-\d+$/i.test(p) ||
      /^[0-9a-fA-F]{64}$/.test(p)
    );
    if (bestPart) {
      token = bestPart;
    } else if (parts.length > 0) {
      token = parts[0];
    }
  }

  return token.trim();
}

async function run() {
  const { data: people } = await adminClient.from('people').select('*').limit(1000);
  console.log(`Loaded ${people.length} people.`);

  const testInputs = [
    'CRMC-2026-0378',
    'crmc-2026-0378',
    '2026-0378',
    'STUDENT:CRMC-2026-0378',
    'STUDENT:2026-0378',
    'ID: 2026-0378',
    'QR=CRMC-2026-0378',
    'https://attendease.com/scan?token=CRMC-2026-0378',
    'https://attendease.com/student/2026-0378',
    '{"qr_token":"CRMC-2026-0378"}',
    '{"student_number":"2026-0378"}',
    'CRMC-2026-0378|BSIT|4th Year',
    '2026-0378;Rotcel Cañete Rosellosa;CCS',
    'CRMC-2026-0066',
    '2026-0066',
    'CRMC-2026-0332',
    '2026-0332'
  ];

  for (const raw of testInputs) {
    const normalized = normalizeScannedQr(raw);
    const v_clean = normalized.toLowerCase();

    const match = people.find(p =>
      p.qr_token === normalized ||
      p.qr_token?.toLowerCase() === v_clean ||
      p.person_number === normalized ||
      p.person_number?.toLowerCase() === v_clean ||
      ('CRMC-' + p.person_number) === normalized ||
      ('crmc-' + p.person_number?.toLowerCase()) === v_clean ||
      p.qr_token === ('CRMC-' + normalized) ||
      p.qr_token?.toLowerCase() === ('crmc-' + v_clean) ||
      p.qr_token?.toLowerCase()?.replace('crmc-', '') === v_clean
    );

    console.log(`Input: ${raw.padEnd(48)} -> Norm: ${normalized.padEnd(16)} -> Match: ${match ? match.full_name : 'FAIL'}`);
  }
}
run();
