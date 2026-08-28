/**
 * Authenticated encryption for private keys.
 * AES-256-GCM. Never log plaintext keys.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const SALT_LEN = 16;

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, KEY_LEN);
}

export function encryptPrivateKey(plaintext: string, secret: string): string {
  if (!secret || secret.length < 16) {
    throw new Error(
      'WALLET_ENCRYPTION_SECRET must be at least 16 characters (set in Railway Variables)'
    );
  }
  const salt = randomBytes(SALT_LEN);
  const key = deriveKey(secret, salt);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([salt, iv, tag, enc]);
  return packed.toString('base64');
}

export function decryptPrivateKey(payload: string, secret: string): string {
  if (!secret || secret.length < 16) {
    throw new Error(
      'WALLET_ENCRYPTION_SECRET must be at least 16 characters (set in Railway Variables)'
    );
  }
  const packed = Buffer.from(payload, 'base64');
  if (packed.length < SALT_LEN + IV_LEN + TAG_LEN + 1) {
    throw new Error('Invalid encrypted payload');
  }
  const salt = packed.subarray(0, SALT_LEN);
  const iv = packed.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = packed.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const data = packed.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(secret, salt);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}
