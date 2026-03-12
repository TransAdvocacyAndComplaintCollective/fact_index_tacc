#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { generateKeyPair, exportJWK } from 'jose';

async function main() {
  const outDir = process.cwd();
  const privatePath = path.join(outDir, 'apps', 'fact-server', 'ta-key.json');
  const jwksPath = path.join(outDir, 'apps', 'fact-server', 'ta-jwks.json');

  console.log('[ta-gen] Generating RSA keypair (RS256)...');
  // generateKeyPair default keys are non-extractable in some runtimes; request extractable keys so we can export JWK
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });

  const privateJwk = await exportJWK(privateKey);
  privateJwk.kid = privateJwk.kid || 'ta-key';
  privateJwk.use = 'sig';

  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = privateJwk.kid;
  publicJwk.use = 'sig';

  await fs.mkdir(path.dirname(privatePath), { recursive: true });
  await fs.writeFile(privatePath, JSON.stringify(privateJwk, null, 2));
  await fs.writeFile(jwksPath, JSON.stringify({ keys: [publicJwk] }, null, 2));

  console.log('[ta-gen] Wrote private key to', privatePath);
  console.log('[ta-gen] Wrote public JWKS to', jwksPath);
  console.log('[ta-gen] Keep the private JWK secret. Publish the JWKS file as needed.');
}

main().catch((err) => {
  console.error('[ta-gen] Failed:', err);
  process.exit(1);
});
