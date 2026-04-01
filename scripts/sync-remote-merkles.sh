#!/bin/bash
# Syncs the remote merkle-backups directory from the VPS to a local gitignored directory.
# Each run fully replaces the local copy with the remote one.

REMOTE_USER="root"
REMOTE_HOST="143.198.123.60"
REMOTE_DIR="/var/www/daily-rewards/merkle-backups/"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)/remote-merkles/"

echo "Syncing remote merkle-backups from ${REMOTE_HOST}..."
echo "Local destination: ${LOCAL_DIR}"

# --delete ensures the local dir mirrors the remote exactly
rsync -avz --delete -e "ssh" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}" \
  "${LOCAL_DIR}"

echo "Done. Remote merkles synced to ${LOCAL_DIR}"
