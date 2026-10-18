import { describe, expect, it } from 'vitest';
import { proposalDocumentSchema, responseSchema } from './schemas';
import { makeDocument } from './templates';

describe('proposal validation', () => {
  it('accepts a valid structured proposal', () => expect(proposalDocumentSchema.safeParse(makeDocument('Test project', 'full', 100_000)).success).toBe(true));
  it('rejects an expiration before its issue date', () => { const document=makeDocument('Test project','quick',100);document.expirationDate='2020-01-01';expect(proposalDocumentSchema.safeParse(document).success).toBe(false) });
  it('requires identity and agreement for acceptance', () => expect(responseSchema.safeParse({ type:'accepted', submissionId:crypto.randomUUID() }).success).toBe(false));
  it('requires a message for requested changes', () => expect(responseSchema.safeParse({ type:'changes_requested', submissionId:crypto.randomUUID() }).success).toBe(false));
});
