import { createClient } from '@supabase/supabase-js';

type SupabaseEnvName = 'PUBLIC_SUPABASE_URL' | 'PUBLIC_SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY';

const requireEnv = (name: SupabaseEnvName) => {
  const value = import.meta.env[name];
  if (!value?.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
};

const getSupabaseUrl = () => {
  const value = requireEnv('PUBLIC_SUPABASE_URL');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('PUBLIC_SUPABASE_URL must be a valid HTTPS URL.'); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
    throw new Error('PUBLIC_SUPABASE_URL must use HTTPS and point to a Supabase project host.');
  }
  return url.origin;
};

const getSupabaseKey = (name: Exclude<SupabaseEnvName, 'PUBLIC_SUPABASE_URL'>) => {
  const value = requireEnv(name);
  if (value.length < 20) throw new Error(`${name} does not appear to be a valid Supabase key.`);
  return value;
};

export const createSupabaseAdmin = () => createClient(getSupabaseUrl(), getSupabaseKey('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const createSupabasePublic = () => createClient(getSupabaseUrl(), getSupabaseKey('PUBLIC_SUPABASE_ANON_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const getPublicSupabaseUrl = getSupabaseUrl;

export const getAllowedEmails = () => (import.meta.env.ADMIN_EMAIL_ALLOWLIST ?? '')
  .split(',').map((email: string) => email.trim().toLowerCase()).filter(Boolean);

export const isAllowedAdmin = (email?: string | null) => Boolean(email && getAllowedEmails().includes(email.toLowerCase()));
