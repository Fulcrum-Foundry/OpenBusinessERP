#!/bin/sh
set -eu
: "${S3_ACCESS_KEY:?required}"
: "${S3_SECRET_KEY:?required}"
: "${S3_ENDPOINT:?required}"
: "${S3_BUCKET:?required}"
umask 077
printf '%s:%s' "$S3_ACCESS_KEY" "$S3_SECRET_KEY" > /run/r2-password
mkdir -p /data
s3fs "$S3_BUCKET" /data -f \
  -o passwd_file=/run/r2-password -o "url=$S3_ENDPOINT" \
  -o use_path_request_style -o endpoint=auto -o nomixupload \
  -o allow_other -o "uid=$(id -u oe)" -o "gid=$(id -g oe)" &
mount_pid=$!
app_pid=''
cleanup() {
  trap - TERM INT EXIT
  if [ -n "$app_pid" ]; then kill -TERM "$app_pid" 2>/dev/null || true; wait "$app_pid" || true; fi
  fusermount -u /data 2>/dev/null || true
  kill "$mount_pid" 2>/dev/null || true
  rm -f /run/r2-password
}
trap cleanup TERM INT EXIT
attempt=0
until mountpoint -q /data; do
  kill -0 "$mount_pid" 2>/dev/null || { echo 'R2 mount failed' >&2; exit 1; }
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || { echo 'R2 mount timed out' >&2; exit 1; }
  sleep 1
done
# Never fall back to an ephemeral data directory when object storage is down.
gosu oe sh -c 'printf ready > /data/.mount-check; rm /data/.mount-check'
gosu oe /app/entrypoint.sh &
app_pid=$!
wait "$app_pid"
