import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createAccessToken, decryptAccessToken, encryptAccessToken, hashToken, sanitizeRichText } from './server/security';

describe('public proposal security', () => {
  it('generates unpredictable 256-bit tokens and stable hashes', async () => {
    const first = createAccessToken(); const second = createAccessToken();
    expect(first).toHaveLength(64); expect(first).not.toBe(second);
    expect(await hashToken(first)).toHaveLength(64); expect(await hashToken(first)).toBe(await hashToken(first));
  });

  it('removes executable rich text', () => {
    const output = sanitizeRichText('<p>Hello</p><script>alert(1)</script><a href="javascript:bad()">Bad</a>');
    expect(output).toContain('<p>Hello</p>'); expect(output).not.toContain('<script'); expect(output).not.toContain('javascript:');
  });

  it('loads and executes the real sanitizer in a native server-side Node process', () => {
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '-e',
      "import sanitizeHtml from 'sanitize-html'; process.stdout.write(sanitizeHtml('<p>Safe</p><script>bad()</script><a href=\"javascript:bad()\">link</a>'));",
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(output).toBe('<p>Safe</p><a>link</a>');
  });

  it('encrypts recoverable tokens with authenticated AES-256-GCM', async () => {
    const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const token = createAccessToken();
    const encrypted = await encryptAccessToken(token, key);
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(token);
    await expect(decryptAccessToken(encrypted, key)).resolves.toBe(token);
    const parts = encrypted.split('.');
    parts[2] = `${parts[2].slice(0, 4)}${parts[2][4] === 'A' ? 'B' : 'A'}${parts[2].slice(5)}`;
    await expect(decryptAccessToken(parts.join('.'), key)).rejects.toThrow();
  });

  it('keeps legacy plaintext tokens readable during the migration window', async () => {
    const token = createAccessToken();
    await expect(decryptAccessToken(token)).resolves.toBe(token);
  });
});
