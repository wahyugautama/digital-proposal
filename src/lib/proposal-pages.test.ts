import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { describe, expect, it } from 'vitest';
import ProposalForm from '../components/ProposalForm.vue';
import ProposalView from '../components/ProposalView.astro';
import StructuredProposalView from '../components/StructuredProposalView.astro';
import { makeBuilderDocument } from './proposal-builder';
import { parseStoredProposalDocument, sanitizeDocument } from './server/proposals';
import { makeDocument } from './templates';

const client = { id: '21b86b23-5fda-4fb5-8e31-3ec975f450ca', name: 'Representative client', company: null, email: 'client@example.com' };
const document = makeDocument('Representative project', 'full', 100_000);

describe('proposal page rendering', () => {
  it('server-renders the shared builder without accessing browser globals', async () => {
    const app = createSSRApp({
      render: () => h(ProposalForm, {
        proposalId: '00e0b21f-4816-4d49-bd1b-26793e042236',
        initialDocument: parseStoredProposalDocument(document),
        clients: [client],
        initialClientId: client.id,
        status: 'draft',
        activeShareUrl: null,
      }),
    });
    const html = await renderToString(app);
    expect(html).toContain('Project Details');
    expect(html).toContain('Services &amp; Scope');
    expect(html).toContain('Representative project');
  });

  it('server-renders the preview with a validated and sanitized document', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ProposalView, {
      props: { document: sanitizeDocument(parseStoredProposalDocument(document)), client, readonly: true },
    });
    expect(html).toContain('Representative project');
    expect(html).toContain('Representative client');
    expect(html).toContain('Prepared by');
    expect(html).toContain('Sandikala Studio');
    expect(html).not.toContain('at 1801');
  });

  it('uses the same structured renderer for preview and published snapshots', async () => {
    const structured = makeBuilderDocument();
    structured.builder!.project.title = 'A new beginning';
    structured.builder!.project.overview = 'First paragraph.\n\nSecond paragraph.';
    structured.builder!.client.company = 'Representative client';
    structured.builder!.services[0].enabled = true;
    structured.builder!.services[0].scope[0].selected = true;
    structured.builder!.services[0].scope[1].selected = false;
    structured.builder!.legacyNotes = 'Unselected legacy scope';
    structured.builder!.terms[0].enabled = true;
    structured.builder!.terms[0].text = 'Payment on agreed milestones.';
    const container = await AstroContainer.create();
    const preview = await container.renderToString(StructuredProposalView, { props: { document: structured, client, readonly: true } });
    const published = await container.renderToString(StructuredProposalView, { props: { document: structured, client, version: 1, publicToken: 'test-token' } });
    for (const html of [preview, published]) {
      expect(html).toContain('A new beginning');
      expect(html).toContain('Brand Discovery &amp; Research');
      expect(html).not.toContain('Brand Strategy');
      expect(html).not.toContain('Unselected legacy scope');
      expect(html).toContain('Payment on agreed milestones.');
      expect(html).toContain('Sandikala Studio');
      expect(html).not.toContain('at 1801');
    }
    expect(published).toContain('Accept proposal');
  });
});
