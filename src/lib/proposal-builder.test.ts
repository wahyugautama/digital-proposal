import { describe, expect, it } from 'vitest';
import { calculateMilestones, formatMoney } from './money';
import { builderFromLegacy, calculateBuilderInvestment, createBuilder, makeBuilderDocument, parseScaledDecimal, suggestedPhases, syncBuilderDocument } from './proposal-builder';
import { getPublishIssues, proposalDocumentSchema } from './schemas';
import { makeDocument } from './templates';

describe('structured proposal builder', () => {
  it('saves an incomplete builder document without requiring publish-ready content', () => {
    const document = makeBuilderDocument();
    expect(proposalDocumentSchema.safeParse(syncBuilderDocument(document)).success).toBe(true);
    expect(getPublishIssues(document).length).toBeGreaterThan(0);
  });

  it('stores only enabled services and selected scope, with editable custom items', () => {
    const builder = createBuilder();
    builder.services[0].enabled = true;
    builder.services[0].scope[0].selected = true;
    builder.services[0].scope.push({ id: 'custom', title: 'Packaging', description: 'Two concepts', selected: true, custom: true });
    builder.services[0].amountMinor = 300_000;
    expect(builder.services.filter(service => service.enabled).map(service => service.type)).toEqual(['brand_identity']);
    expect(builder.services[0].scope.filter(item => item.selected).map(item => item.title)).toEqual(['Brand Discovery & Research', 'Packaging']);
    expect(calculateBuilderInvestment(builder).subtotalMinor).toBe(300_000);
  });

  it('suggests phases based on services without requiring their durations to sum to the overall estimate', () => {
    const builder = createBuilder();
    builder.services[1].enabled = true;
    builder.services[2].enabled = true;
    expect(suggestedPhases(builder.services).map(phase => phase.name)).toEqual(['Discovery & Direction', 'Web Design', 'Web Development', 'QA & Launch']);
  });

  it('calculates signed fixed and percentage adjustments in integer minor units', () => {
    const builder = createBuilder();
    builder.services[0].enabled = true;
    builder.services[0].amountMinor = 300_000;
    builder.services[1].enabled = true;
    builder.services[1].amountMinor = 400_000;
    builder.investment.adjustment = { mode: 'fixed', value: -50_000 };
    expect(calculateBuilderInvestment(builder)).toMatchObject({ subtotalMinor: 700_000, packageAdjustmentMinor: -50_000, totalMinor: 650_000 });
    builder.investment.adjustment = { mode: 'percentage', value: 1250 };
    expect(calculateBuilderInvestment(builder).totalMinor).toBe(787_500);
    builder.investment.manualTotalMinor = 800_000;
    expect(calculateBuilderInvestment(builder).manualDifferenceMinor).toBe(12_500);
    builder.investment.manualTotalMinor = null;
    builder.investment.adjustment = { mode: 'fixed', value: -800_000 };
    expect(() => calculateBuilderInvestment(builder)).toThrow(/non-negative/);
  });

  it('parses precise USD and IDR amounts and formats whole amounts', () => {
    expect(parseScaledDecimal('10000.25', 2)).toBe(1_000_025);
    expect(parseScaledDecimal('150000000', 0)).toBe(150_000_000);
    expect(formatMoney(1_000_000, 'USD')).toBe('$10,000');
    expect(formatMoney(150_000_000, 'IDR')).toBe('Rp 150.000.000');
    expect(() => parseScaledDecimal('1.234', 2)).toThrow();
  });

  it('allocates rounding residue to the final milestone', () => {
    const result = calculateMilestones(11_001, [
      { id: 'a', description: 'Start', percentage: 40 },
      { id: 'b', description: 'Design', percentage: 30 },
      { id: 'c', description: 'Finish', percentage: 30 },
    ]);
    expect(result.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(11_001);
    expect(result.at(-1)?.amountMinor).toBe(3_301);
  });

  it('validates services, scope, milestones, and approved terms before publishing', () => {
    const document = makeBuilderDocument();
    const builder = document.builder!;
    builder.client.company = 'Studio Acme';
    builder.project.title = 'Brand launch';
    builder.project.overview = 'A new identity.';
    builder.services[0].enabled = true;
    builder.services[0].scope[0].selected = true;
    builder.timeline.overallDuration = '6 weeks';
    builder.terms[0].enabled = true;
    builder.terms[0].text = 'Payment on agreed milestones.';
    builder.termsApproved = true;
    expect(getPublishIssues(document)).toEqual([]);
    builder.milestones[0].percentage = 35;
    expect(getPublishIssues(document)).toContain('Payment milestones must total 100%.');
    builder.milestones[0].percentage = 40;
    builder.terms[0].enabled = false;
    expect(getPublishIssues(document)).toContain('Include at least one complete project term.');
  });

  it('preserves legacy content and pricing when preparing an existing draft for the builder', () => {
    const legacy = makeDocument('Legacy project', 'full', 50_000);
    const builder = builderFromLegacy(legacy);
    expect(builder.legacyNotes).toContain('Scope of Work');
    expect(builder.investment.legacyPricing[0].amountMinor).toBe(50_000);
    expect(legacy.sections.some(section => section.kind === 'scope')).toBe(true);
  });
});
