import { createClient, SupabaseClient } from '@supabase/supabase-js';

const FALLBACK_URL = 'https://epojiwsdieficbyhqoqp.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwb2ppd3NkaWVmaWNieWhxb3FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MTkyMDQsImV4cCI6MjEwMjE5NTIwNH0.CJhID2I1IEsA0TOZfiky0elyjhaF032Nv44slrjVruE';

function getValidSupabaseUrl(): string {
  try {
    const raw = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
    if (typeof raw === 'string' && (raw.startsWith('http://') || raw.startsWith('https://'))) {
      return raw.trim();
    }
  } catch {
    // Ignore
  }
  return FALLBACK_URL;
}

function getValidSupabaseKey(): string {
  try {
    const raw = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (typeof raw === 'string' && raw.trim().length > 20) {
      return raw.trim();
    }
  } catch {
    // Ignore
  }
  return FALLBACK_KEY;
}

const supabaseUrl = getValidSupabaseUrl();
const supabaseAnonKey = getValidSupabaseKey();

// Anonymous Supabase client strictly restricted to executing public SECURITY DEFINER RPCs.
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
