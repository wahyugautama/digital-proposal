// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import vue from '@astrojs/vue';

// Plain HTML + CSS — no Tailwind, no UI framework. Styling lives in
// src/styles/main.css as class-based rules. https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: netlify(),
  integrations: [vue()],
  security: { checkOrigin: true },
});
