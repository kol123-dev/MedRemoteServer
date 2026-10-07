import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret, maskKey } from '../../src/lib/secret.js';

describe('secret.ts — AES-256-GCM encryption helper', () => {
  test('round-trips a plaintext API key', () => {
    const key = 'sk-ant-api03-abc123XYZ45690';
    const bundle = encryptSecret(key);
    // ciphertext/iv/tag are all non-empty base64
    assert.ok(bundle.ciphertext.length > 0);
    assert.ok(bundle.iv.length > 0);
    assert.ok(bundle.tag.length > 0);
    // ciphertext must NOT contain the plaintext
    assert.ok(!bundle.ciphertext.includes(key));
    const decrypted = decryptSecret(bundle);
    assert.equal(decrypted, key);
  });

  test('produces different ciphertext for the same input (random IV)', () => {
    const a = encryptSecret('same-secret-value');
    const b = encryptSecret('same-secret-value');
    assert.notEqual(a.ciphertext, b.ciphertext);
    assert.notEqual(a.iv, b.iv);
  });

  test('produces different ciphertext for different inputs', () => {
    const a = encryptSecret('value-one');
    const b = encryptSecret('value-two');
    assert.notEqual(a.ciphertext, b.ciphertext);
  });

  test('handles empty and unicode strings', () => {
    assert.equal(decryptSecret(encryptSecret('')), '');
    const emoji = '🔐 secret key with unicode 机密';
    assert.equal(decryptSecret(encryptSecret(emoji)), emoji);
  });

  test('ciphertext is tamper-evident (auth tag fails on modification)', () => {
    const bundle = encryptSecret('integrity-check');
    const tampered = { ...bundle, ciphertext: bundle.ciphertext + 'AA==' };
    assert.throws(() => decryptSecret(tampered));
  });

  test('decrypt fails if the auth tag is invalid', () => {
    const bundle = encryptSecret('integrity-check');
    const badTag = {
      ciphertext: bundle.ciphertext,
      iv: bundle.iv,
      tag: Buffer.alloc(16).toString('base64'),
    };
    assert.throws(() => decryptSecret(badTag));
  });
});

describe('secret.ts — maskKey display hint', () => {
  test('returns empty string for falsy input', () => {
    assert.equal(maskKey(''), '');
    assert.equal(maskKey(''), '');
  });

  test('returns a short ellipsis form for keys <= 10 chars', () => {
    assert.equal(maskKey('abcdef'), 'ab…');
  });

  test('keeps first 6 and last 4 for longer keys', () => {
    const key = 'sk-ant-api03-longvalue1234';
    assert.match(maskKey(key), /^sk-ant/); // keeps first 6 chars
    assert.ok(maskKey(key).endsWith('1234'));
    // Never reveal the middle
    assert.ok(!maskKey(key).includes('longvalue'));
  });

  test('never returns the full plaintext', () => {
    const key = 'sk-proj-5f4e3d2c1b0a99887766554433221100';
    assert.notEqual(maskKey(key), key);
  });
});