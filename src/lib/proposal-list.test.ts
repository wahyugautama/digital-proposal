import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProposalWorkspace from '../components/ProposalWorkspace.vue';
import { listProposals, PROPOSAL_PAGE_SIZE } from './server/proposal-list';
import { createSupabaseAdmin } from './server/supabase';

vi.mock('./server/supabase', () => ({ createSupabaseAdmin: vi.fn() }));

const proposal = {
  id: '00e0b21f-4816-4d49-bd1b-26793e042236',
  client_id: '21b86b23-5fda-4fb5-8e31-3ec975f450ca',
  proposal_number: 'SP-2026-10001',
  project_name: 'Identity refresh',
  proposal_type: 'full',
  status: 'archived',
  currency: 'USD',
  total_minor: 100_000,
  updated_at: '2026-10-18T00:00:00Z',
  clients: { name: 'Ayu', company: 'Studio Acme' },
};

describe('proposal workspace data', () => {
  const proposalQuery = {
    select: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn(),
  };
  const clientQuery = {
    select: vi.fn(), or: vi.fn(), range: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    proposalQuery.select.mockReturnValue(proposalQuery);
    proposalQuery.or.mockReturnValue(proposalQuery);
    proposalQuery.order.mockReturnValue(proposalQuery);
    proposalQuery.range.mockResolvedValue({ data: [proposal], count: 1, error: null });
    clientQuery.select.mockReturnValue(clientQuery);
    clientQuery.or.mockReturnValue(clientQuery);
    clientQuery.range.mockResolvedValue({ data: [{ id: proposal.client_id }], error: null });
    vi.mocked(createSupabaseAdmin).mockImplementation(() => ({
      from: (table: string) => table === 'clients' ? clientQuery : proposalQuery,
    }) as unknown as ReturnType<typeof createSupabaseAdmin>);
  });

  it('lists archived proposals and pages newest first without a status filter', async () => {
    const result = await listProposals('', 1);
    expect(result.total).toBe(1);
    expect(result.proposals[0]).toMatchObject({ status: 'archived', clientName: 'Studio Acme' });
    expect(proposalQuery.order).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(proposalQuery.range).toHaveBeenCalledWith(PROPOSAL_PAGE_SIZE, PROPOSAL_PAGE_SIZE * 2 - 1);
    expect(proposalQuery.or).not.toHaveBeenCalled();
  });

  it('searches project name, proposal number, and matching client IDs', async () => {
    await listProposals('Acme');
    expect(clientQuery.or).toHaveBeenCalledWith('name.ilike."%Acme%",company.ilike."%Acme%"');
    expect(proposalQuery.or).toHaveBeenCalledWith(
      `project_name.ilike."%Acme%",proposal_number.ilike."%Acme%",client_id.in.(${proposal.client_id})`,
    );
  });

  it('renders the requested columns and Edit and Preview routes', async () => {
    const result = await listProposals();
    const html = await renderToString(createSSRApp({ render: () => h(ProposalWorkspace, {
      initialProposals: result.proposals,
      initialTotal: result.total,
    }) }));
    for (const column of ['Proposal', 'Client', 'Investment', 'Status', 'Updated', 'Actions']) expect(html).toContain(column);
    expect(html).toContain('Search proposals...');
    expect(html).toContain('Studio Acme');
    expect(html).toContain('Archived');
    expect(html).toContain(`/proposals/${proposal.id}/edit`);
    expect(html).toContain(`/proposals/${proposal.id}/preview`);
  });
});
