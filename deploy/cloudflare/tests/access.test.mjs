import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { verifyAccess, ISSUER, AUDIENCE, HOST } from "../src/access.ts";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: "test", alg: "RS256" }] });
const request = (token) => new Request(`https://${HOST}/api/health`, {
  headers: token ? { "Cf-Access-Jwt-Assertion": token } : {},
});
async function token({ audience = AUDIENCE, issuer = ISSUER, expiry = "5m", signer = privateKey } = {}) {
  return new SignJWT({ email: "tester@example.com" }).setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiry).sign(signer);
}
test("accepts a valid token for this application", async () => {
  assert.equal((await verifyAccess(request(await token()), keys)).payload.email, "tester@example.com");
});
test("rejects absent and malformed assertions", async () => {
  await assert.rejects(verifyAccess(request(), keys));
  await assert.rejects(verifyAccess(request("forged"), keys));
});
test("rejects a valid signature for another Access application", async () => {
  await assert.rejects(verifyAccess(request(await token({ audience: "another-application" })), keys));
});
test("rejects another issuer and expired assertions", async () => {
  await assert.rejects(verifyAccess(request(await token({ issuer: "https://other.example.com" })), keys));
  await assert.rejects(verifyAccess(request(await token({ expiry: 1 })), keys));
});
test("rejects a forged signature even with the expected claims", async () => {
  const attacker = await generateKeyPair("RS256");
  await assert.rejects(verifyAccess(request(await token({ signer: attacker.privateKey })), keys));
});
