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
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectSessions() {
  const { data: sampleSessions, error } = await adminClient
    .from('attendance_sessions')
    .select('*')
    .limit(10);

  console.log('Sample attendance_sessions columns and data:');
  console.log(JSON.stringify(sampleSessions, null, 2));

  const { data: sampleMainSessions } = await adminClient
    .from('main_sessions')
    .select('*')
    .limit(5);

  console.log('\nSample main_sessions:');
  console.log(JSON.stringify(sampleMainSessions, null, 2));
}

inspectSessions().catch(console.error);
