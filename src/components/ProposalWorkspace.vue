<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { formatMoney } from '../lib/money';
import type { ProposalSummary } from '../lib/types';

const props = defineProps<{ initialProposals: ProposalSummary[]; initialTotal: number }>();
const search = ref('');
const proposals = ref(props.initialProposals);
const total = ref(props.initialTotal);
const loading = ref(false);
const error = ref('');
const currentPage = ref(0);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let activeRequest: AbortController | undefined;

const formatDate = (value: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
const statusLabel = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const loadPage = async (page: number, append = false) => {
  activeRequest?.abort();
  const request = new AbortController();
  activeRequest = request;
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({ page: String(page), q: search.value.trim() });
    const response = await fetch(`/api/admin/proposals?${params}`, { signal: request.signal });
    if (!response.ok) throw new Error('Unable to load proposals. Please try again.');
    const result = await response.json() as { proposals: ProposalSummary[]; total: number };
    proposals.value = append ? [...proposals.value, ...result.proposals] : result.proposals;
    total.value = result.total;
    currentPage.value = page;
  } catch (cause) {
    if (!request.signal.aborted) error.value = cause instanceof Error ? cause.message : 'Unable to load proposals.';
  } finally {
    if (activeRequest === request) loading.value = false;
  }
};

watch(search, () => {
  clearTimeout(searchTimer);
  activeRequest?.abort();
  searchTimer = setTimeout(() => { void loadPage(0); }, 150);
});

onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  activeRequest?.abort();
});
</script>

<template>
  <section class="workspace-search" aria-label="Search proposals">
    <label class="visually-hidden" for="proposal-search">Search proposals</label>
    <input id="proposal-search" v-model="search" type="search" placeholder="Search proposals..." autocomplete="off" />
  </section>
  <section class="workspace-list" aria-label="Proposal list" :aria-busy="loading">
    <div v-if="error" class="workspace-error" role="alert">{{ error }} <button type="button" @click="loadPage(currentPage)">Retry</button></div>
    <div v-if="proposals.length" class="workspace-table-wrap">
      <table class="workspace-table">
        <thead><tr><th scope="col">Proposal</th><th scope="col">Client</th><th scope="col">Investment</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          <tr v-for="proposal in proposals" :key="proposal.id">
            <td data-label="Proposal"><a class="workspace-proposal-name" :href="`/proposals/${proposal.id}/edit`">{{ proposal.projectName }}</a><span class="workspace-proposal-number">{{ proposal.proposalNumber }}</span></td>
            <td data-label="Client">{{ proposal.clientName }}</td>
            <td data-label="Investment">{{ formatMoney(proposal.totalMinor, proposal.currency) }}</td>
            <td data-label="Status"><span class="status" :class="`status-${proposal.status}`">{{ statusLabel(proposal.status) }}</span></td>
            <td data-label="Updated">{{ formatDate(proposal.updatedAt) }}</td>
            <td data-label="Actions"><span class="workspace-row-actions"><a :href="`/proposals/${proposal.id}/edit`">Edit</a><a :href="`/proposals/${proposal.id}/preview`">Preview</a></span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="!loading && !error" class="workspace-empty">{{ search ? 'No proposals match your search.' : 'No proposals yet.' }}</p>
    <div v-if="proposals.length && proposals.length < total" class="workspace-pagination"><button type="button" class="button button-secondary" :disabled="loading" @click="loadPage(currentPage + 1, true)">Load more</button><span>{{ proposals.length }} of {{ total }}</span></div>
    <p v-if="loading" class="workspace-loading" role="status">Loading proposals…</p>
  </section>
</template>
