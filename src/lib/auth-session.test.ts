import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  profileResult: { data: null as { id: string; email: string } | null, error: null as Error | null },
}));

vi.mock('./server/supabase', () => ({
  createSupabasePublic: () => ({ auth: { getUser: mocks.getUser, refreshSession: mocks.refreshSession, signOut: mocks.signOut } }),
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => mocks.profileResult }),
      }),
    }),
  }),
  getAllowedEmails: () => ['admin@example.com'],
  isAllowedAdmin: (email?: string | null) => email?.toLowerCase() === 'admin@example.com',
}));

import { getRequestUser } from './server/auth';

const createContext = (initial: Record<string, string>) => {
  const values = new Map(Object.entries(initial));
  return {
    cookies: {
      get: vi.fn((name: string) => values.has(name) ? { value: values.get(name)! } : undefined),
      set: vi.fn((name: string, value: string) => values.set(name, value)),
      delete: vi.fn((name: string) => values.delete(name)),
    },
  };
};

describe('server session lifecycle', () => {
  const user = { id: 'e32ce4ca-cf72-475f-8fac-b9f1a89d23d0', email: 'admin@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileResult = { data: { ...user }, error: null };
  });

  it('refreshes an expired access token and rotates both cookies', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
    mocks.refreshSession.mockResolvedValue({
      data: {
        user,
        session: {
          access_token: 'rotated-access',
          refresh_token: 'rotated-refresh',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    const context = createContext({ 'sb-access-token': 'expired', 'sb-refresh-token': 'valid-refresh' });

    await expect(getRequestUser(context as never)).resolves.toEqual(user);
    expect(context.cookies.set).toHaveBeenCalledWith('sb-access-token', 'rotated-access', expect.objectContaining({ httpOnly: true, sameSite: 'lax' }));
    expect(context.cookies.set).toHaveBeenCalledWith('sb-refresh-token', 'rotated-refresh', expect.objectContaining({ httpOnly: true, sameSite: 'lax' }));
  });

  it('clears authentication when the profile membership is missing', async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.profileResult = { data: null, error: null };
    const context = createContext({ 'sb-access-token': 'valid-access', 'sb-refresh-token': 'valid-refresh' });

    await expect(getRequestUser(context as never)).resolves.toBeNull();
    expect(context.cookies.delete).toHaveBeenCalledWith('sb-access-token', { path: '/' });
    expect(context.cookies.delete).toHaveBeenCalledWith('sb-refresh-token', { path: '/' });
  });

  it('clears authentication after a failed refresh', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
    mocks.refreshSession.mockResolvedValue({ data: { user: null, session: null }, error: new Error('invalid refresh') });
    const context = createContext({ 'sb-access-token': 'expired', 'sb-refresh-token': 'invalid-refresh' });

    await expect(getRequestUser(context as never)).resolves.toBeNull();
    expect(context.cookies.delete).toHaveBeenCalledTimes(2);
  });
});
