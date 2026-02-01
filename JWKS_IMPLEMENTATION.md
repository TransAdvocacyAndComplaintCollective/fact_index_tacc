# JWKS (JSON Web Key Set) Implementation

## Overview

Upgraded JWT authentication from shared secret to RSA-based JWKS with automatic key rotation. This provides better security, key rotation capabilities, and compliance with OAuth2/OIDC standards.

## Architecture

### Key Rotation Model (3 Keys)

1. **Old Key** - Previous key (deprecated but still valid for ~7 days)
   - Used to verify JWTs issued before rotation
   - Includes expiration timestamp
   - Automatically cleaned up after overlap period

2. **Current Key** - Active key (signs new JWTs)
   - Used for all new token issuance
   - Included in JWT header as `kid` (Key ID)
   - Primary key for verification

3. **Next Key** - Upcoming key (pre-generated)
   - Generated before rotation
   - Becomes current on next rotation cycle
   - Reduces startup time after rotation

### Key Files

#### `/apps/fact-server/src/auth/jwks.ts`
Core JWKS management system:
- **initializeJWKS()** - Load keys from disk or generate new ones
- **getCurrentPrivateKey()** - Get current key for signing
- **getCurrentKeyId()** - Get current key ID (kid)
- **getPublicJWKS()** - Export JWKS for public distribution
- **getKeyById(kid)** - Look up specific key for verification
- **getAllValidKeys()** - Get all keys for token verification
- **rotateKeysManually()** - Trigger key rotation (for testing)

**Key Rotation Settings:**
- Default rotation: Every 30 days (configurable via `KEY_ROTATION_INTERVAL_DAYS`)
- Overlap period: 7 days (configurable via `KEY_OVERLAP_DAYS`)
- Storage: `.keys/` directory (configurable via `KEYS_DIR`)

#### `/apps/fact-server/src/auth/passport-discord.ts` (Updated)
Integration points:
- Line 48: JWKS initialization on startup
- `generateJWT()` - Now signs with current private key using RS256
  - Includes `kid` (Key ID) in JWT header for key identification
  - Returns token signed with RSA private key
- `verifyJWT(token)` - Now verifies against all valid keys
  - Extracts `kid` from JWT header
  - Looks up public key by `kid`
  - Verifies signature with appropriate public key
  - Tolerates key rotation (works with old, current, next keys)
- JWT Strategy - Updated to use current public key

#### `/apps/fact-server/src/router/wellknown.ts` (New)
Public JWKS endpoint:
- **GET /.well-known/jwks.json** - Provides public JWKS
  - Includes all active keys (old, current, next)
  - Caches response for 1 hour
  - No authentication required
  - Standard format for OAuth2/OIDC discovery

#### `/apps/fact-server/src/main.ts` (Updated)
- Mounts wellknown router at `/.well-known/` path
- JWKS initialization happens automatically via import of passport-discord.ts

## Flow Diagrams

### Token Generation
```
User Login
    ↓
generateJWT(user)
    ↓
getCurrentPrivateKey() → RSA Private Key
    ↓
jwt.sign(payload, privateKey, { algorithm: "RS256", keyid: getCurrentKeyId() })
    ↓
Signed JWT w/ kid in header
```

### Token Verification
```
Incoming Request w/ JWT
    ↓
verifyJWT(token)
    ↓
jwt.decode(token) to extract header.kid
    ↓
getKeyById(kid) → RSA Public Key
    ↓
jwt.verify(token, publicKey)
    ↓
Verified AuthUser or null
```

### Key Rotation (Every 30 Days)
```
Schedule: Every KEY_ROTATION_INTERVAL_DAYS
    ↓
old = current (with expiration)
current = next
next = generateNewKeyPair()
    ↓
Save to disk (.keys/*.pem)
    ↓
Old key still valid for KEY_OVERLAP_DAYS
```

## Security Benefits

1. **No Shared Secret** - Secrets never transmitted; public keys can be safely distributed
2. **Standard Format** - JWKS is OAuth2/OIDC standard, recognized by clients and libraries
3. **Key Rotation** - Automatic rotation without disrupting existing tokens
4. **Overlap Period** - 7-day grace period prevents token validation failures during rotation
5. **Audit Trail** - Each token includes issued-at timestamps and key version
6. **Forward Secrecy** - Old keys can be discarded after overlap period

## Configuration

### Environment Variables

```bash
# Key rotation (days)
KEY_ROTATION_INTERVAL_DAYS=30      # Rotate keys every 30 days (default)
KEY_OVERLAP_DAYS=7                 # Keep old key valid for 7 days (default)

# Storage location
KEYS_DIR=./.keys                   # Where to persist keys (default)
```

### No Changes Required For

- `JWT_SECRET` - No longer used (removed)
- `JWT_EXPIRY` - Still used for token expiration (default 7d)
- `TOKEN_ENCRYPTION_KEY` - Still used for OAuth token encryption in JWT

## Testing

### Manual Key Rotation

```typescript
import { triggerKeyRotation } from './auth/passport-discord.ts';

// Force key rotation (testing only)
triggerKeyRotation();
```

### Public JWKS Endpoint

```bash
# Get public JWKS
curl http://localhost:3000/.well-known/jwks.json

# Response includes all active keys:
{
  "keys": [
    { "kid": "...", "kty": "RSA", "use": "sig", "alg": "RS256", "n": "...", "e": "...", "iat": 1234567890, "exp": 1234567890 },
    { "kid": "...", "kty": "RSA", "use": "sig", "alg": "RS256", "n": "...", "e": "...", "iat": 1234567890 },
    { "kid": "...", "kty": "RSA", "use": "sig", "alg": "RS256", "n": "...", "e": "...", "iat": 1234567890 }
  ]
}
```

## Migration Notes

- Existing JWTs signed with shared secret will NOT verify after JWKS initialization
- Users must re-authenticate to receive new RS256-signed tokens
- First startup generates new keys and saves to disk for persistence
- Subsequent startups load keys from disk for consistency

## Future Enhancements

- [ ] PKCE support for OAuth2 SPAs
- [ ] Rate limiting on JWKS endpoint
- [ ] Automated key retirement (delete very old keys)
- [ ] Admin API for manual key management
- [ ] Key backup/recovery procedures
- [ ] HSM/KMS integration for key storage
