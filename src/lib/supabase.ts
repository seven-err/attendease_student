import { createClient } from '@supabase/supabase-js';

// Statically accessible for Vite build-time inlining with hardcoded production fallbacks
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://epojiwsdieficbyhqoqp.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwb2ppd3NkaWVmaWNieWhxb3FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MTkyMDQsImV4cCI6MjEwMjE5NTIwNH0.CJhID2I1IEsA0TOZfiky0elyjhaF032Nv44slrjVruE';

// Anonymous Supabase client strictly restricted to executing public SECURITY DEFINER RPCs.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
