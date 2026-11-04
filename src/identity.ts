import type { Identity } from './types';

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
function bytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('raeen-identity', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('Local identity storage is unavailable. Allow storage for this app.'));
  });
}
export async function loadIdentity(): Promise<Identity | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('keys').objectStore('keys').get('primary');
    request.onsuccess = () => {
      resolve(request.result ?? null);
      db.close();
    };
    request.onerror = () => {
      reject(request.error);
      db.close();
    };
  });
}
export async function saveIdentity(identity: Identity): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(identity, 'primary');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function createIdentity(name: string): Promise<Identity> {
  if (!crypto.subtle) throw new Error('Open Raeen on localhost or over HTTPS to create a secure identity.');
  const keys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const identity = {
    ...keys,
    public_key: base64url(await crypto.subtle.exportKey('raw', keys.publicKey)),
    name,
  };
  await saveIdentity(identity);
  return identity;
}
async function backupKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 250_000 },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function exportIdentity(identity: Identity, password: string): Promise<void> {
  if (password.length < 10) throw new Error('Use a backup passphrase with at least 10 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await backupKey(password, salt);
  const private_jwk = await crypto.subtle.exportKey('jwk', identity.privateKey);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify({ name: identity.name, private_jwk })),
  );
  const file = new Blob(
    [
      JSON.stringify(
        {
          format: 'raeen-identity',
          version: 1,
          salt: base64url(salt),
          iv: base64url(iv),
          ciphertext: base64url(ciphertext),
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'raeen-identity.encrypted.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importIdentity(file: File, password: string): Promise<Identity> {
  if (file.size > 16_384) throw new Error('This identity file is too large.');
  try {
    const backup = JSON.parse(await file.text());
    if (backup.format !== 'raeen-identity' || backup.version !== 1) throw new Error();
    const salt = bytes(backup.salt),
      iv = bytes(backup.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error();
    const key = await backupKey(password, salt);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes(backup.ciphertext));
    const { name, private_jwk: jwk } = JSON.parse(new TextDecoder().decode(plaintext));
    if (
      jwk.crv !== 'Ed25519' ||
      jwk.kty !== 'OKP' ||
      typeof jwk.d !== 'string' ||
      typeof jwk.x !== 'string' ||
      typeof name !== 'string'
    )
      throw new Error();
    const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, true, ['sign']);
    const publicKey = await crypto.subtle.importKey('raw', bytes(jwk.x), { name: 'Ed25519' }, true, [
      'verify',
    ]);
    const proof = await crypto.subtle.sign(
      'Ed25519',
      privateKey,
      new TextEncoder().encode('raeen-key-check'),
    );
    if (
      !(await crypto.subtle.verify('Ed25519', publicKey, proof, new TextEncoder().encode('raeen-key-check')))
    )
      throw new Error();
    const identity = { privateKey, publicKey, public_key: jwk.x, name: name.slice(0, 32) };
    await saveIdentity(identity);
    return identity;
  } catch {
    throw new Error('Could not unlock this backup. Check the file and passphrase.');
  }
}
