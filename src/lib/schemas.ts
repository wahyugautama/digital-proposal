import { z } from 'zod';
import { proposalStatuses } from './types';

export const uuidSchema = z.string().uuid();
export const clientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).optional().nullable(),
  email: z.union([z.string().trim().email().max(254), z.literal('')]),
  phone: z.string().trim().max(40).optional().nullable(),
});

const sectionSchema = z.object({
  id: z.string().min(1).max(60), title: z.string().min(1).max(120), enabled: z.boolean(),
  content: z.string().max(50_000), kind: z.enum(['text', 'scope', 'timeline', 'investment', 'payment', 'terms', 'acceptance']),
});
const phaseSchema = z.object({ id: z.string(), name: z.string().min(1).max(180), description: z.string().max(1000), amountMinor: z.number().int().nonnegative() });
const draftPricingPhaseSchema = z.object({ id: z.string().min(1), name: z.string().max(180), description: z.string().max(1000), amountMinor: z.number().int().nonnegative().safe() });
const milestoneSchema = z.object({ id: z.string(), percentage: z.number().int().min(1).max(100), description: z.string().min(1).max(300) });
const draftMilestoneSchema = z.object({ id: z.string().min(1), percentage: z.number().int().min(0).max(100), description: z.string().max(300) });

export const builderSchema = z.object({
  version: z.literal(1),
  client: z.object({ company: z.string().max(160), contactPerson: z.string().max(120), email: z.string().max(254) }),
  project: z.object({ title: z.string().max(180), overview: z.string().max(50_000) }),
  services: z.array(z.object({ type: z.enum(['brand_identity', 'web_design', 'web_development']), enabled: z.boolean(), amountMinor: z.number().int().nonnegative().safe(), scope: z.array(z.object({ id: z.string().min(1), title: z.string().max(180), description: z.string().max(5000), selected: z.boolean(), custom: z.boolean() })).max(100) })).length(3),
  timeline: z.object({ overallDuration: z.string().max(120), phases: z.array(z.object({ id: z.string().min(1), name: z.string().max(180), duration: z.string().max(120), description: z.string().max(2000) })).max(30), note: z.string().max(5000), customized: z.boolean() }),
  investment: z.object({ adjustment: z.object({ mode: z.enum(['fixed', 'percentage']), value: z.number().int().safe() }).nullable(), manualTotalMinor: z.number().int().nonnegative().safe().nullable(), legacyPricing: z.array(draftPricingPhaseSchema).max(30) }),
  milestones: z.array(draftMilestoneSchema).max(20),
  terms: z.array(z.object({ id: z.string().min(1), title: z.string().max(120), text: z.string().max(20_000), enabled: z.boolean(), custom: z.boolean() })).max(30),
  termsApproved: z.boolean(),
  legacyNotes: z.string().max(100_000),
}).superRefine((builder, context) => {
  const serviceTypes = builder.services.map(service => service.type);
  if (new Set(serviceTypes).size !== 3) context.addIssue({ code: 'custom', path: ['services'], message: 'Each service must appear once.' });
  for (const service of builder.services) {
    if (new Set(service.scope.map(item => item.id)).size !== service.scope.length) context.addIssue({ code: 'custom', path: ['services'], message: 'Scope item IDs must be unique.' });
  }
});

export const proposalDocumentSchema = z.object({
  title: z.string().min(2).max(180), projectName: z.string().min(2).max(180), proposalNumber: z.string().min(2).max(60),
  proposalType: z.enum(['quick', 'full']), issueDate: z.string().date(), expirationDate: z.string().date(), currency: z.enum(['USD', 'IDR']),
  pricingDisplay: z.enum(['total', 'phases']), phases: z.array(phaseSchema).min(1).max(30), discountMinor: z.number().int().nonnegative(),
  taxBasisPoints: z.number().int().min(0).max(10000), milestones: z.array(milestoneSchema).min(1).max(20), sections: z.array(sectionSchema).min(1).max(30), builder: builderSchema.optional(),
}).superRefine((data, context) => {
  if (data.expirationDate < data.issueDate) context.addIssue({ code: 'custom', path: ['expirationDate'], message: 'Expiration must follow issue date.' });
  if (data.milestones.reduce((sum, item) => sum + item.percentage, 0) !== 100) context.addIssue({ code: 'custom', path: ['milestones'], message: 'Milestones must total 100%.' });
});

export const proposalCreateSchema = z.object({ clientId: uuidSchema, templateId: uuidSchema.optional(), document: proposalDocumentSchema });
export const proposalUpdateSchema = z.object({ clientId: uuidSchema.optional(), document: proposalDocumentSchema });

export const getPublishIssues = (document: z.infer<typeof proposalDocumentSchema>): string[] => {
  const builder = document.builder;
  if (!builder) return [];
  const issues: string[] = [];
  if (!builder.client.company.trim()) issues.push('Client or company name is required.');
  if (builder.client.email.trim() && !z.string().email().safeParse(builder.client.email.trim()).success) issues.push('Enter a valid contact email or leave it blank.');
  if (!builder.project.title.trim()) issues.push('Project title is required.');
  if (!builder.project.overview.trim()) issues.push('Project overview is required.');
  const enabled = builder.services.filter(service => service.enabled);
  if (!enabled.length) issues.push('Select at least one service.');
  if (enabled.some(service => !service.scope.some(item => item.selected && item.title.trim()))) issues.push('Each service needs at least one selected scope item.');
  if (enabled.some(service => service.scope.some(item => item.selected && !item.title.trim()))) issues.push('Name every selected scope item.');
  if (builder.investment.legacyPricing.some(line => !line.name.trim())) issues.push('Name each investment item.');
  if (!builder.timeline.overallDuration.trim() && !builder.timeline.phases.length) issues.push('Add an overall duration or project phase.');
  if (builder.timeline.phases.some(phase => !phase.name.trim() || !phase.duration.trim())) issues.push('Complete each timeline phase name and duration.');
  if (!builder.milestones.length || builder.milestones.reduce((sum, item) => sum + item.percentage, 0) !== 100) issues.push('Payment milestones must total 100%.');
  if (builder.milestones.some(item => !item.description.trim())) issues.push('Name each payment milestone.');
  if (!builder.terms.some(term => term.enabled && term.title.trim() && term.text.trim()) || builder.terms.some(term => term.enabled && (!term.title.trim() || !term.text.trim()))) issues.push('Include at least one complete project term.');
  if (!builder.termsApproved) issues.push('Review and approve the final project terms.');
  return issues;
};
export const statusSchema = z.enum(proposalStatuses);
export const responseSchema = z.object({
  type: z.enum(['accepted', 'changes_requested', 'declined']), name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).optional(), message: z.string().trim().max(5000).optional(), agreed: z.boolean().optional(), submissionId: z.string().uuid(),
}).superRefine((data, context) => {
  if (data.type === 'accepted' && (!data.name || !data.email || data.agreed !== true)) context.addIssue({ code: 'custom', message: 'Name, email, and agreement are required to accept.' });
  if (data.type === 'changes_requested' && !data.message) context.addIssue({ code: 'custom', message: 'Please describe the requested changes.' });
});
