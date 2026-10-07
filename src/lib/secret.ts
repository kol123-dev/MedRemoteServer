import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * AdminSecretService — encrypt/decrypt sensitive strings (API keys, secret
 * config values) at rest using AES-256-GCM. The encryption key comes from
 * `SECRETS_ENCRYPTION_KEY`.
 *
 * - ciphertext, iv and auth tag are stored separately (base64) so they can be
 *   persisted into separate DB columns. The admin API only ever returns the
 *   masked hint, never plaintext or ciphertext.
 */

const ALGO = 'aes-256-gcm';

function keyBytes(): Buffer {
  // Derive a 32-byte key from the configured secret (supports any length).
  if (env.SECRETS_ENCRYPTION_KEY.length >= 32) {
    return Buffer.from(env.SECRETS_ENCRYPTION_KEY.slice(0, 32), 'utf8');
  }
  return crypto.scryptSync(env.SECRETS_ENCRYPTION_KEY, 'medremote-secrets', 32);
}

export interface EncryptedBundle {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptSecret(plaintext: string): EncryptedBundle {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptSecret(bundle: {
  ciphertext: string;
  iv: string;
  tag: string;
}): string {
  const decipher = crypto.createDecipheriv(
    ALGO,
    keyBytes(),
    Buffer.from(bundle.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(bundle.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(bundle.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

/** Builds a display-only hint like `sk-ant-...1QAA` (keeps first 6 / last 4). */
export function maskKey(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.length <= 10) return `${plaintext.slice(0, 2)}…`;
  return `${plaintext.slice(0, 6)}…${plaintext.slice(-4)}`;
}