import { calculateInvestment } from '../money';
import { proposalDocumentSchema } from '../schemas';
import type { ProposalDocument } from '../types';
import { createSupabaseAdmin } from './supabase';
import { createAccessToken, encryptAccessToken, hashToken, sanitizeRichText } from './security';

export const sanitizeDocument = (document: ProposalDocument): ProposalDocument => ({
  ...document, sections: document.sections.map(item => ({ ...item, content: sanitizeRichText(item.content) })),
});

export const isProposalAccessActive = (
  access: { expires_at: string; revoked_at: string | null } | null,
  now = new Date(),
) => Boolean(access && !access.revoked_at && new Date(access.expires_at).getTime() > now.getTime());

export const publishProposal = async (proposalId: string, userId: string) => {
  const db = createSupabaseAdmin();
  const { data: proposal, error } = await db.from('proposals').select('*').eq('id', proposalId).single();
  if (error || !proposal) throw new Error('Proposal not found.');
  if (proposal.status === 'accepted') throw new Error('Accepted proposals cannot be republished. Duplicate it to create a new proposal.');
  const document = proposalDocumentSchema.parse(proposal.draft_document);
  const snapshot = sanitizeDocument(document);
  const totalMinor = calculateInvestment(snapshot.phases, snapshot.discountMinor, snapshot.taxBasisPoints).totalMinor;
  const token = createAccessToken();
  const tokenHash = await hashToken(token);
  const encryptedToken = await encryptAccessToken(token);
  const expiresAt = new Date(`${snapshot.expirationDate}T23:59:59.999Z`).toISOString();
  const { data, error: publishError } = await db.rpc('publish_proposal', {
    p_proposal_id: proposalId,
    p_snapshot: snapshot,
    p_total_minor: totalMinor,
    p_published_by: userId,
    p_token_hash: tokenHash,
    p_token_hint: token.slice(-8),
    p_encrypted_token: encryptedToken,
    p_expires_at: expiresAt,
  }).single();
  if (publishError || !data) throw publishError ?? new Error('Publication failed.');
  const published = data as { version_id: string; version_number: number };
  return { token, version: { id: published.version_id, version_number: published.version_number } };
};

export const getPublicProposal = async (token: string) => {
  const db = createSupabaseAdmin();
  const tokenHash = await hashToken(token);
  const { data: access, error } = await db.from('proposal_access_tokens').select('*, proposal_versions(*), proposals(*, clients(*))').eq('token_hash', tokenHash).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw new Error('Unable to validate proposal access.');
  return isProposalAccessActive(access) ? access : null;
};
