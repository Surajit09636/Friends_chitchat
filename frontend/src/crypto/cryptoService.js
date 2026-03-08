// Web Crypto helpers for password-derived keys and ECDH message encryption.

export const CRYPTO_VERSION = 1;
const PBKDF2_ITERATIONS = 150000;
const PBKDF2_HASH = "SHA-256";
const AES_KEY_LENGTH = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bufferToBase64 = (buffer) => {
  // Convert ArrayBuffer -> base64 without relying on Node globals.
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const base64ToBuffer = (base64) => {
  // Convert base64 -> ArrayBuffer.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const getRandomBytes = (length) => {
  // Generate cryptographically secure random bytes.
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

export const derivePasswordKey = async (password, saltBase64) => {
  // Derive an AES-GCM key from a user password (PBKDF2).
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const salt = base64ToBuffer(saltBase64);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
};

export const generateIdentityKeyBundle = async (password) => {
  // Create an ECDH key pair and encrypt the private key with a password key.
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );

  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyPkcs8 = await crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey
  );

  const salt = getRandomBytes(SALT_BYTES);
  const iv = getRandomBytes(IV_BYTES);
  const saltBase64 = bufferToBase64(salt.buffer);
  const ivBase64 = bufferToBase64(iv.buffer);
  const passwordKey = await derivePasswordKey(password, saltBase64);

  const encryptedPrivateKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    passwordKey,
    privateKeyPkcs8
  );

  return {
    publicKey: bufferToBase64(publicKeyRaw),
    encryptedPrivateKey: bufferToBase64(encryptedPrivateKey),
    keySalt: saltBase64,
    keyIv: ivBase64,
    keyVersion: CRYPTO_VERSION,
    privateKey: keyPair.privateKey,
  };
};

export const decryptPrivateKey = async (
  encryptedPrivateKeyBase64,
  ivBase64,
  password,
  saltBase64
) => {
  // Decrypt and import the ECDH private key.
  const passwordKey = await derivePasswordKey(password, saltBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64ToBuffer(ivBase64)) },
    passwordKey,
    base64ToBuffer(encryptedPrivateKeyBase64)
  );

  return crypto.subtle.importKey(
    "pkcs8",
    decrypted,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey", "deriveBits"]
  );
};

export const importPublicKey = async (publicKeyBase64) =>
  // Import the peer's public key for ECDH.
  crypto.subtle.importKey(
    "raw",
    base64ToBuffer(publicKeyBase64),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

export const deriveSharedKey = async (privateKey, publicKey) =>
  // Derive an AES-GCM key from the ECDH shared secret.
  crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );

export const encryptMessage = async (plaintext, sharedKey) => {
  // Encrypt a UTF-8 message using AES-GCM with a random IV.
  const iv = getRandomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv.buffer),
  };
};

export const decryptMessage = async (ciphertextBase64, ivBase64, sharedKey) => {
  // Decrypt an AES-GCM encrypted message into a UTF-8 string.
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64ToBuffer(ivBase64)) },
    sharedKey,
    base64ToBuffer(ciphertextBase64)
  );

  return decoder.decode(plaintext);
};
