import { z } from 'zod';
import { proposalStatuses } from './types';

export const uuidSchema = z.string().uuid();
export const clientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional().nullable(),
});

const sectionSchema = z.object({
  id: z.string().min(1).max(60), title: z.string().min(1).max(120), enabled: z.boolean(),
  content: z.string().max(50_000), kind: z.enum(['text', 'scope', 'timeline', 'investment', 'payment', 'terms', 'acceptance']),
});
const phaseSchema = z.object({ id: z.string(), name: z.string().min(1).max(180), description: z.string().max(1000), amountMinor: z.number().int().nonnegative() });
const milestoneSchema = z.object({ id: z.string(), percentage: z.number().int().min(1).max(100), description: z.string().min(1).max(300) });

export const proposalDocumentSchema = z.object({
  title: z.string().min(2).max(180), projectName: z.string().min(2).max(180), proposalNumber: z.string().min(2).max(60),
  proposalType: z.enum(['quick', 'full']), issueDate: z.string().date(), expirationDate: z.string().date(), currency: z.enum(['USD', 'IDR']),
  pricingDisplay: z.enum(['total', 'phases']), phases: z.array(phaseSchema).min(1).max(30), discountMinor: z.number().int().nonnegative(),
  taxBasisPoints: z.number().int().min(0).max(10000), milestones: z.array(milestoneSchema).min(1).max(20), sections: z.array(sectionSchema).min(1).max(30),
}).superRefine((data, context) => {
  if (data.expirationDate < data.issueDate) context.addIssue({ code: 'custom', path: ['expirationDate'], message: 'Expiration must follow issue date.' });
  if (data.milestones.reduce((sum, item) => sum + item.percentage, 0) !== 100) context.addIssue({ code: 'custom', path: ['milestones'], message: 'Milestones must total 100%.' });
});

export const proposalCreateSchema = z.object({ clientId: uuidSchema, templateId: uuidSchema.optional(), document: proposalDocumentSchema });
export const proposalUpdateSchema = z.object({ clientId: uuidSchema.optional(), document: proposalDocumentSchema });
export const statusSchema = z.enum(proposalStatuses);
export const responseSchema = z.object({
  type: z.enum(['accepted', 'changes_requested', 'declined']), name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).optional(), message: z.string().trim().max(5000).optional(), agreed: z.boolean().optional(), submissionId: z.string().uuid(),
}).superRefine((data, context) => {
  if (data.type === 'accepted' && (!data.name || !data.email || data.agreed !== true)) context.addIssue({ code: 'custom', message: 'Name, email, and agreement are required to accept.' });
  if (data.type === 'changes_requested' && !data.message) context.addIssue({ code: 'custom', message: 'Please describe the requested changes.' });
});
