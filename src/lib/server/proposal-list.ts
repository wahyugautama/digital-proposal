import type { ProposalSummary } from '../types';
import { createSupabaseAdmin } from './supabase';

export const PROPOSAL_PAGE_SIZE = 30;

const searchPattern = (term: string) => `%${term.replace(/[\\%_]/g, '\\$&')}%`;
const quotedPattern = (pattern: string) => JSON.stringify(pattern);

const getMatchingClientIds = async (pattern: string) => {
  const db = createSupabaseAdmin();
  const ids = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await db.from('clients')
      .select('id')
      .or(`name.ilike.${quotedPattern(pattern)},company.ilike.${quotedPattern(pattern)}`)
      .range(offset, offset + 999);
    if (error) throw error;
    for (const client of data ?? []) ids.add(client.id);
    if (!data || data.length < 1000) break;
    offset += 1000;
  }

  return [...ids];
};

export const listProposals = async (search = '', page = 0): Promise<{ proposals: ProposalSummary[]; total: number }> => {
  const db = createSupabaseAdmin();
  const term = search.trim().slice(0, 120);
  let query = db.from('proposals')
    .select('id,client_id,proposal_number,project_name,proposal_type,status,currency,total_minor,updated_at,clients(name,company)', { count: 'exact' });

  if (term) {
    const pattern = searchPattern(term);
    const clientIds = await getMatchingClientIds(pattern);
    const filters = [
      `project_name.ilike.${quotedPattern(pattern)}`,
      `proposal_number.ilike.${quotedPattern(pattern)}`,
    ];
    if (clientIds.length) filters.push(`client_id.in.(${clientIds.join(',')})`);
    query = query.or(filters.join(','));
  }

  const { data, count, error } = await query
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * PROPOSAL_PAGE_SIZE, (page + 1) * PROPOSAL_PAGE_SIZE - 1);
  if (error) throw error;

  return {
    proposals: (data ?? []).map(row => {
      const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
      return {
        id: row.id,
        clientId: row.client_id,
        clientName: client?.company || client?.name || '—',
        proposalNumber: row.proposal_number,
        projectName: row.project_name,
        proposalType: row.proposal_type,
        status: row.status,
        currency: row.currency,
        totalMinor: row.total_minor,
        updatedAt: row.updated_at,
      };
    }),
    total: count ?? 0,
  };
};
