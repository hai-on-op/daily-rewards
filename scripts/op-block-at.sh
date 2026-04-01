#!/bin/bash
# Get the OP Mainnet block number and timestamp for N days ago.
# Usage: ./scripts/op-block-at.sh <days>
# Example: ./scripts/op-block-at.sh 45

set -e

DAYS=${1:?Usage: op-block-at.sh <days>}

# Load RPC_URL from .env
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RPC=$(grep '^RPC_URL=' "$SCRIPT_DIR/../.env" | head -1 | cut -d= -f2-)

LATEST_HEX=$(curl -s -X POST "$RPC" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")

LATEST=$((LATEST_HEX))
BLOCKS_BACK=$((DAYS * 24 * 3600 / 2))
TARGET=$((LATEST - BLOCKS_BACK))
TARGET_HEX=$(printf '0x%x' $TARGET)

TS=$(curl -s -X POST "$RPC" -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBlockByNumber\",\"params\":[\"$TARGET_HEX\",false],\"id\":1}" \
  | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result']['timestamp'],16))")

DATE=$(python3 -c "from datetime import datetime,timezone; print(datetime.fromtimestamp($TS, timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC'))")

echo ""
echo "  ${DAYS} days ago"
echo "  Block:     $TARGET"
echo "  Timestamp: $TS"
echo "  Date:      $DATE"
echo ""
echo "  .env values:"
echo "  LIQUIDATION_EVENTS_EFFECTIVE_BLOCK=$TARGET"
echo "  LIQUIDATION_EVENTS_EFFECTIVE_TIMESTAMP=$TS"
