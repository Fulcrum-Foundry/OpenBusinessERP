# Upstream v18.5.0, pinned to the published multi-platform manifest.
FROM ghcr.io/datadrivenconstruction/openbusinesserp@sha256:f533e5070fc475f70ae25166129c000a4983649dcc28adcaabadbd6367ce5eee
USER root
RUN apt-get update && apt-get install -y --no-install-recommends s3fs fuse gosu tini \
    && rm -rf /var/lib/apt/lists/*
COPY supabase-ca.crt /usr/local/share/ca-certificates/supabase.crt
RUN update-ca-certificates
COPY --chmod=0755 start.sh /app/cloudflare-start.sh
ENTRYPOINT ["/usr/bin/tini", "--", "/app/cloudflare-start.sh"]
