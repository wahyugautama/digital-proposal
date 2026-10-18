<script setup lang="ts">
defineProps<{ index: number; length: number; label: string; removable?: boolean }>();
defineEmits<{ moveUp: []; moveDown: []; remove: [] }>();
</script>

<template>
  <div class="builder-row-actions">
    <button type="button" :disabled="index === 0" :aria-label="`Move ${label} up`" @click="$emit('moveUp')">↑</button>
    <button type="button" :disabled="index === length - 1" :aria-label="`Move ${label} down`" @click="$emit('moveDown')">↓</button>
    <button v-if="removable" type="button" :aria-label="`Remove ${label}`" @click="$emit('remove')">×</button>
  </div>
</template>
