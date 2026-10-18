import sanitizeHtml from 'sanitize-html';

export const sanitizeRichText = (value: string) => sanitizeHtml(value, {
  allowedTags: ['p', 'h2', 'h3', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'br'],
  allowedAttributes: { a: ['href', 'target', 'rel'] }, allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true) },
});

export const createAccessToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

export const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const TOKEN_CIPHER_VERSION = 'v1';

const decodeKey = (encodedKey = import.meta.env.PROPOSAL_TOKEN_ENCRYPTION_KEY) => {
  if (!encodedKey) throw new Error('Missing required environment variable: PROPOSAL_TOKEN_ENCRYPTION_KEY');
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encodedKey), character => character.charCodeAt(0));
  } catch {
    throw new Error('PROPOSAL_TOKEN_ENCRYPTION_KEY must be valid base64.');
  }
  if (bytes.byteLength !== 32) throw new Error('PROPOSAL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return bytes.buffer as ArrayBuffer;
};

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
  .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
const fromBase64Url = (value: string) => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0)).buffer as ArrayBuffer;
};

export const encryptAccessToken = async (token: string, encodedKey?: string) => {
  const key = await crypto.subtle.importKey('raw', decodeKey(encodedKey), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  return `${TOKEN_CIPHER_VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
};

export const decryptAccessToken = async (storedToken: string, encodedKey?: string) => {
  if (!storedToken.startsWith(`${TOKEN_CIPHER_VERSION}.`)) return storedToken;
  const [, encodedIv, encodedCiphertext] = storedToken.split('.');
  if (!encodedIv || !encodedCiphertext) throw new Error('Stored proposal token is malformed.');
  const key = await crypto.subtle.importKey('raw', decodeKey(encodedKey), 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(encodedIv) },
    key,
    fromBase64Url(encodedCiphertext),
  );
  return new TextDecoder().decode(plaintext);
};

export const isLegacyPlaintextToken = (storedToken: string) => !storedToken.startsWith(`${TOKEN_CIPHER_VERSION}.`);

export const isLikelyBot = (userAgent: string) => /bot|crawler|spider|preview|slackbot|facebookexternalhit|whatsapp/i.test(userAgent);
