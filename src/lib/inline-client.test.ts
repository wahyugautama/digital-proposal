import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn(), single: vi.fn() }));
vi.mock('./server/auth', () => ({ requireAdmin: () => ({ id: 'e32ce4ca-cf72-475f-8fac-b9f1a89d23d0' }) }));
vi.mock('./server/supabase', () => ({
  createSupabaseAdmin: () => ({ from: () => ({ insert: mocks.insert }) }),
}));

import { POST } from '../pages/api/admin/clients';

describe('inline client creation', () => {
  it('returns the created client for immediate selection in New Proposal', async () => {
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({
      data: { id: '21b86b23-5fda-4fb5-8e31-3ec975f450ca', name: 'Ayu', company: 'Studio Acme', email: 'ayu@example.com' },
      error: null,
    });
    const request = new Request('https://internal.invalid/api/admin/clients', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({ name: 'Ayu', company: 'Studio Acme', email: 'ayu@example.com' }),
    });
    const response = await POST({ request } as never);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ client: expect.objectContaining({ company: 'Studio Acme' }) });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ created_by: 'e32ce4ca-cf72-475f-8fac-b9f1a89d23d0' }));
  });
});
