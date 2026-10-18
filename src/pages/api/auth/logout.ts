import type { APIRoute } from 'astro';
import { clearSessionCookies } from '../../../lib/server/auth';
import { createSupabasePublic } from '../../../lib/server/supabase';

export const POST: APIRoute = async context => {
  const accessToken = context.cookies.get('sb-access-token')?.value;
  const refreshToken = context.cookies.get('sb-refresh-token')?.value;
  if (accessToken && refreshToken) {
    const client = createSupabasePublic();
    const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (!sessionError) await client.auth.signOut({ scope: 'local' });
  }
  clearSessionCookies(context);
  return context.redirect('/login', 303);
};
