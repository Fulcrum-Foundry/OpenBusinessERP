import { bindings, defineConfig, defineContainer, exports, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

const container = defineContainer({
  name: "fulcrum-erp-pilot",
  schedulingPolicy: "durable-object",
  images: { base: { dockerfile: "./Dockerfile" } },
  observability: { enabled: true, logs: { enabled: true } },
});

export default defineConfig({
  accountId: "4aa62e13cbcbb3600f852672e8d55270",
  containers: [container],
  worker: {
    name: "fulcrum-erp-pilot",
    entrypoint,
    compatibilityDate: "2026-11-10",
    compatibilityFlags: ["enable_ctx_exports"],
    workersDev: false,
    previewUrls: false,
    observability: { enabled: true },
    triggers: [
      triggers.fetch({ pattern: "erp-pilot.fulcrumfoundry.com/*", zone: "fulcrumfoundry.com" }),
      triggers.scheduled({ schedule: "* * * * *" }),
    ],
    exports: { ERP: exports.durableObject({ storage: "sqlite", container }) },
    env: {
      DATABASE_URL: bindings.secret(),
      DATABASE_SYNC_URL: bindings.secret(),
      JWT_SECRET: bindings.secret(),
      S3_ACCESS_KEY: bindings.secret(),
      S3_SECRET_KEY: bindings.secret(),
    },
  },
});
