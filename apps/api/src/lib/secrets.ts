import type { WorkerBindings } from "../types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const VERSION = "v1";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function getUserSettingsSecret(env: WorkerBindings): string {
  const secret = env.USER_SETTINGS_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error("USER_SETTINGS_SECRET_KEY is not configured.");
  }
  return secret;
}

export async function encryptSecretValue(value: string, env: WorkerBindings): Promise<string> {
  const secret = getUserSettingsSecret(env);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    encoder.encode(value),
  );

  return [VERSION, toBase64(salt), toBase64(iv), toBase64(new Uint8Array(cipherBuffer))].join(".");
}

export async function decryptSecretValue(
  value: string | null | undefined,
  env: WorkerBindings,
): Promise<string | null> {
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    return value;
  }

  const secret = getUserSettingsSecret(env);
  const salt = fromBase64(parts[1]);
  const iv = fromBase64(parts[2]);
  const cipherBytes = fromBase64(parts[3]);
  const key = await deriveKey(secret, salt);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(cipherBytes),
  );

  return decoder.decode(plainBuffer);
}
