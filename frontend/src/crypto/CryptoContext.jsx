// React context for unlocking and using end-to-end encryption keys.
import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  CRYPTO_VERSION,
  decryptMessage,
  decryptPrivateKey,
  deriveSharedKey,
  encryptMessage,
  generateIdentityKeyBundle,
  importPublicKey,
} from "./cryptoService";
import { getCryptoProfile, saveCryptoProfile } from "../api/authApi";

// Create a context to expose crypto state + helpers.
const CryptoContext = createContext(null);

export function CryptoProvider({ children }) {
  // Keys live only in memory; a fresh unlock is needed after reloads.
  // Track the unlocked private key and public key (base64).
  const [privateKey, setPrivateKey] = useState(null);
  const [publicKey, setPublicKey] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Cache derived shared keys per friend for speed.
  const sharedKeyCache = useRef(new Map());

  const reset = useCallback(() => {
    // Clear all in-memory crypto material.
    sharedKeyCache.current.clear();
    setPrivateKey(null);
    setPublicKey("");
    setReady(false);
    setError("");
  }, []);

  const unlockWithPassword = useCallback(async (password) => {
    // Unlocks (or creates) the user's encrypted private key bundle.
    setLoading(true);
    setError("");
    setReady(false);
    sharedKeyCache.current.clear();

    try {
      let profile = null;
      try {
        const res = await getCryptoProfile();
        profile = res.data;
      } catch (err) {
        if (err.response?.status !== 404) {
          throw err;
        }
      }

      if (!profile) {
        // First login: generate a new identity key pair.
        const bundle = await generateIdentityKeyBundle(password);
        await saveCryptoProfile({
          public_key: bundle.publicKey,
          encrypted_private_key: bundle.encryptedPrivateKey,
          key_salt: bundle.keySalt,
          key_iv: bundle.keyIv,
          key_version: CRYPTO_VERSION,
        });

        setPrivateKey(bundle.privateKey);
        setPublicKey(bundle.publicKey);
      } else {
        // Existing profile: decrypt and import the private key.
        const unlockedKey = await decryptPrivateKey(
          profile.encrypted_private_key,
          profile.key_iv,
          password,
          profile.key_salt
        );
        setPrivateKey(unlockedKey);
        setPublicKey(profile.public_key);
      }

      setReady(true);
      return true;
    } catch (err) {
      setReady(false);
      setError("Could not unlock encryption keys");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const getSharedKey = useCallback(
    async (friendId, friendPublicKeyBase64) => {
      // Return (and cache) the ECDH-derived AES key for a friend.
      if (!privateKey) {
        throw new Error("Encryption not unlocked");
      }

      const cached = sharedKeyCache.current.get(friendId);
      if (cached) return cached;

      const friendPublicKey = await importPublicKey(friendPublicKeyBase64);
      const sharedKey = await deriveSharedKey(privateKey, friendPublicKey);
      sharedKeyCache.current.set(friendId, sharedKey);
      return sharedKey;
    },
    [privateKey]
  );

  const encryptForFriend = useCallback(
    async (friendId, friendPublicKeyBase64, plaintext) => {
      // Encrypt text using the shared key for this friend.
      const sharedKey = await getSharedKey(friendId, friendPublicKeyBase64);
      return encryptMessage(plaintext, sharedKey);
    },
    [getSharedKey]
  );

  const decryptForFriend = useCallback(
    async (friendId, friendPublicKeyBase64, ciphertext, iv) => {
      // Decrypt text using the shared key for this friend.
      const sharedKey = await getSharedKey(friendId, friendPublicKeyBase64);
      return decryptMessage(ciphertext, iv, sharedKey);
    },
    [getSharedKey]
  );

  return (
    // Provide crypto state + helpers to the rest of the app.
    <CryptoContext.Provider
      value={{
        ready,
        loading,
        error,
        publicKey,
        privateKey,
        unlockWithPassword,
        encryptForFriend,
        decryptForFriend,
        reset,
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
}

// Convenience hook for consuming crypto context.
export const useCrypto = () => useContext(CryptoContext);
