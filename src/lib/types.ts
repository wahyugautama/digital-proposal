export const proposalStatuses = [
  'draft', 'published', 'viewed', 'changes_requested', 'accepted', 'declined', 'expired', 'archived',
] as const;

export type ProposalStatus = (typeof proposalStatuses)[number];
export type ProposalType = 'quick' | 'full';
export type Currency = 'USD' | 'IDR';

export interface ProposalSection {
  id: string;
  title: string;
  enabled: boolean;
  content: string;
  kind: 'text' | 'scope' | 'timeline' | 'investment' | 'payment' | 'terms' | 'acceptance';
}

export interface PricingPhase { id: string; name: string; description: string; amountMinor: number }
export interface PaymentMilestone { id: string; percentage: number; description: string }

export type ServiceType = 'brand_identity' | 'web_design' | 'web_development';
export interface ScopeItem { id: string; title: string; description: string; selected: boolean; custom: boolean }
export interface BuilderService { type: ServiceType; enabled: boolean; amountMinor: number; scope: ScopeItem[] }
export interface TimelinePhase { id: string; name: string; duration: string; description: string }
export interface TermsClause { id: string; title: string; text: string; enabled: boolean; custom: boolean }
export interface BuilderAdjustment { mode: 'fixed' | 'percentage'; value: number }
export interface ProposalBuilder {
  version: 1;
  client: { company: string; contactPerson: string; email: string };
  project: { title: string; overview: string };
  services: BuilderService[];
  timeline: { overallDuration: string; phases: TimelinePhase[]; note: string; customized: boolean };
  investment: { adjustment: BuilderAdjustment | null; manualTotalMinor: number | null; legacyPricing: PricingPhase[] };
  milestones: PaymentMilestone[];
  terms: TermsClause[];
  termsApproved: boolean;
  legacyNotes: string;
}

export interface ProposalDocument {
  title: string;
  projectName: string;
  proposalNumber: string;
  proposalType: ProposalType;
  issueDate: string;
  expirationDate: string;
  currency: Currency;
  pricingDisplay: 'total' | 'phases';
  phases: PricingPhase[];
  discountMinor: number;
  taxBasisPoints: number;
  milestones: PaymentMilestone[];
  sections: ProposalSection[];
  builder?: ProposalBuilder;
}

export interface Client { id: string; name: string; company: string | null; email: string; phone?: string | null }

export interface ProposalSummary {
  id: string;
  clientId: string;
  clientName: string;
  proposalNumber: string;
  projectName: string;
  proposalType: ProposalType;
  status: ProposalStatus;
  currency: Currency;
  totalMinor: number;
  updatedAt: string;
  activeToken?: string | null;
}
