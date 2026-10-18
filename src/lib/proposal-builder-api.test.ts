import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBuilderDocument } from './proposal-builder';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./server/auth', () => ({ requireAdmin: () => ({ id: 'e32ce4ca-cf72-475f-8fac-b9f1a89d23d0' }) }));
vi.mock('./server/supabase', () => ({ createSupabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('./server/security', () => ({ createAccessToken: () => 'a'.repeat(64), hashToken: async () => 'hash', encryptAccessToken: async () => 'encrypted', sanitizeRichText: (value: string) => value }));

import { POST } from '../pages/api/admin/proposals/index';
import { PUT } from '../pages/api/admin/proposals/[id]/index';
import { publishProposal } from './server/proposals';

const clientId = '21b86b23-5fda-4fb5-8e31-3ec975f450ca';
const proposalId = '00e0b21f-4816-4d49-bd1b-26793e042236';
const clientLookup = () => ({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { id: clientId }, error: null }) }) }) }) });

describe('structured proposal API', () => {
  beforeEach(() => { mocks.from.mockReset(); mocks.rpc.mockReset(); });

  it('creates an incomplete draft and calculates the stored total on the server', async () => {
    const document = makeBuilderDocument();
    document.builder!.services[0].enabled = true;
    document.builder!.services[0].amountMinor = 300_000;
    let inserted: Record<string, unknown> = {};
    mocks.from.mockImplementation((table: string) => table === 'clients' ? clientLookup() : {
      insert: (row: Record<string, unknown>) => { inserted = row; return { select: () => ({ single: async () => ({ data: { id: proposalId }, error: null }) }) }; },
    });
    const request = new Request('https://internal.invalid/api/admin/proposals', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, document }),
    });
    const response = await POST({ request } as never);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: proposalId });
    expect(inserted.total_minor).toBe(300_000);
    expect((inserted.draft_document as { builder: unknown }).builder).toBeTruthy();
  });

  it('keeps accepted proposals immutable when saving an edit', async () => {
    const document = makeBuilderDocument();
    mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'accepted', client_id: clientId, proposal_number: 'SP-1' }, error: null }) }) }) }));
    const request = new Request('https://internal.invalid/api/admin/proposals/id', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, document }),
    });
    const response = await PUT({ request, params: { id: proposalId } } as never);
    expect(response.status).toBe(409);
  });

  it('rejects incomplete drafts before immutable publication', async () => {
    const document = makeBuilderDocument();
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'draft', draft_document: document }, error: null }) }) }) });
    await expect(publishProposal(proposalId, 'admin-id')).rejects.toThrow(/Client or company name/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('publishes a validated snapshot without mutating the draft object', async () => {
    const document = makeBuilderDocument();
    const builder = document.builder!;
    builder.client.company = 'Studio Acme';
    builder.project.title = 'A new beginning';
    builder.project.overview = 'Project context.';
    builder.services[0].enabled = true;
    builder.services[0].scope[0].selected = true;
    builder.services[0].amountMinor = 110_001;
    builder.timeline.overallDuration = '6 weeks';
    builder.terms[0].enabled = true;
    builder.terms[0].text = 'Payment on agreed milestones.';
    builder.termsApproved = true;
    const original = JSON.stringify(document);
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'draft', draft_document: document }, error: null }) }) }) });
    mocks.rpc.mockReturnValue({ single: async () => ({ data: { version_id: 'v1', version_number: 1 }, error: null }) });
    const result = await publishProposal(proposalId, 'admin-id');
    expect(result.version.version_number).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledWith('publish_proposal', expect.objectContaining({ p_total_minor: 110_001, p_snapshot: expect.objectContaining({ builder: expect.any(Object) }) }));
    expect(JSON.stringify(document)).toBe(original);
  });
});
