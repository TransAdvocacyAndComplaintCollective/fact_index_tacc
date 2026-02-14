/**
 * Federation Signing Keys Management
 * Manages the asymmetric keys used for signing entity configurations and subordinate statements.
 * These are SEPARATE from JWT token signing keys.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  generateKeyPair,
  exportSPKI,
  importPKCS8,
  importSPKI,
  exportPKCS8,
} from 'jose';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store federation keys in a secure location (should be secrets management in production)
const FEDERATION_KEYS_DIR = path.join(__dirname, '../../..', 'config/federation-keys');

/**
 * Federation key pair (ES256 - ECDSA P-256)
 */
export interface FederationKeyPair {
  entityId: string;
  kid: string; // Key ID
  publicKeyPem: string;
  privateKeyPem: string;
  publicKeyJwk: Record<string, any>;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

let _federationKeyPromise: Promise<FederationKeyPair> | null = null;

/**
 * Get or generate federation keys (ES256)
 */
export async function getFederationKeys(): Promise<FederationKeyPair> {
  if (!_federationKeyPromise) {
    _federationKeyPromise = (async () => {
      try {
        // Ensure directory exists
        if (!fs.existsSync(FEDERATION_KEYS_DIR)) {
          fs.mkdirSync(FEDERATION_KEYS_DIR, { recursive: true });
        }

        const publicKeyPath = path.join(FEDERATION_KEYS_DIR, 'federation-public.pem');
        const privateKeyPath = path.join(FEDERATION_KEYS_DIR, 'federation-private.pem');

        let publicKeyPem: string;
        let privateKeyPem: string;

        // Load existing keys or generate new ones
        if (fs.existsSync(publicKeyPath) && fs.existsSync(privateKeyPath)) {
          console.log('[federation] Loading existing federation keys');
          publicKeyPem = fs.readFileSync(publicKeyPath, 'utf-8');
          privateKeyPem = fs.readFileSync(privateKeyPath, 'utf-8');
        } else {
          console.log('[federation] Generating new federation key pair (ES256)');
          const { publicKey, privateKey } = await generateKeyPair('ES256', {
            extractable: true, // Allow exporting to PEM
          });
          publicKeyPem = await exportSPKI(publicKey);
          privateKeyPem = await exportPKCS8(privateKey);

          // Save to disk
          fs.writeFileSync(publicKeyPath, publicKeyPem);
          fs.writeFileSync(privateKeyPath, privateKeyPem);
          fs.chmodSync(privateKeyPath, 0o600); // Restrict permissions

          console.log('[federation] Federation keys saved to', FEDERATION_KEYS_DIR);
        }

        // Import keys using jose (which handles CryptoKey conversion)
        const publicKey = await importSPKI(publicKeyPem, 'ES256');
        const privateKey = await importPKCS8(privateKeyPem, 'ES256');

        // Build JWK representation for the public key
        const entityId = process.env.FEDERATION_ENTITY_ID || 'https://fact.example.com';
        const kid = `${entityId}#federation-key-1`;

        // Minimal JWK for federation (includes kid, alg, etc.)
        const publicKeyJwk = {
          kid,
          kty: 'EC',
          crv: 'P-256',
          alg: 'ES256',
          use: 'sig',
        };

        return {
          entityId,
          kid,
          publicKeyPem,
          privateKeyPem,
          publicKeyJwk,
          publicKey,
          privateKey,
        };
      } catch (err) {
        console.error('[federation] Failed to initialize federation keys:', err);
        throw err;
      }
    })();
  }

  return _federationKeyPromise;
}

/**
 * Get the federation entity ID
 */
export function getFederationEntityId(): string {
  return process.env.FEDERATION_ENTITY_ID || 'https://fact.example.com';
}

/**
 * Get the federation name (e.g., "United Federation of Trans Organizations")
 */
export function getFederationName(): string {
  return process.env.FEDERATION_NETWORK_NAME || 'United Federation of Trans Organizations';
}
