// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import vue from '@astrojs/vue';

const sanitizerDependencies = [
  'sanitize-html', 'htmlparser2', 'domhandler', 'domutils',
  'dom-serializer', 'domelementtype', 'entities',
  'escape-string-regexp', 'is-plain-object', 'parse-srcset',
  'postcss', 'nanoid', 'picocolors', 'source-map-js', 'launder', 'dayjs',
];

/** @type {import('astro').AstroIntegration} */
const bundleSanitizerForNetlify = {
  name: 'bundle-sanitizer-for-netlify',
  hooks: {
    'astro:config:setup': ({ command, updateConfig }) => {
      if (command !== 'build') return;

      updateConfig({
        vite: { ssr: { noExternal: sanitizerDependencies } },
      });
    },
  },
};

// Plain HTML + CSS — no Tailwind, no UI framework. Styling lives in
// src/styles/main.css as class-based rules. https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: netlify({
    devFeatures: {
      images: true,
      environmentVariables: false,
      edgeFunctions: false,
    },
  }),
  integrations: [bundleSanitizerForNetlify, vue()],
  security: { checkOrigin: true },
});
