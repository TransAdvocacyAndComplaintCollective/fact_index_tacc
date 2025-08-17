// src/auth/loginfacts.ts
import crypto from "crypto";
import { IdentifierType, LoginFact, ProviderType } from "../db/user/types.js";
import facts from "../router/fact/facts.js";

const ALGO = "aes-256-gcm";
// Must be exactly 32 bytes for AES-256
const KEY = Buffer.from(process.env.LOGINFACTS_AES_KEY || "", "base64");

if (KEY.length !== 32) {
  throw new Error("LOGINFACTS_AES_KEY must be a 32-byte key (base64 encoded)");
}

export function addLoginFacts(
  facts: LoginFact[],
  provider: ProviderType,
  type: IdentifierType,
  value: string
) {
  const newFact: LoginFact = { provider, type, value };
  facts.push(newFact);
}

export function encryptLoginFacts(facts: LoginFact[]): LoginFact[] {
  const iv = crypto.randomBytes(12); // GCM nonce length = 12 bytes
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encryptedFacts: LoginFact[] = [];
  
  for (const fact of facts) {
    const encrypted = Buffer.concat([
      cipher.update(fact.value, "utf8"),
      cipher.final(),
    ]);
    encryptedFacts.push({
      provider: fact.provider,
      type: fact.type,
      value: encrypted.toString("base64"),
    });
  }
  return encryptedFacts;
}

export function decryptLoginFacts(encryptedFacts: LoginFact[]): LoginFact[] {
  const decryptedFacts: LoginFact[] = [];

  for (const fact of encryptedFacts) {
    const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(fact.value, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(fact.value, "base64")),
      decipher.final(),
    ]).toString("utf8");

    decryptedFacts.push({
      provider: fact.provider,
      type: fact.type,
      value: decrypted,
    });
  }

  return decryptedFacts;
}
