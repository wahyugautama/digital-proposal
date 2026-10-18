import { defineMiddleware } from 'astro:middleware';
import { getRequestUser } from './lib/server/auth';
import { getPublicSupabaseUrl } from './lib/server/supabase';

const publicPaths = ['/login', '/p/', '/api/auth/', '/api/public/'];
const protectedPaths = ['/dashboard', '/proposals', '/clients', '/templates', '/settings', '/api/admin/'];

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = await getRequestUser(context);
  const path = context.url.pathname;
  if (protectedPaths.some(prefix => path === prefix || path.startsWith(`${prefix}/`)) && !context.locals.user) {
    if (path.startsWith('/api/')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
    return context.redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  const response = await next();
  if (publicPaths.some(prefix => path === prefix || path.startsWith(prefix))) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  }
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${getPublicSupabaseUrl()}`,
  ].join('; '));
  if (import.meta.env.PROD) response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return response;
});
