import { describe, expect, it } from 'vitest';
import { isProposalAccessActive } from './server/proposals';

describe('public proposal authorization', () => {
  const now = new Date('2026-10-18T00:00:00.000Z');

  it('allows only unrevoked, unexpired access records', () => {
    expect(isProposalAccessActive({ expires_at: '2026-10-19T00:00:00.000Z', revoked_at: null }, now)).toBe(true);
    expect(isProposalAccessActive({ expires_at: '2026-10-17T00:00:00.000Z', revoked_at: null }, now)).toBe(false);
    expect(isProposalAccessActive({ expires_at: '2026-10-19T00:00:00.000Z', revoked_at: '2026-10-17T00:00:00.000Z' }, now)).toBe(false);
    expect(isProposalAccessActive(null, now)).toBe(false);
  });
});
