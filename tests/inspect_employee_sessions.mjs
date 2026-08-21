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

async function inspectEmployeeSessions() {
  const { data: empSessions } = await adminClient
    .from('attendance_sessions')
    .select('*, main_sessions(*)')
    .eq('main_session_id', '7249f4e0-2afe-4c8f-bf7d-7cd022d6646d');

  console.log('Sessions under Employee main_session:');
  console.log(JSON.stringify(empSessions, null, 2));

  // Let's also check all distinct year_level, target_year_levels, and session types
  const { data: allSessions } = await adminClient
    .from('attendance_sessions')
    .select('id, title, department, year_level, target_year_levels, main_sessions(name, description, department)')
    .limit(20);

  console.log('\nAll sample sessions with main_session:');
  console.log(JSON.stringify(allSessions, null, 2));
}

inspectEmployeeSessions().catch(console.error);
