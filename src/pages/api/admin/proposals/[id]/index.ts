import type { APIRoute } from 'astro';
import { proposalUpdateSchema } from '../../../../../lib/schemas';
import { calculateInvestment } from '../../../../../lib/money';
import { calculateBuilderInvestment, syncBuilderDocument } from '../../../../../lib/proposal-builder';
import { requireAdmin } from '../../../../../lib/server/auth';
import { createSupabaseAdmin } from '../../../../../lib/server/supabase';

export const PUT: APIRoute = async context => {
  requireAdmin(context);
  const parsed = proposalUpdateSchema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const doc = syncBuilderDocument(parsed.data.document);
  let total: number;
  try { total = doc.builder ? calculateBuilderInvestment(doc.builder).totalMinor : calculateInvestment(doc.phases, doc.discountMinor, doc.taxBasisPoints).totalMinor; }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid investment.' }, { status: 400 }); }
  const db = createSupabaseAdmin();
  const { data: current, error: lookupError } = await db.from('proposals').select('status,client_id,proposal_number').eq('id', context.params.id).single();
  if (lookupError || !current) return Response.json({ error: 'Proposal not found.' }, { status: 404 });
  if (current.status === 'accepted') return Response.json({ error: 'Accepted proposals are immutable. Duplicate it to make changes.' }, { status: 409 });
  const clientId = parsed.data.clientId ?? current.client_id;
  const { data: client, error: clientError } = await db.from('clients').select('id').eq('id', clientId).is('archived_at', null).maybeSingle();
  if (clientError || !client) return Response.json({ error: 'Select an existing client.' }, { status: 400 });
  doc.proposalNumber = current.proposal_number;
  const { error } = await db.from('proposals').update({
    client_id: clientId, project_name: doc.projectName, proposal_type: doc.proposalType,
    currency: doc.currency, total_minor: total, draft_document: doc, updated_at: new Date().toISOString(),
  }).eq('id', context.params.id);
  return Response.json(error ? { error: 'Save failed.' } : { ok: true }, { status: error ? 500 : 200 });
};
