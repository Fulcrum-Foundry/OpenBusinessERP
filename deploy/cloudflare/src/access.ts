import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const HOST = "erp-pilot.fulcrumfoundry.com";
export const ISSUER = "https://fulcrumfoundry.cloudflareaccess.com";
export const AUDIENCE = "7d565f7a535c6d2b5d7ba5f04a6999fda379e535ea544b9eb002e2022004e1db";
const trustedKeys = createRemoteJWKSet(new URL(`${ISSUER}/cdn-cgi/access/certs`));

export async function verifyAccess(request: Request, keys: JWTVerifyGetKey = trustedKeys) {
  return jwtVerify(request.headers.get("Cf-Access-Jwt-Assertion") || "", keys, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ["RS256"],
  });
}
