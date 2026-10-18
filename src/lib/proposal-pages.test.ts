import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { describe, expect, it } from 'vitest';
import ProposalEditor from '../components/ProposalEditor.vue';
import ProposalView from '../components/ProposalView.astro';
import { parseStoredProposalDocument, sanitizeDocument } from './server/proposals';
import { makeDocument } from './templates';

const client = { id: '21b86b23-5fda-4fb5-8e31-3ec975f450ca', name: 'Representative client', company: null, email: 'client@example.com' };
const document = makeDocument('Representative project', 'full', 100_000);

describe('proposal page rendering', () => {
  it('server-renders the editor without accessing browser globals', async () => {
    const app = createSSRApp({
      render: () => h(ProposalEditor, {
        proposalId: '00e0b21f-4816-4d49-bd1b-26793e042236',
        initialDocument: parseStoredProposalDocument(document),
        clients: [client],
        initialClientId: client.id,
        status: 'draft',
        activeShareUrl: null,
      }),
    });
    await expect(renderToString(app)).resolves.toContain('Representative project');
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
});
