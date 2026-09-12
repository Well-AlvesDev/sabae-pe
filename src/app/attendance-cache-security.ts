const DEVICE_CREDENTIAL_KEY = 'sabae.attendance.device-credential';
const DEVICE_SALT_KEY = 'sabae.attendance.device-salt';
const SESSION_AES_KEY = 'sabae.attendance.session-aes-key';
const RP_NAME = 'SABAE';
const RP_ID = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const PRF_SALT_BYTES = 32;
const AES_KEY_BYTES = 32;
const IV_BYTES = 12;
let unlockedDeviceCacheKey: CryptoKey | null = null;

type StoredDeviceCredential = {
  credentialId: string;
  salt: string;
};

type CredentialWithPrf = {
  rawId: ArrayBuffer;
  getClientExtensionResults(): { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };
};

function toBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return new Uint8Array(value).buffer as ArrayBuffer;
}

function fromBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return toArrayBuffer(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

function getStoredCredential(): StoredDeviceCredential | null {
  try {
    const credentialId = localStorage.getItem(DEVICE_CREDENTIAL_KEY);
    const salt = localStorage.getItem(DEVICE_SALT_KEY);
    return credentialId && salt ? { credentialId, salt } : null;
  } catch {
    return null;
  }
}

function storeCredential(credentialId: string, salt: Uint8Array): void {
  localStorage.setItem(DEVICE_CREDENTIAL_KEY, credentialId);
  localStorage.setItem(DEVICE_SALT_KEY, toBase64Url(salt));
}

function assertSupported(): void {
  if (typeof window === 'undefined' || !window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('Este navegador não oferece desbloqueio seguro por dispositivo.');
  }

  if (!window.crypto?.subtle || !window.crypto.getRandomValues) {
    throw new Error('Este navegador não oferece criptografia local segura.');
  }
}

function createPrfExtension(salt: Uint8Array): { prf: { eval: { first: ArrayBuffer } } } {
  return { prf: { eval: { first: toArrayBuffer(salt) } } };
}

async function deriveAesKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('sabae-attendance-cache-v1'),
      info: new TextEncoder().encode('aes-256-gcm'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_BYTES * 8 },
    true,
    ['encrypt', 'decrypt'],
  );
}

async function getPrfOutput(credentialId: Uint8Array, salt: Uint8Array): Promise<ArrayBuffer> {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: RP_ID,
      allowCredentials: [{ id: toArrayBuffer(credentialId), type: 'public-key' }],
      userVerification: 'required',
      extensions: createPrfExtension(salt),
    },
  }) as CredentialWithPrf | null;

  const prfOutput = assertion?.getClientExtensionResults().prf?.results?.first;
  if (!prfOutput) {
    throw new Error('O autenticador não conseguiu liberar a chave protegida deste dispositivo.');
  }

  return prfOutput;
}

export function isDeviceCacheSecuritySupported(): boolean {
  try {
    assertSupported();
    return true;
  } catch {
    return false;
  }
}

export function hasDeviceCacheCredential(): boolean {
  return getStoredCredential() !== null;
}

export async function registerDeviceCacheCredential(): Promise<void> {
  assertSupported();
  const salt = crypto.getRandomValues(new Uint8Array(PRF_SALT_BYTES));
  const userId = crypto.getRandomValues(new Uint8Array(32));
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credential = await navigator.credentials.create({
    publicKey: {
      rp: { name: RP_NAME, id: RP_ID },
      user: { id: userId, name: `device-${RP_ID}`, displayName: 'Dispositivo SABAE' },
      challenge,
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000,
      extensions: createPrfExtension(salt),
    },
  }) as CredentialWithPrf | null;

  if (!credential) {
    throw new Error('Não foi possível registrar o desbloqueio deste dispositivo.');
  }

  const prfEnabled = credential.getClientExtensionResults().prf?.enabled;
  if (!prfEnabled) {
    throw new Error('Este dispositivo não oferece o recurso necessário para proteger o cache.');
  }

  storeCredential(toBase64Url(credential.rawId), salt);
}

export async function unlockDeviceCache(): Promise<CryptoKey> {
  assertSupported();
  const storedCredential = getStoredCredential();
  if (!storedCredential) {
    throw new Error('Este dispositivo ainda não foi registrado para proteger o cache.');
  }

  const prfOutput = await getPrfOutput(
    new Uint8Array(fromBase64Url(storedCredential.credentialId)),
    new Uint8Array(fromBase64Url(storedCredential.salt)),
  );
  return deriveAesKey(prfOutput);
}

export async function registerOrUnlockDeviceCache(): Promise<CryptoKey> {
  if (unlockedDeviceCacheKey) {
    return unlockedDeviceCacheKey;
  }

  try {
    sessionStorage.removeItem(SESSION_AES_KEY);
  } catch {}

  if (!hasDeviceCacheCredential()) {
    await registerDeviceCacheCredential();
  }

  unlockedDeviceCacheKey = await unlockDeviceCache();
  return unlockedDeviceCacheKey;
}

export function getUnlockedDeviceCacheKey(): CryptoKey | null {
  return unlockedDeviceCacheKey;
}

export function lockDeviceCache(): void {
  unlockedDeviceCacheKey = null;
  try {
    sessionStorage.removeItem(SESSION_AES_KEY);
  } catch {}
}

export async function encryptAttendanceCache(payload: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(payload),
  );
  return JSON.stringify({ version: 1, iv: toBase64Url(iv), data: toBase64Url(encrypted) });
}

export async function decryptAttendanceCache(payload: string, key: CryptoKey): Promise<string> {
  const envelope = JSON.parse(payload) as { version?: number; iv?: string; data?: string };
  if (envelope.version !== 1 || !envelope.iv || !envelope.data) {
    throw new Error('Cache criptografado inválido.');
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(envelope.iv) },
    key,
    fromBase64Url(envelope.data),
  );
  return new TextDecoder().decode(decrypted);
}
