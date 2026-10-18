import type { APIContext } from 'astro';
import type { Session, User } from '@supabase/supabase-js';
import { createSupabaseAdmin, createSupabasePublic, getAllowedEmails, isAllowedAdmin } from './supabase';

const ACCESS_COOKIE = 'sb-access-token';
const REFRESH_COOKIE = 'sb-refresh-token';
const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const cookieOptions = (secure: boolean) => ({
  httpOnly: true,
  secure,
  sameSite: 'lax' as const,
  path: '/',
});

export const setSessionCookies = (context: Pick<APIContext, 'cookies'>, session: Session, secure = import.meta.env.PROD) => {
  const options = cookieOptions(secure);
  context.cookies.set(ACCESS_COOKIE, session.access_token, {
    ...options,
    maxAge: session.expires_in,
    expires: new Date(session.expires_at! * 1000),
  });
  context.cookies.set(REFRESH_COOKIE, session.refresh_token, {
    ...options,
    maxAge: REFRESH_MAX_AGE_SECONDS,
    expires: new Date(Date.now() + REFRESH_MAX_AGE_SECONDS * 1000),
  });
};

export const clearSessionCookies = (context: Pick<APIContext, 'cookies'>) => {
  context.cookies.delete(ACCESS_COOKIE, { path: '/' });
  context.cookies.delete(REFRESH_COOKIE, { path: '/' });
};

export const isMatchingAdminProfile = (
  user: Pick<User, 'id' | 'email'>,
  profile: { id: string; email: string } | null,
  allowedEmails = getAllowedEmails(),
) => Boolean(
  user.email
  && allowedEmails.includes(user.email.trim().toLowerCase())
  && profile?.id === user.id
  && profile.email.trim().toLowerCase() === user.email.trim().toLowerCase(),
);

const verifyAdminProfile = async (user: User) => {
  if (!user.email || !isAllowedAdmin(user.email)) return null;

  const { data: profile, error } = await createSupabaseAdmin()
    .from('profiles')
    .select('id,email')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !isMatchingAdminProfile(user, profile)) return null;

  return { id: user.id, email: user.email };
};

export const getRequestUser = async (context: APIContext) => {
  const accessToken = context.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = context.cookies.get(REFRESH_COOKIE)?.value;
  const client = createSupabasePublic();

  if (accessToken) {
    const { data, error } = await client.auth.getUser(accessToken);
    if (!error && data.user) {
      const admin = await verifyAdminProfile(data.user);
      if (admin) return admin;
      clearSessionCookies(context);
      return null;
    }
  }

  if (!refreshToken) {
    clearSessionCookies(context);
    return null;
  }

  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    clearSessionCookies(context);
    return null;
  }

  const admin = await verifyAdminProfile(data.user);
  if (!admin) {
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    clearSessionCookies(context);
    return null;
  }

  setSessionCookies(context, data.session);
  return admin;
};

export const requireAdmin = (context: APIContext) => {
  if (!context.locals.user) throw new Response('Unauthorized', { status: 401 });
  return context.locals.user;
};
