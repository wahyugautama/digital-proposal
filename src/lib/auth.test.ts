import { describe, expect, it } from 'vitest';
import { isMatchingAdminProfile } from './server/auth';
import { getSafeRedirectPath } from '../pages/api/auth/login';

describe('admin authorization', () => {
  const user = { id: 'e32ce4ca-cf72-475f-8fac-b9f1a89d23d0', email: 'Admin@Example.com' };
  const allowlist = ['admin@example.com'];

  it('requires matching Auth ID, normalized email, and allowlist membership', () => {
    expect(isMatchingAdminProfile(user, { id: user.id, email: 'admin@example.com' }, allowlist)).toBe(true);
    expect(isMatchingAdminProfile(user, null, allowlist)).toBe(false);
    expect(isMatchingAdminProfile(user, { id: crypto.randomUUID(), email: 'admin@example.com' }, allowlist)).toBe(false);
    expect(isMatchingAdminProfile(user, { id: user.id, email: 'other@example.com' }, allowlist)).toBe(false);
    expect(isMatchingAdminProfile(user, { id: user.id, email: 'admin@example.com' }, [])).toBe(false);
  });
});

describe('login redirects', () => {
  it('allows only internal absolute paths', () => {
    expect(getSafeRedirectPath('/proposals?status=draft')).toBe('/proposals?status=draft');
    expect(getSafeRedirectPath('//attacker.example/path')).toBe('/');
    expect(getSafeRedirectPath('/\\attacker.example')).toBe('/');
    expect(getSafeRedirectPath('https://attacker.example')).toBe('/');
  });
});
