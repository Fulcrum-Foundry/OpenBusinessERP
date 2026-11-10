# Fulcrum ERP pilot

This deployment runs upstream OpenBusinessERP 18.5.0 in one Cloudflare
Container, with Supabase PostgreSQL and a private R2 bucket. The Dockerfile pins
the upstream release by digest; no ERP frontend rebuild is needed. Updating the
fork's application source does **not** update this image: deliberately rebuild
the upstream unified Dockerfile or change the pinned release when upgrading.

## Resources

- URL: https://erp-pilot.fulcrumfoundry.com
- Cloudflare account: `4aa62e13cbcbb3600f852672e8d55270`, CLI profile `fulcrum`
- Worker / container application: `fulcrum-erp-pilot`
- One Durable Object named `pilot` owns the application instance.
- Supabase project: `cathunndplylxwuavgbt` (Fulcrum Foundry, us-east-1)
- R2 bucket: `fulcrum-erp-pilot` (private, Eastern North America)
- Access application: `098a7b64-cddf-48f7-88fb-10aa02b5442b`

Cloudflare Access admits explicitly approved identities using the existing
Fulcrum email one-time-code provider. The Worker independently verifies the
Access JWT signature, issuer, and application audience. The hostname is checked
and workers.dev and preview endpoints are disabled. ERP login and ERP roles
remain separate from Access. Manage the admission list in this application's
Access policy; do not change account-wide policies.

## Deploy

From this directory, with Docker running:

```sh
npm ci
cf workers types
npx tsc
cf --profile fulcrum deploy --secrets-file /absolute/private/path/worker-secrets.json
```

The secret JSON contains `DATABASE_URL`, `DATABASE_SYNC_URL`, `JWT_SECRET`,
`S3_ACCESS_KEY`, and `S3_SECRET_KEY`. Never put it in this repository or pass its
contents on a shell command line. Keep JWT_SECRET stable across deployments.

The async URL uses `postgresql+asyncpg://...:5432/postgres?ssl=verify-full`.
The sync URL uses `postgresql+psycopg2://...:5432/postgres?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt`.
Use the **session** pooler on port 5432; transaction pooling is not configured.
`PGSSLROOTCERT` points the async driver at the same CA bundle. Supabase's public
CA is installed in the image, downloaded from the URL in its official dashboard
source:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
SHA256 fingerprint: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
SSL enforcement is enabled and the Supabase Data API is disabled.

## Storage and lifecycle

The entrypoint mounts R2 at `/data` using s3fs, checks non-root write access,
then runs the original entrypoint as the upstream `oe` user. Mount failure
prevents startup instead of silently using ephemeral storage. Shutdown signals
reach the ERP before the mount is unmounted. The R2 key has object read/write
permissions for this bucket only.

This preserves upstream file-based settings and artifacts with minimal changes.
R2/FUSE is **not a POSIX database volume**. Keep PostgreSQL external; do not add
SQLite databases or additional concurrent writers to this mount. Advanced BIM,
vector-index, and large import workloads require their own qualification before
production use. This is a single-instance pilot, not a high-availability setup.

A minute cron keeps the instance active so upstream in-process schedulers can
run. It therefore consumes container resources while idle. Restarts still
interrupt background work; this is not an exactly-once job execution system.
Demo data/login are disabled. Application pool size is 5 with 3 overflow slots.

## Operations

Inspect Worker and Container logs in Cloudflare. Check `/api/health` through
Access and inspect the JSON, not just its HTTP status. Supabase owns the database
installation and its managed backups; retain/export both database and R2 data
before an application upgrade. The container image alone is not a backup.

For rollback, restore the previous image and Worker version only after checking
database schema compatibility; application startup can apply migrations.
Stopping the pilot requires removing the keepalive cron and stopping its
container, or deleting the pilot Worker/container. Preserve the database and
bucket unless their data is explicitly no longer needed.

Before opening a new release to the team, verify denied anonymous and forged-token
requests, authorized login, representative ERP read/write operations, settings
and uploaded-file persistence across container replacement, and disabled alternate
Worker URLs. Temporary deployment service tokens must be revoked after testing.
