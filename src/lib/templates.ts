import type { ProposalDocument, ProposalSection, ProposalType } from './types';

const section = (id: string, title: string, kind: ProposalSection['kind'], content: string): ProposalSection => ({ id, title, kind, content, enabled: true });
const fullSections = [
  section('introduction', 'Introduction', 'text', 'Thank you for considering Sandikala Studio as your creative partner.'),
  section('understanding', 'Project Understanding', 'text', 'We understand this project as an opportunity to clarify your position and create a confident digital presence.'),
  section('goals', 'Goals & Objectives', 'text', 'Create a distinctive, useful, and durable brand experience that supports measurable business goals.'),
  section('approach', 'Recommended Approach', 'text', 'Our process moves from alignment and creative direction through design, development, testing, and launch.'),
  section('scope', 'Scope of Work', 'scope', 'Discovery and strategy\nCreative direction\nDesign system\nResponsive experience\nQuality assurance'),
  section('deliverables', 'Deliverables', 'scope', 'Final design files\nProduction-ready website\nHandover documentation'),
  section('timeline', 'Project Timeline', 'timeline', 'Discovery — 1 week\nDesign — 3 weeks\nDevelopment — 3 weeks\nTesting and launch — 1 week'),
  section('investment', 'Investment', 'investment', ''), section('payment', 'Payment Schedule', 'payment', ''),
  section('terms', 'Terms & Conditions', 'terms', 'Two rounds of revisions are included per phase. Third-party costs and out-of-scope work require written approval. This proposal is valid until the expiration date shown.'),
  section('acceptance', 'Next Steps', 'acceptance', 'Accept this proposal to reserve the project and begin onboarding.'),
];
const quickSections = [
  section('overview', 'Project Overview', 'text', 'A focused engagement designed to deliver the agreed outcome efficiently.'),
  section('scope', 'Scope of Work', 'scope', 'Project setup\nDesign and production\nFinal delivery'), section('deliverables', 'Deliverables', 'scope', 'Final production files'),
  section('timeline', 'Timeline', 'timeline', 'Estimated delivery: 3–4 weeks from commencement.'), section('investment', 'Investment', 'investment', ''),
  section('payment', 'Payment Terms', 'payment', ''), section('terms', 'Terms & Conditions', 'terms', 'This quotation is valid until the expiration date shown.'),
  section('acceptance', 'Acceptance', 'acceptance', 'Accept this quotation to confirm the engagement.'),
];

const date = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
export const makeDocument = (name: string, type: ProposalType, amountMinor: number): ProposalDocument => ({
  title: name, projectName: name, proposalNumber: `SP-${new Date().getFullYear()}-001`, proposalType: type,
  issueDate: date(0), expirationDate: date(14), currency: 'USD', pricingDisplay: 'phases',
  phases: [{ id: crypto.randomUUID(), name: type === 'quick' ? 'Project delivery' : 'Discovery & Creative Direction', description: '', amountMinor }],
  discountMinor: 0, taxBasisPoints: 0,
  milestones: [{ id: crypto.randomUUID(), percentage: 40, description: 'Project commencement' }, { id: crypto.randomUUID(), percentage: 30, description: 'Design approval' }, { id: crypto.randomUUID(), percentage: 30, description: 'Prior to launch or final delivery' }],
  sections: structuredClone(type === 'quick' ? quickSections : fullSections),
});

export const initialTemplates = [
  { name: 'Website Design & Development', document: makeDocument('Website Design & Development', 'full', 1100000) },
  { name: 'Website Development Only', document: makeDocument('Website Development', 'full', 700000) },
  { name: 'Brand Identity', document: makeDocument('Brand Identity', 'full', 600000) },
  { name: 'Brand Identity + Website', document: makeDocument('Brand Identity + Website', 'full', 1500000) },
  { name: 'Quick Quotation', document: makeDocument('Project Quotation', 'quick', 300000) },
];
