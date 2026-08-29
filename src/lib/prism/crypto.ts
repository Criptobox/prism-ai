/** Prism AI — Primitivas de cifrado Web Crypto (AES-GCM + PBKDF2).
 * Módulo puro, sin dependencias del store, para poder testearlo de forma aislada.
 */

export interface VaultPayload {
  keys: Record<string, string>;
  githubToken: string;
}

export interface VaultBlob {
  v: 1;
  salt: number[];
  iv: number[];
  data: number[];
}

export const PBKDF2_ITERATIONS = 150_000;

function toBytes(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s) as unknown as Uint8Array<ArrayBuffer>;
}

async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", toBytes(pin), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Cifra cualquier cosa serializable (AES-GCM 256, sal e IV nuevos cada vez).
 *
 * La bóveda del PIN y la transferencia entre dispositivos usan lo mismo: el
 * mecanismo no depende de qué se guarde dentro. */
export async function encryptJson<T>(secreto: string, payload: T): Promise<VaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secreto, salt);
  const enc = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    toBytes(JSON.stringify(payload))
  );
  return {
    v: 1,
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(enc)),
  };
}

/** Descifra un blob. Lanza si el secreto no es el correcto (o los datos están rotos). */
export async function decryptJson<T>(secreto: string, blob: VaultBlob): Promise<T> {
  const key = await deriveKey(secreto, new Uint8Array(blob.salt));
  const dec = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(blob.iv) },
    key,
    new Uint8Array(blob.data)
  );
  return JSON.parse(new TextDecoder().decode(dec)) as T;
}

/** Cifra la bóveda de claves con el PIN. */
export function encryptPayload(pin: string, payload: VaultPayload): Promise<VaultBlob> {
  return encryptJson(pin, payload);
}

/** Descifra la bóveda. Lanza si el PIN es incorrecto (o datos corruptos). */
export function decryptPayload(pin: string, blob: VaultBlob): Promise<VaultPayload> {
  return decryptJson<VaultPayload>(pin, blob);
}
