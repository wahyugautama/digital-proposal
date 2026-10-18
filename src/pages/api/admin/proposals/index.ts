import type { APIRoute } from 'astro';
import { z } from 'zod';
import { calculateBuilderInvestment, syncBuilderDocument } from '../../../../lib/proposal-builder';
import { calculateInvestment } from '../../../../lib/money';
import { proposalDocumentSchema } from '../../../../lib/schemas';
import { initialTemplates } from '../../../../lib/templates';
import { requireAdmin } from '../../../../lib/server/auth';
import { createSupabaseAdmin } from '../../../../lib/server/supabase';
import { listProposals } from '../../../../lib/server/proposal-list';

export const GET: APIRoute = async context => {
  requireAdmin(context);
  const page = Number(context.url.searchParams.get('page') ?? '0');
  if (!Number.isSafeInteger(page) || page < 0) return Response.json({ error: 'Invalid page' }, { status: 400 });
  try { return Response.json(await listProposals(context.url.searchParams.get('q') ?? '', page)); }
  catch (error) { console.error('Unable to list proposals', error); return Response.json({ error: 'Unable to load proposals' }, { status: 500 }); }
};

export const POST: APIRoute = async context => {
  const user = requireAdmin(context);
  const isJson = context.request.headers.get('content-type')?.includes('application/json');
  const db = createSupabaseAdmin();
  let clientId: string;
  let document;
  if (isJson) {
    const parsed = z.object({ clientId: z.string().uuid(), document: proposalDocumentSchema }).safeParse(await context.request.json().catch(() => null));
    if (!parsed.success || !parsed.data.document.builder) return Response.json({ error: parsed.success ? 'Structured proposal is required.' : parsed.error.issues[0]?.message }, { status: 400 });
    clientId = parsed.data.clientId;
    document = syncBuilderDocument(parsed.data.document);
  } else {
    const parsed = z.object({ clientId: z.string().uuid(), templateIndex: z.coerce.number().int().min(0).max(initialTemplates.length - 1) }).safeParse(Object.fromEntries(await context.request.formData()));
    if (!parsed.success) return new Response('Invalid selection', { status: 400 });
    clientId = parsed.data.clientId;
    document = structuredClone(initialTemplates[parsed.data.templateIndex].document);
  }
  const { data: client, error: clientError } = await db.from('clients').select('id').eq('id', clientId).is('archived_at', null).maybeSingle();
  if (clientError || !client) return Response.json({ error: 'Select an existing client.' }, { status: 400 });
  document.proposalNumber = `SP-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  let total: number;
  try { total = document.builder ? calculateBuilderInvestment(document.builder).totalMinor : calculateInvestment(document.phases, document.discountMinor, document.taxBasisPoints).totalMinor; }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid investment.' }, { status: 400 }); }
  const { data, error } = await db.from('proposals').insert({
    client_id: clientId, proposal_number: document.proposalNumber, project_name: document.projectName,
    proposal_type: document.proposalType, status: 'draft', currency: document.currency,
    total_minor: total, draft_document: document, created_by: user.id,
  }).select('id').single();
  if (error || !data) return Response.json({ error: 'Unable to create proposal.' }, { status: 500 });
  return isJson ? Response.json({ id: data.id }, { status: 201 }) : context.redirect(`/proposals/${data.id}/edit`, 303);
};
