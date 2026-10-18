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
