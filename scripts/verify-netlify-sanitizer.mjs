import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const chunksDir = resolve('.netlify/build/chunks');
const chunks = await readdir(chunksDir);
const securityChunk = chunks.find(name => /^security_.*\.mjs$/.test(name));
if (!securityChunk) throw new Error('Netlify SSR sanitizer chunk was not generated.');

const chunkPath = resolve(chunksDir, securityChunk);
const source = await readFile(chunkPath, 'utf8');
if (!source.includes('node_modules/htmlparser2/dist/index.js')) {
  throw new Error('htmlparser2 was not bundled into the Netlify SSR sanitizer chunk.');
}
if (/from ["'](?:sanitize-html|htmlparser2|domhandler|domutils|dom-serializer|domelementtype|entities|postcss|picocolors)["']|__require\(["'](?:htmlparser2|postcss|picocolors)["']\)/.test(source)) {
  throw new Error('Netlify SSR sanitizer chunk still loads an external sanitizer dependency.');
}

const exportName = source.match(/sanitizeRichText as ([\w$]+)/)?.[1];
if (!exportName) throw new Error('Netlify SSR sanitizer export was not found.');

const script = `const { ${exportName}: sanitize } = await import(process.argv[1]);
  const clean = sanitize('<p>Safe</p><script>bad()</script><a href="javascript:bad()">link</a>');
  if (!clean.includes('<p>Safe</p>') || clean.includes('<script') || clean.includes('javascript:')) {
    throw new Error('Unsafe sanitized output: ' + clean);
  }`;
execFileSync(process.execPath, [
  '--no-experimental-require-module', '--input-type=module', '-e', script,
  pathToFileURL(chunkPath).href,
], { stdio: 'inherit' });
console.log('Netlify SSR sanitizer bundle verified in native Node without require(ESM).');
