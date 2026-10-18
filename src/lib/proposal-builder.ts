import type { BuilderService, Currency, PaymentMilestone, ProposalBuilder, ProposalDocument, ServiceType, TimelinePhase } from './types';
import { makeDocument } from './templates';

export const SERVICE_PRESETS: { type: ServiceType; label: string; scope: string[] }[] = [
  { type: 'brand_identity', label: 'Brand Identity', scope: ['Brand Discovery & Research', 'Brand Strategy', 'Creative Direction', 'Logo Design', 'Visual Identity System', 'Typography & Color Palette', 'Brand Guidelines', 'Brand Applications', 'Other / Custom Scope'] },
  { type: 'web_design', label: 'Web Design', scope: ['Sitemap & Information Architecture', 'Wireframing', 'Art Direction', 'UX/UI Design', 'Responsive Design', 'Interactive Prototyping', 'Design System', 'Other / Custom Scope'] },
  { type: 'web_development', label: 'Web Development', scope: ['Webflow Development', 'Custom Web Development', 'CMS Integration', 'Responsive Implementation', 'Animations & Interactions', 'Third-Party Integrations', 'Technical SEO Setup', 'Testing & Quality Assurance', 'Deployment & Launch', 'Other / Custom Scope'] },
];

export const TERM_TITLES = ['Payment Terms', 'Scope of Work', 'Revisions', 'Client Responsibilities', 'Additional Work', 'Intellectual Property', 'Project Timeline & Delays', 'Cancellation & Termination'];
export const MILESTONE_PRESETS = [
  { label: '50 / 50', percentages: [50, 50], names: ['Project Commencement', 'Project Completion'] },
  { label: '40 / 30 / 30', percentages: [40, 30, 30], names: ['Project Commencement', 'Design Approval', 'Project Completion'] },
  { label: '25 / 35 / 40', percentages: [25, 35, 40], names: ['Project Commencement', 'Design Approval', 'Project Completion'] },
] as const;

const uuid = () => crypto.randomUUID();
export const serviceLabel = (type: ServiceType) => SERVICE_PRESETS.find(service => service.type === type)?.label ?? type;
export const createMilestones = (preset: (typeof MILESTONE_PRESETS)[number]): PaymentMilestone[] =>
  preset.percentages.map((percentage, index) => ({ id: uuid(), percentage, description: preset.names[index] }));

export const suggestedPhases = (services: BuilderService[]): TimelinePhase[] => {
  const active = services.filter(service => service.enabled).map(service => service.type);
  if (!active.length) return [];
  const phases: [string, string][] = [['Discovery & Direction', '1 week']];
  if (active.includes('brand_identity')) phases.push(['Brand Identity', '2–3 weeks']);
  if (active.includes('web_design')) phases.push(['Web Design', '2–3 weeks']);
  if (active.includes('web_development')) phases.push(['Web Development', '3 weeks'], ['QA & Launch', '1 week']);
  return phases.map(([name, duration]) => ({ id: uuid(), name, duration, description: '' }));
};

export const createBuilder = (studioTerms = ''): ProposalBuilder => ({
  version: 1,
  client: { company: '', contactPerson: '', email: '' },
  project: { title: '', overview: '' },
  services: SERVICE_PRESETS.map(({ type, scope }) => ({ type, enabled: false, amountMinor: 0, scope: scope.map((title, index) => ({ id: `${type}-${index}`, title, description: '', selected: false, custom: title === 'Other / Custom Scope' })) })),
  timeline: { overallDuration: '', phases: [], note: '', customized: false },
  investment: { adjustment: null, manualTotalMinor: null, legacyPricing: [] },
  milestones: createMilestones(MILESTONE_PRESETS[1]),
  terms: [
    ...TERM_TITLES.map((title, index) => ({ id: `standard-${index}`, title, text: '', enabled: false, custom: false })),
    ...(studioTerms.trim() ? [{ id: 'studio-terms', title: 'Studio terms', text: studioTerms.trim(), enabled: true, custom: false }] : []),
  ],
  termsApproved: false,
  legacyNotes: '',
});

export const makeBuilderDocument = (studioTerms = ''): ProposalDocument => ({
  ...makeDocument('Untitled project', 'full', 0),
  builder: createBuilder(studioTerms),
});

export const builderFromLegacy = (document: ProposalDocument, studioTerms = ''): ProposalBuilder => {
  const builder = createBuilder(studioTerms);
  builder.project.title = document.projectName;
  builder.project.overview = document.sections.filter(section => section.enabled && section.kind === 'text').map(section => `${section.title}\n${section.content}`).join('\n\n');
  builder.legacyNotes = document.sections.filter(section => section.enabled && ['scope', 'timeline'].includes(section.kind)).map(section => `${section.title}\n${section.content}`).join('\n\n');
  builder.timeline.note = document.sections.find(section => section.enabled && section.kind === 'timeline')?.content ?? '';
  builder.investment.legacyPricing = document.phases.map(phase => ({ ...phase }));
  builder.milestones = document.milestones.map(milestone => ({ ...milestone }));
  const terms = document.sections.find(section => section.enabled && section.kind === 'terms');
  if (terms?.content.trim()) builder.terms.push({ id: uuid(), title: terms.title, text: terms.content, enabled: true, custom: true });
  return builder;
};

const assertMinor = (value: number) => {
  if (!Number.isSafeInteger(value)) throw new Error('Investment amounts must be whole minor units.');
  return value;
};
const roundedDivide = (numerator: bigint, denominator: bigint) => numerator >= 0n
  ? (numerator + denominator / 2n) / denominator
  : -((-numerator + denominator / 2n) / denominator);

export const calculateBuilderInvestment = (builder: ProposalBuilder) => {
  const serviceLines = builder.services.filter(service => service.enabled).map(service => ({ name: serviceLabel(service.type), amountMinor: assertMinor(service.amountMinor) }));
  const legacyLines = builder.investment.legacyPricing.map(line => ({ name: line.name, amountMinor: assertMinor(line.amountMinor) }));
  const subtotalBig = [...serviceLines, ...legacyLines].reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);
  const adjustment = builder.investment.adjustment;
  const packageBig = !adjustment ? 0n : adjustment.mode === 'fixed'
    ? BigInt(assertMinor(adjustment.value))
    : roundedDivide(subtotalBig * BigInt(assertMinor(adjustment.value)), 10_000n);
  const calculatedBig = subtotalBig + packageBig;
  const manualBig = builder.investment.manualTotalMinor === null ? null : BigInt(assertMinor(builder.investment.manualTotalMinor));
  const totalBig = manualBig ?? calculatedBig;
  if (totalBig < 0n || totalBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Total investment must be a non-negative safe amount.');
  const subtotalMinor = Number(subtotalBig);
  const packageAdjustmentMinor = Number(packageBig);
  const manualDifferenceMinor = manualBig === null ? 0 : Number(manualBig - calculatedBig);
  if (![subtotalMinor, packageAdjustmentMinor, manualDifferenceMinor].every(Number.isSafeInteger)) throw new Error('Investment amount is too large.');
  return { serviceLines, legacyLines, subtotalMinor, packageAdjustmentMinor, manualDifferenceMinor, totalMinor: Number(totalBig) };
};

export const parseScaledDecimal = (value: string, precision: number): number => {
  const trimmed = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match || (match[3]?.length ?? 0) > precision) throw new Error(`Enter a number with no more than ${precision} decimal places.`);
  const units = BigInt(match[2]) * 10n ** BigInt(precision);
  const fraction = BigInt((match[3] ?? '').padEnd(precision, '0') || '0');
  const result = (match[1] ? -1n : 1n) * (units + fraction);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Amount is too large.');
  return Number(result);
};

export const moneyInputValue = (minor: number, currency: Currency) => {
  const scale = currency === 'USD' ? 100 : 1;
  return String(minor / scale);
};

export const syncBuilderDocument = (document: ProposalDocument): ProposalDocument => {
  if (!document.builder) return document;
  const builder = document.builder;
  const title = builder.project.title.trim() || 'Untitled project';
  const phases = [...builder.services.filter(service => service.enabled).map(service => ({ id: service.type, name: serviceLabel(service.type), description: '', amountMinor: service.amountMinor })), ...builder.investment.legacyPricing.map(phase => ({ ...phase, name: phase.name.trim() || 'Untitled investment item' }))];
  const milestonesReady = builder.milestones.length > 0 && builder.milestones.every(item => item.percentage > 0 && item.description.trim()) && builder.milestones.reduce((sum, milestone) => sum + milestone.percentage, 0) === 100;
  return {
    ...document,
    title,
    projectName: title,
    phases: phases.length ? phases : [{ id: 'unpriced', name: 'Unpriced draft', description: '', amountMinor: 0 }],
    milestones: milestonesReady ? builder.milestones : document.milestones,
    pricingDisplay: 'phases',
    discountMinor: 0,
    taxBasisPoints: 0,
  };
};
