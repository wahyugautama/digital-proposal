import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSupabasePublic, isAllowedAdmin } from '../../../lib/server/supabase';
import { setSessionCookies } from '../../../lib/server/auth';

export const getSafeRedirectPath = (value?: string) => {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const parsed = new URL(value, 'https://internal.invalid');
    return parsed.origin === 'https://internal.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '/';
  } catch {
    return '/';
  }
};

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const parsed = z.object({ email: z.string().email(), password: z.string().min(8), next: z.string().optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success || !isAllowedAdmin(parsed.data?.email)) return redirect('/login?error=invalid', 303);
  const { data, error } = await createSupabasePublic().auth.signInWithPassword(parsed.data);
  if (error || !data.session) return redirect('/login?error=invalid', 303);
  setSessionCookies({ cookies }, data.session);
  return redirect(getSafeRedirectPath(parsed.data.next), 303);
};
