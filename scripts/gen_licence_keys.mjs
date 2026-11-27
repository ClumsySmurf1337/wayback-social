// Generate the Ed25519 keypair for production licence minting (DP2 keys).
//
// Run:  node scripts/gen_licence_keys.mjs
// Output: a NEW keypair. The private key must go straight into a
// Cloudflare Pages secret and NEVER into the repo:
//   npx wrangler pages secret put LICENCE_ED25519_PRIVATE_KEY --project-name deletedproof
//   (paste the PEM when prompted; it is read from stdin, not stored in shell history)
// The public key is safe to commit: paste the printed lines into
// wayback_social/licence2.py (PUBLIC_KEY_B64) and web/licence.js
// (DP2_PUBLIC_KEY_JWK). Rotating keys = run this again, update the
// public key in both places, update the secret, redeploy. Old keys
// keep verifying only if the old public key is kept alongside — see
// docs/paddle-webhook.md § key rotation.
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const spkiDerB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const jwk = publicKey.export({ format: "jwk" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });

console.log("=== PRIVATE KEY (Pages secret LICENCE_ED25519_PRIVATE_KEY — never commit) ===");
console.log(pem.trim());
console.log();
console.log("=== PUBLIC KEY — wayback_social/licence2.py ===");
console.log(`PUBLIC_KEY_B64 = "${spkiDerB64}"`);
console.log();
console.log("=== PUBLIC KEY — web/licence.js (DP2_PUBLIC_KEY_JWK) ===");
console.log(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x }));
console.log();
console.log("=== PUBLIC KEY raw (32 bytes, base64url) ===");
console.log(Buffer.from(jwk.x, "base64url").toString("base64url"));
