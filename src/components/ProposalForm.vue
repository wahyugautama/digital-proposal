<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BuilderService, Client, Currency, ProposalBuilder, ProposalDocument } from '../lib/types';
import { calculateMilestones, formatMoney } from '../lib/money';
import { builderFromLegacy, calculateBuilderInvestment, createBuilder, createMilestones, MILESTONE_PRESETS, moneyInputValue, parseScaledDecimal, SERVICE_PRESETS, serviceLabel, suggestedPhases, syncBuilderDocument } from '../lib/proposal-builder';
import { getPublishIssues } from '../lib/schemas';
import BuilderMoveControls from './BuilderMoveControls.vue';

const props = defineProps<{
  initialDocument: ProposalDocument;
  clients: Client[];
  initialClientId: string;
  initialClient?: Client | null;
  proposalId: string | null;
  status: string;
  activeShareUrl: string | null;
  studioTerms?: string;
}>();

const document = ref<ProposalDocument>(JSON.parse(JSON.stringify(props.initialDocument)) as ProposalDocument);
const convertedLegacy = !document.value.builder;
if (!document.value.builder) document.value.builder = builderFromLegacy(document.value, props.studioTerms);
const builder = computed(() => document.value.builder as ProposalBuilder);
if (props.initialClient && !builder.value.client.company) {
  builder.value.client = { company: props.initialClient.company || props.initialClient.name, contactPerson: props.initialClient.name, email: props.initialClient.email };
}

const availableClients = ref<Client[]>(props.clients.map(client => ({ ...client })));
const clientId = ref(props.initialClientId);
const clientQuery = ref(builder.value.client.company);
const clientMenuOpen = ref(false);
const clientCreating = ref(false);
const currentId = ref(props.proposalId);
const currentStatus = ref(props.status);
const activeShareUrl = ref(props.activeShareUrl);
const saveState = ref<'saved' | 'saving' | 'unsaved' | 'error'>(props.proposalId ? 'saved' : 'unsaved');
const notice = ref('');
const error = ref('');
const amountError = ref('');
const isReadOnly = computed(() => currentStatus.value === 'accepted');
const filteredClients = computed(() => availableClients.value.filter(client => `${client.company || ''} ${client.name} ${client.email}`.toLowerCase().includes(clientQuery.value.toLowerCase())).slice(0, 8));
const investment = computed(() => { try { return calculateBuilderInvestment(builder.value); } catch { return null; } });
const milestonePercent = computed(() => builder.value.milestones.reduce((sum, item) => sum + (Number.isFinite(item.percentage) ? item.percentage : 0), 0));
const milestoneAmounts = computed(() => { try { return investment.value && milestonePercent.value === 100 ? calculateMilestones(investment.value.totalMinor, builder.value.milestones) : []; } catch { return []; } });
const publishIssues = computed(() => getPublishIssues(syncBuilderDocument(document.value)));

let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<boolean> | null = null;
let savedSnapshot = JSON.stringify({ clientId: clientId.value, document: syncBuilderDocument(document.value) });
const markDirty = () => {
  if (isReadOnly.value) return;
  if (JSON.stringify({ clientId: clientId.value, document: syncBuilderDocument(document.value) }) === savedSnapshot) return;
  saveState.value = 'unsaved';
  if (currentId.value) {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => { void handleSave(); }, 1200);
  }
};
watch([document, clientId], markDirty, { deep: true });

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (saveState.value === 'unsaved' || saveState.value === 'saving') event.preventDefault();
};
onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload));
onBeforeUnmount(() => { window.removeEventListener('beforeunload', handleBeforeUnload); clearTimeout(autosaveTimer); });

const handleClientQuery = (event: Event) => {
  clientQuery.value = (event.target as HTMLInputElement).value;
  builder.value.client.company = clientQuery.value;
  clientId.value = '';
  clientMenuOpen.value = true;
};
const handleClientBlur = () => { setTimeout(() => { clientMenuOpen.value = false; }, 150); };
const handleSelectClient = (client: Client) => {
  clientId.value = client.id;
  clientQuery.value = client.company || client.name;
  builder.value.client = { company: clientQuery.value, contactPerson: client.name, email: client.email };
  clientMenuOpen.value = false;
  error.value = '';
};
const handleCreateClient = async () => {
  const company = builder.value.client.company.trim();
  if (!company) { error.value = 'Enter a client or company name first.'; return; }
  const form = new FormData();
  form.set('name', builder.value.client.contactPerson.trim() || company);
  form.set('company', company);
  form.set('email', builder.value.client.email.trim());
  const contactPerson = builder.value.client.contactPerson;
  const contactEmail = builder.value.client.email;
  clientCreating.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/admin/clients', { method: 'POST', headers: { Accept: 'application/json' }, body: form });
    const result = await response.json();
    if (!response.ok || !result.client) throw new Error(result.error || 'Unable to save client.');
    const client = result.client as Client;
    if (!availableClients.value.some(item => item.id === client.id)) availableClients.value.push(client);
    handleSelectClient(client);
    if (result.reused) {
      builder.value.client.contactPerson = contactPerson;
      builder.value.client.email = contactEmail;
    }
    notice.value = result.reused ? 'Existing client selected.' : 'Client added.';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to save client.'; }
  finally { clientCreating.value = false; }
};

const handleServiceToggle = (service: BuilderService) => {
  service.enabled = !service.enabled;
  if (!builder.value.timeline.customized) builder.value.timeline.phases = suggestedPhases(builder.value.services);
};
const handleResetScope = (service: BuilderService) => {
  service.scope = structuredClone(createBuilder().services.find(item => item.type === service.type)?.scope ?? []);
};
const handleAddScope = (service: BuilderService) => service.scope.push({ id: crypto.randomUUID(), title: '', description: '', selected: true, custom: true });
const handleAddPhase = () => { builder.value.timeline.customized = true; builder.value.timeline.phases.push({ id: crypto.randomUUID(), name: '', duration: '', description: '' }); };
const handleResetPhases = () => { builder.value.timeline.customized = false; builder.value.timeline.phases = suggestedPhases(builder.value.services); };
const handleAddMilestone = () => builder.value.milestones.push({ id: crypto.randomUUID(), description: '', percentage: 0 });
const handleApplyMilestonePreset = (index: number) => { builder.value.milestones = createMilestones(MILESTONE_PRESETS[index]); };
const handleAddTerm = () => { builder.value.terms.push({ id: crypto.randomUUID(), title: '', text: '', enabled: true, custom: true }); builder.value.termsApproved = false; };
const handleMove = <T,>(items: T[], index: number, direction: -1 | 1) => {
  const next = index + direction;
  if (next < 0 || next >= items.length) return;
  items.splice(next, 0, items.splice(index, 1)[0]);
};

const handleSetMinor = (value: string, assign: (minor: number) => void, allowNegative = false) => {
  if (value === '-' || value === '.' || value === '-.' || value.endsWith('.')) return;
  try {
    const minor = value.trim() ? parseScaledDecimal(value, document.value.currency === 'USD' ? 2 : 0) : 0;
    if (!allowNegative && minor < 0) throw new Error('Enter a non-negative amount.');
    assign(minor);
    amountError.value = '';
  } catch (cause) { amountError.value = cause instanceof Error ? cause.message : 'Invalid amount.'; }
};
const handleSetPercentageAdjustment = (value: string) => {
  if (value === '-' || value === '.' || value === '-.' || value.endsWith('.')) return;
  try { if (builder.value.investment.adjustment) builder.value.investment.adjustment.value = value.trim() ? parseScaledDecimal(value, 2) : 0; amountError.value = ''; }
  catch (cause) { amountError.value = cause instanceof Error ? cause.message : 'Invalid percentage.'; }
};
const rebaseMinor = (minor: number, previous: Currency, next: Currency) => {
  if (previous === next) return minor;
  const value = BigInt(minor);
  const result = next === 'USD' ? value * 100n : value < 0n ? -((-value + 50n) / 100n) : (value + 50n) / 100n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Amount is too large for the selected currency.');
  return Number(result);
};
const handleCurrency = (event: Event) => {
  const next = (event.target as HTMLSelectElement).value as Currency;
  const previous = document.value.currency;
  if (next === previous) return;
  builder.value.services.forEach(service => { service.amountMinor = rebaseMinor(service.amountMinor, previous, next); });
  builder.value.investment.legacyPricing.forEach(line => { line.amountMinor = rebaseMinor(line.amountMinor, previous, next); });
  if (builder.value.investment.adjustment?.mode === 'fixed') builder.value.investment.adjustment.value = rebaseMinor(builder.value.investment.adjustment.value, previous, next);
  if (builder.value.investment.manualTotalMinor !== null) builder.value.investment.manualTotalMinor = rebaseMinor(builder.value.investment.manualTotalMinor, previous, next);
  document.value.currency = next;
};

const handleSave = async (): Promise<boolean> => {
  if (isReadOnly.value) return false;
  clearTimeout(autosaveTimer);
  if (inFlight) { await inFlight; if (saveState.value === 'saved') return true; }
  if (!clientId.value) { error.value = 'Select an existing client or add a new client before saving.'; saveState.value = 'error'; return false; }
  if (!investment.value) { error.value = 'Correct the investment before saving.'; saveState.value = 'error'; return false; }
  const snapshot = JSON.stringify({ clientId: clientId.value, document: syncBuilderDocument(document.value) });
  const request = async () => {
    saveState.value = 'saving';
    error.value = '';
    try {
      const response = await fetch(currentId.value ? `/api/admin/proposals/${currentId.value}` : '/api/admin/proposals', {
        method: currentId.value ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: snapshot,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save draft.');
      if (result.id && !currentId.value) {
        currentId.value = result.id;
        history.replaceState(null, '', `/proposals/${result.id}/edit`);
        window.document.title = 'Edit proposal — at 1801';
      }
      savedSnapshot = snapshot;
      saveState.value = JSON.stringify({ clientId: clientId.value, document: syncBuilderDocument(document.value) }) === snapshot ? 'saved' : 'unsaved';
      notice.value = 'Draft saved.';
      if (saveState.value === 'unsaved') markDirty();
      return true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Unable to save draft.';
      saveState.value = 'error';
      return false;
    }
  };
  inFlight = request();
  const result = await inFlight;
  inFlight = null;
  return result;
};
const handlePreview = async () => { if (await handleSave() && currentId.value) window.location.href = `/proposals/${currentId.value}/preview`; };
const handlePublish = async () => {
  if (publishIssues.value.length) { error.value = publishIssues.value[0]; return; }
  if (!await handleSave() || !currentId.value) return;
  const response = await fetch(`/api/admin/proposals/${currentId.value}/publish`, { method: 'POST' });
  const result = await response.json();
  if (!response.ok) { error.value = result.error || 'Unable to publish.'; return; }
  currentStatus.value = 'published';
  activeShareUrl.value = result.url;
  notice.value = `Published version ${result.version}. The client link is ready to share.`;
};
const handleCopyLink = async () => {
  if (!activeShareUrl.value) return;
  await navigator.clipboard.writeText(activeShareUrl.value);
  notice.value = 'Client link copied.';
};
const handleDuplicate = async () => {
  if (!currentId.value) return;
  const response = await fetch(`/api/admin/proposals/${currentId.value}/duplicate`, { method: 'POST' });
  const result = await response.json();
  if (response.ok) window.location.href = `/proposals/${result.id}/edit`;
  else error.value = result.error || 'Unable to duplicate proposal.';
};
</script>

<template>
  <div class="builder">
    <div class="builder-page-head">
      <a href="/" class="builder-back">← Back to proposals</a>
      <div class="builder-title-row"><h1>{{ currentId ? 'Edit proposal' : 'New proposal' }}</h1><span v-if="currentId" class="builder-state">{{ currentStatus.replaceAll('_', ' ') }}</span></div>
      <p v-if="currentStatus !== 'draft' && currentStatus !== 'accepted'" class="builder-revision-note">Changes here remain a draft revision until you publish a new version. The shared version stays unchanged.</p>
      <p v-if="convertedLegacy" class="builder-revision-note">This proposal began in the previous editor. Its original text and pricing are preserved below; review the structured sections before publishing a revision.</p>
      <p v-if="isReadOnly" class="builder-revision-note">Accepted proposals are immutable. Duplicate this proposal to prepare a new draft.</p>
    </div>

    <div v-if="error" class="builder-alert" role="alert">{{ error }}</div>
    <div v-if="notice" class="builder-notice" role="status">{{ notice }}</div>

    <fieldset class="builder-fieldset" :disabled="isReadOnly">
      <section id="project-details" class="builder-section">
        <div class="builder-section-heading"><span>01 /</span><h2>Project Details</h2></div>
        <div class="builder-fields">
          <div class="builder-field builder-wide builder-client-field">
            <label for="builder-client">Client / company name <span aria-hidden="true">*</span></label>
            <input id="builder-client" :value="clientQuery" autocomplete="off" placeholder="Search existing clients or enter a new name" @input="handleClientQuery" @focus="clientMenuOpen = true" @blur="handleClientBlur" @keydown.esc="clientMenuOpen = false" />
            <div v-if="clientMenuOpen && filteredClients.length" class="builder-client-options" role="listbox" aria-label="Existing clients">
              <button v-for="client in filteredClients" :key="client.id" type="button" role="option" :aria-selected="client.id === clientId" @click="handleSelectClient(client)">{{ client.company || client.name }} <small>{{ client.name }}{{ client.email ? ` · ${client.email}` : '' }}</small></button>
            </div>
            <small v-if="clientId" class="builder-field-hint">Existing client selected</small>
            <button v-else type="button" class="builder-text-action" :disabled="clientCreating" @click="handleCreateClient">{{ clientCreating ? 'Adding client…' : '+ Add this client' }}</button>
          </div>
          <div class="builder-field"><label for="builder-contact">Contact person</label><input id="builder-contact" v-model="builder.client.contactPerson" autocomplete="name" /></div>
          <div class="builder-field"><label for="builder-email">Contact email</label><input id="builder-email" v-model="builder.client.email" type="email" autocomplete="email" /></div>
          <div class="builder-field builder-wide"><label for="builder-project-title">Project title <span aria-hidden="true">*</span></label><input id="builder-project-title" v-model="builder.project.title" placeholder="What are we creating together?" /></div>
          <div class="builder-field"><label for="builder-proposal-type">Proposal format</label><select id="builder-proposal-type" v-model="document.proposalType"><option value="full">Full proposal</option><option value="quick">Quick proposal</option></select></div>
          <div class="builder-field builder-wide"><label for="builder-overview">Project overview</label><textarea id="builder-overview" v-model="builder.project.overview" rows="7" placeholder="Describe the opportunity, context, and desired outcome."></textarea></div>
          <div v-if="builder.legacyNotes" class="builder-field builder-wide"><label for="builder-legacy-notes">Previous scope and timeline (reference only)</label><textarea id="builder-legacy-notes" v-model="builder.legacyNotes" rows="7"></textarea><small class="builder-field-hint">Preserved with this draft. Select services and phases above to include them in the new proposal version.</small></div>
        </div>
      </section>

      <section id="services-scope" class="builder-section">
        <div class="builder-section-heading"><span>02 /</span><h2>Services &amp; Scope</h2></div>
        <p class="builder-section-intro">Select the services and only the deliverables this proposal includes.</p>
        <div v-for="service in builder.services" :key="service.type" class="builder-service">
          <label class="builder-service-toggle"><input type="checkbox" :checked="service.enabled" @change="handleServiceToggle(service)" /><strong>{{ serviceLabel(service.type) }}</strong></label>
          <div v-if="service.enabled" class="builder-service-content">
            <div v-for="(item, index) in service.scope" :key="item.id" class="builder-repeat-row">
              <label class="builder-scope-check"><input v-model="item.selected" type="checkbox" /><span v-if="!item.custom">{{ item.title }}</span><input v-else v-model="item.title" aria-label="Custom scope title" placeholder="Custom scope item" /></label>
              <BuilderMoveControls :index="index" :length="service.scope.length" :label="item.title || 'scope item'" :removable="item.custom" @move-up="handleMove(service.scope, index, -1)" @move-down="handleMove(service.scope, index, 1)" @remove="service.scope.splice(index, 1)" />
              <textarea v-if="item.selected" v-model="item.description" rows="2" :aria-label="`Description for ${item.title || 'custom scope item'}`" placeholder="Optional scope details"></textarea>
            </div>
            <div class="builder-inline-actions"><button type="button" class="builder-text-action" @click="handleAddScope(service)">+ Add custom scope</button><button type="button" class="builder-text-action" @click="handleResetScope(service)">Reset to defaults</button></div>
          </div>
        </div>
      </section>

      <section id="estimated-timeline" class="builder-section">
        <div class="builder-section-heading"><span>03 /</span><h2>Estimated Timeline</h2></div>
        <div class="builder-field"><label for="builder-duration">Overall project duration</label><input id="builder-duration" v-model="builder.timeline.overallDuration" placeholder="e.g. 6–8 weeks" /></div>
        <div class="builder-subheading"><h3>Project phases</h3><button type="button" class="builder-text-action" @click="handleResetPhases">Use suggested phases</button></div>
        <div v-for="(phase, index) in builder.timeline.phases" :key="phase.id" class="builder-phase-row">
          <span class="builder-row-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <div class="builder-field"><label :for="`phase-name-${phase.id}`">Phase name</label><input :id="`phase-name-${phase.id}`" v-model="phase.name" @input="builder.timeline.customized = true" /></div>
          <div class="builder-field"><label :for="`phase-duration-${phase.id}`">Duration</label><input :id="`phase-duration-${phase.id}`" v-model="phase.duration" placeholder="e.g. 2–3 weeks" @input="builder.timeline.customized = true" /></div>
          <div class="builder-field builder-phase-description"><label :for="`phase-description-${phase.id}`">Description</label><input :id="`phase-description-${phase.id}`" v-model="phase.description" @input="builder.timeline.customized = true" /></div>
          <BuilderMoveControls :index="index" :length="builder.timeline.phases.length" :label="phase.name || 'phase'" removable @move-up="handleMove(builder.timeline.phases, index, -1); builder.timeline.customized = true" @move-down="handleMove(builder.timeline.phases, index, 1); builder.timeline.customized = true" @remove="builder.timeline.phases.splice(index, 1); builder.timeline.customized = true" />
        </div>
        <button type="button" class="builder-text-action builder-add" @click="handleAddPhase">+ Add phase</button>
        <div class="builder-field builder-note"><label for="builder-timeline-note">Timeline note</label><textarea id="builder-timeline-note" v-model="builder.timeline.note" rows="3" placeholder="Optional timing assumptions"></textarea></div>
      </section>

      <section id="project-investment" class="builder-section">
        <div class="builder-section-heading"><span>04 /</span><h2>Project Investment</h2></div>
        <div class="builder-field builder-currency"><label for="builder-currency">Currency</label><select id="builder-currency" :value="document.currency" @change="handleCurrency"><option>USD</option><option>IDR</option></select><small class="builder-field-hint">Changing currency keeps the entered figures; no exchange rate is applied.</small></div>
        <div v-for="service in builder.services.filter(item => item.enabled)" :key="service.type" class="builder-price-row"><label :for="`price-${service.type}`">{{ serviceLabel(service.type) }}</label><div class="builder-money-input"><span>{{ document.currency === 'USD' ? '$' : 'Rp' }}</span><input :id="`price-${service.type}`" type="text" inputmode="decimal" :value="moneyInputValue(service.amountMinor, document.currency)" @input="handleSetMinor(($event.target as HTMLInputElement).value, value => service.amountMinor = value)" /></div></div>
        <div v-for="(line, index) in builder.investment.legacyPricing" :key="line.id" class="builder-price-row"><input v-model="line.name" aria-label="Legacy investment item name" /><div class="builder-money-input"><span>{{ document.currency === 'USD' ? '$' : 'Rp' }}</span><input type="text" inputmode="decimal" :aria-label="`Amount for ${line.name}`" :value="moneyInputValue(line.amountMinor, document.currency)" @input="handleSetMinor(($event.target as HTMLInputElement).value, value => line.amountMinor = value)" /></div><button type="button" class="builder-remove" :aria-label="`Remove ${line.name}`" @click="builder.investment.legacyPricing.splice(index, 1)">×</button></div>
        <div class="builder-adjustment"><label for="builder-adjustment-mode">Package adjustment</label><select id="builder-adjustment-mode" :value="builder.investment.adjustment?.mode || 'none'" @change="builder.investment.adjustment = ($event.target as HTMLSelectElement).value === 'none' ? null : { mode: ($event.target as HTMLSelectElement).value as 'fixed' | 'percentage', value: 0 }"><option value="none">None</option><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select><input v-if="builder.investment.adjustment" type="text" inputmode="decimal" aria-label="Package adjustment amount" :value="builder.investment.adjustment.mode === 'fixed' ? moneyInputValue(builder.investment.adjustment.value, document.currency) : builder.investment.adjustment.value / 100" @input="builder.investment.adjustment?.mode === 'fixed' ? handleSetMinor(($event.target as HTMLInputElement).value, value => builder.investment.adjustment!.value = value, true) : handleSetPercentageAdjustment(($event.target as HTMLInputElement).value)" /><span v-if="builder.investment.adjustment?.mode === 'percentage'">%</span></div>
        <label class="builder-override"><input type="checkbox" :checked="builder.investment.manualTotalMinor !== null" @change="builder.investment.manualTotalMinor = ($event.target as HTMLInputElement).checked ? (investment?.totalMinor ?? 0) : null" /> Manually set final total</label>
        <div v-if="builder.investment.manualTotalMinor !== null" class="builder-price-row"><label for="builder-manual-total">Final total</label><div class="builder-money-input"><span>{{ document.currency === 'USD' ? '$' : 'Rp' }}</span><input id="builder-manual-total" type="text" inputmode="decimal" :value="moneyInputValue(builder.investment.manualTotalMinor, document.currency)" @input="handleSetMinor(($event.target as HTMLInputElement).value, value => builder.investment.manualTotalMinor = value)" /></div></div>
        <p v-if="amountError" class="builder-inline-error" role="alert">{{ amountError }}</p>
        <div v-if="investment" class="builder-totals"><div><span>Subtotal</span><strong>{{ formatMoney(investment.subtotalMinor, document.currency) }}</strong></div><div v-if="builder.investment.adjustment"><span>Package adjustment</span><strong>{{ formatMoney(investment.packageAdjustmentMinor, document.currency) }}</strong></div><div v-if="builder.investment.manualTotalMinor !== null"><span>Manual total difference</span><strong>{{ formatMoney(investment.manualDifferenceMinor, document.currency) }}</strong></div><div class="builder-total-final"><span>Total investment</span><strong>{{ formatMoney(investment.totalMinor, document.currency) }}</strong></div></div>
        <p v-else class="builder-inline-error" role="alert">Total investment cannot be negative or exceed the supported amount.</p>
      </section>

      <section id="payment-milestones" class="builder-section">
        <div class="builder-section-heading"><span>05 /</span><h2>Payment Milestones</h2></div>
        <div class="builder-presets"><span>Start with</span><button v-for="(preset, index) in MILESTONE_PRESETS" :key="preset.label" type="button" @click="handleApplyMilestonePreset(index)">{{ preset.label }}</button></div>
        <div v-for="(milestone, index) in builder.milestones" :key="milestone.id" class="builder-milestone-row"><div class="builder-field"><label :for="`milestone-name-${milestone.id}`">Milestone</label><input :id="`milestone-name-${milestone.id}`" v-model="milestone.description" /></div><div class="builder-field"><label :for="`milestone-percent-${milestone.id}`">Percentage</label><input :id="`milestone-percent-${milestone.id}`" type="number" min="0" max="100" step="1" :value="milestone.percentage" @input="milestone.percentage = Number(($event.target as HTMLInputElement).value || 0)" /></div><strong>{{ formatMoney(milestoneAmounts[index]?.amountMinor ?? 0, document.currency) }}</strong><BuilderMoveControls :index="index" :length="builder.milestones.length" :label="milestone.description || 'milestone'" removable @move-up="handleMove(builder.milestones, index, -1)" @move-down="handleMove(builder.milestones, index, 1)" @remove="builder.milestones.splice(index, 1)" /></div>
        <button type="button" class="builder-text-action builder-add" @click="handleAddMilestone">+ Add milestone</button>
        <p class="builder-milestone-summary" :class="{ invalid: milestonePercent !== 100 }">{{ milestonePercent }}% allocated <span>{{ milestonePercent === 100 ? `Total ${formatMoney(investment?.totalMinor ?? 0, document.currency)}` : 'Must equal 100% before publishing' }}</span></p>
      </section>

      <section id="project-terms" class="builder-section">
        <div class="builder-section-heading"><span>06 /</span><h2>Project Terms</h2></div>
        <p class="builder-section-intro">These are editable starting points, not legally reviewed terms. Include only the clauses you approve for this proposal.</p>
        <div v-for="(term, index) in builder.terms" :key="term.id" class="builder-term"><div class="builder-term-top"><label><input v-model="term.enabled" type="checkbox" @change="builder.termsApproved = false" /><input v-model="term.title" :aria-label="`Title for ${term.title || 'clause'}`" placeholder="Clause title" @input="builder.termsApproved = false" /></label><BuilderMoveControls :index="index" :length="builder.terms.length" :label="term.title || 'clause'" :removable="term.custom" @move-up="handleMove(builder.terms, index, -1); builder.termsApproved = false" @move-down="handleMove(builder.terms, index, 1); builder.termsApproved = false" @remove="builder.terms.splice(index, 1); builder.termsApproved = false" /></div><textarea v-if="term.enabled" v-model="term.text" rows="4" :aria-label="`Wording for ${term.title || 'custom clause'}`" placeholder="Write the final clause wording" @input="builder.termsApproved = false"></textarea></div>
        <button type="button" class="builder-text-action builder-add" @click="handleAddTerm">+ Add custom clause</button>
        <label class="builder-approval"><input v-model="builder.termsApproved" type="checkbox" /> I have reviewed and approve the included project terms.</label>
      </section>
    </fieldset>

    <div class="builder-action-bar"><div class="builder-action-inner"><span class="builder-save-state" role="status">{{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : 'Unsaved changes' }}</span><div class="builder-action-buttons"><button v-if="isReadOnly" type="button" class="button button-primary" @click="handleDuplicate">Duplicate proposal</button><template v-else><button type="button" class="button button-secondary" :disabled="saveState === 'saving'" @click="handleSave">Save Draft</button><button type="button" class="button button-secondary" :disabled="saveState === 'saving'" @click="handlePreview">Preview</button><button v-if="currentId" type="button" class="button button-primary" :disabled="saveState === 'saving'" @click="handlePublish">Publish</button></template><button v-if="activeShareUrl" type="button" class="builder-text-action" @click="handleCopyLink">Copy client link</button></div></div></div>
  </div>
</template>

<style src="../styles/proposal-builder.css"></style>
