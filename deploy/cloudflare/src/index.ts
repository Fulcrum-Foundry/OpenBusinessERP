import { DurableObject } from "cloudflare:workers";
import { HOST, verifyAccess } from "./access";
const PORT = 8080;

export class ERP extends DurableObject<Env> {
  starting?: Promise<void>;

  async ready() {
    if (!this.starting) this.starting = this.start().finally(() => { this.starting = undefined; });
    await this.starting;
  }

  async start() {
    const container = this.ctx.container!;
    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: "standard-1",
        enableInternet: true,
        env: {
          DATABASE_URL: this.env.DATABASE_URL,
          DATABASE_SYNC_URL: this.env.DATABASE_SYNC_URL,
          PGSSLROOTCERT: "/etc/ssl/certs/ca-certificates.crt",
          JWT_SECRET: this.env.JWT_SECRET,
          S3_ACCESS_KEY: this.env.S3_ACCESS_KEY,
          S3_SECRET_KEY: this.env.S3_SECRET_KEY,
          S3_ENDPOINT: "https://4aa62e13cbcbb3600f852672e8d55270.r2.cloudflarestorage.com",
          S3_BUCKET: "fulcrum-erp-pilot",
          OE_DATA_DIR: "/data",
          STORAGE_BACKEND: "local",
          OE_USE_EMBEDDED_PG: "false",
          SEED_DEMO: "false",
          APP_ENV: "production",
          APP_DEBUG: "false",
          ALLOWED_ORIGINS: `https://${HOST}`,
          DATABASE_POOL_SIZE: "5",
          DATABASE_MAX_OVERFLOW: "3",
        },
      });
      this.ctx.waitUntil(container.monitor().catch(() => console.error("ERP container exited unexpectedly")));
    }
    await container.setInactivityTimeout(10 * 60 * 1000);
    for (let attempt = 0; attempt < 240; attempt++) {
      try {
        const response = await container.getTcpPort(PORT).fetch("http://container/api/health", { signal: AbortSignal.timeout(3000) });
        await response.body?.cancel();
        if (response.ok) return;
      } catch { /* Database initialization can take several minutes on first boot. */ }
      await scheduler.wait(1000);
    }
    throw new Error("ERP readiness timed out");
  }

  async fetch(request: Request) {
    await this.ready();
    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    forwarded.headers.set("X-Forwarded-Proto", "https");
    forwarded.headers.set("X-Forwarded-Host", HOST);
    // ERP authorization remains independent of the Access admission policy.
    forwarded.headers.delete("Cf-Access-Jwt-Assertion");
    return this.ctx.container!.getTcpPort(PORT).fetch(forwarded);
  }
}

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).hostname !== HOST) return new Response("Not found", { status: 404 });
    try {
      await verifyAccess(request);
    } catch {
      return new Response("Cloudflare Access authentication required", { status: 403 });
    }
    return ctx.exports.ERP.getByName("pilot").fetch(request);
  },
  async scheduled(_event: unknown, _env: unknown, ctx: ExecutionContext) {
    // Preserve upstream in-process schedulers; one named instance, no scaling.
    ctx.waitUntil(ctx.exports.ERP.getByName("pilot").ready());
  },
};
