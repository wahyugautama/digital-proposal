// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vue from '@astrojs/vue';

// Plain HTML + CSS — no Tailwind, no UI framework. Styling lives in
// src/styles/main.css as class-based rules. https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [vue()],
  security: { checkOrigin: true },
});
