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

async function inspectAllSessions() {
  const { data: sessions } = await adminClient
    .from('attendance_sessions')
    .select('id, title, description, department, course, year_level, target_year_levels, main_sessions(name, description, department)')
    .limit(50);

  console.log('Inspecting sessions:');
  for (const s of sessions || []) {
    const main = s.main_sessions;
    const isEmployee = 
      (s.description && /employee/i.test(s.description)) ||
      (main?.description && /employee/i.test(main.description)) ||
      (s.title && /employee/i.test(s.title)) ||
      (main?.name && /employee/i.test(main.name));

    console.log(`[${s.id}] Title: "${s.title}" | Main: "${main?.name}" | Dept: ${s.department} | Year: ${s.year_level} | TargetYears: ${JSON.stringify(s.target_year_levels)} | MainDesc: "${main?.description}" | isEmployee: ${isEmployee}`);
  }
}

inspectAllSessions().catch(console.error);
