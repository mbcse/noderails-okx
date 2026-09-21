#!/usr/bin/env bash
# SUBMISSION_SNAPSHOT: refuse deploy/ops unless explicitly overridden (review copy).
if [[ "${SUBMISSION_ALLOW_RUN:-}" != "1" ]]; then
  echo "OKX submission snapshot: contract scripts are disabled."
  exit 1
fi
set -euo pipefail

# ============================================================================
# NodeRails Role Management Script
# ============================================================================
#
# Usage:
#   ./script/roles.sh <chainId> <command>
#
# Commands:
#   setup              Full initial setup (admins + transaction keys)
#   add-tx-keys        Add transaction key(s)
#   add-admins         Add admin(s)
#   remove-keys        Remove key(s) (set role to None)
#
# Required .env variables:
#   SUPER_ADMIN_PRIVATE_KEY       Private key of super admin (privileged role txs)
#   ADMIN_PRIVATE_KEY             Private key of the first ADMIN_ADDRESSES entry (tx-key ops)
#   ADMIN_ADDRESSES               Comma-separated admin addresses
#   TRANSACTION_KEY_ADDRESSES     Comma-separated transaction key addresses
#   REMOVE_ADDRESSES              Comma-separated addresses to remove (for remove-keys)
#   LEANRPC_API_KEY               RPC provider API key
#
# Examples:
#   ./script/roles.sh 11155111 setup
#   ./script/roles.sh 11155111 add-tx-keys
#   ./script/roles.sh 11155111 add-admins
#   ./script/roles.sh 11155111 remove-keys
#
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- Args ---
CHAIN_ID="${1:-}"
COMMAND="${2:-}"
EXTRA_ARG="${3:-}"

if [[ -z "$CHAIN_ID" || -z "$COMMAND" ]]; then
    echo "Usage: ./script/roles.sh <chainId> <command>"
    echo ""
    echo "Commands:"
    echo "  setup          Full initial setup (admins + transaction keys)"
    echo "  add-tx-keys    Add transaction key(s)"
    echo "  add-admins     Add admin(s)"
    echo "  remove-keys    Remove key(s)"
    exit 1
fi

if [[ -n "$EXTRA_ARG" ]]; then
    echo "Error: Unexpected argument '$EXTRA_ARG'."
    echo "Role commands do not support verification flags; verifier is always disabled for role broadcasts."
    echo "Usage: ./script/roles.sh <chainId> <command>"
    exit 1
fi

# --- Load .env ---
if [[ -f .env ]]; then
    set -a
    source .env
    set +a
fi

# --- Resolve RPC URL ---
CHAINS_FILE="$SCRIPT_DIR/chains.json"

get_chain_field() {
    local field="$1"
    python3 -c "
import json, sys
with open('$CHAINS_FILE') as f:
    data = json.load(f)
for network_type in ['testnets', 'mainnets']:
    for name, chain in data.get(network_type, {}).items():
        if str(chain['chainId']) == '$CHAIN_ID':
            print(chain.get('$field', ''))
            sys.exit(0)
print('')
"
}

OPS_RPC_URL="${RPC_URL:-}"
RPC_URL=$(get_chain_field "rpcUrl")
if [[ -n "$OPS_RPC_URL" ]]; then
    RPC_URL="$OPS_RPC_URL"
    echo "Using RPC override from environment"
fi
CHAIN_NAME=$(python3 -c "
import json
with open('$CHAINS_FILE') as f:
    data = json.load(f)
for network_type in ['testnets', 'mainnets']:
    for name, chain in data.get(network_type, {}).items():
        if str(chain['chainId']) == '$CHAIN_ID':
            print(name)
            exit(0)
print('')
")
if [[ -z "$CHAIN_NAME" ]]; then
    CHAIN_NAME="${OPS_CHAIN_NAME:-unknown}"
fi
if [[ -z "$RPC_URL" ]]; then
    echo "Error: Chain ID $CHAIN_ID not found in chains.json and RPC_URL is unset"
    exit 1
fi

# --- Load contract addresses from deployData ---
ADDRESSES_FILE="deployData/contractAddresses.json"

if [[ ! -f "$ADDRESSES_FILE" ]]; then
    echo "Error: $ADDRESSES_FILE not found. Deploy contracts first."
    exit 1
fi

export ESCROW_ADDRESS=$(python3 -c "
import json
with open('$ADDRESSES_FILE') as f:
    data = json.load(f)
print(data.get('$CHAIN_ID', {}).get('NodeRailsEscrow', ''))
")

export MERCHANT_MANAGER_ADDRESS=$(python3 -c "
import json
with open('$ADDRESSES_FILE') as f:
    data = json.load(f)
print(data.get('$CHAIN_ID', {}).get('NodeRailsMerchantManager', ''))
")

if [[ -z "$ESCROW_ADDRESS" && -z "$MERCHANT_MANAGER_ADDRESS" ]]; then
    echo "Error: No contract addresses found for chain $CHAIN_ID in $ADDRESSES_FILE"
    exit 1
fi

if [[ -z "$ESCROW_ADDRESS" ]]; then
    echo "Warning: ESCROW_ADDRESS not found for chain $CHAIN_ID. Escrow role operations will be skipped."
fi

if [[ -z "$MERCHANT_MANAGER_ADDRESS" ]]; then
    echo "Warning: MERCHANT_MANAGER_ADDRESS not found for chain $CHAIN_ID. MerchantManager role operations will be skipped."
fi

echo "============================================"
echo "  NodeRails Role Management"
echo "============================================"
echo "  Chain:             $CHAIN_NAME ($CHAIN_ID)"
echo "  Command:           $COMMAND"
echo "  Escrow:            ${ESCROW_ADDRESS:-<not deployed>}"
echo "  MerchantManager:   ${MERCHANT_MANAGER_ADDRESS:-<not deployed>}"
echo "============================================"
echo ""

# --- Map command to Solidity contract ---
case "$COMMAND" in
    setup|add-tx-keys|add-admins)
        echo "Adding Admin or TransactionKey after deploy is SuperAdmin 3-of-5. Use NodeRails War Room."
        echo "Constructors already assign ADMIN_ADDRESSES, TRANSACTION_KEY_ADDRESSES, and Escrow allowlists."
        echo "Admin may only revoke TX keys (remove-keys)."
        exit 1
        ;;
    remove-keys)
        CONTRACT_NAME="RemoveKeys"
        : "${ADMIN_PRIVATE_KEY:?ADMIN_PRIVATE_KEY is required for remove-keys}"
        : "${REMOVE_ADDRESSES:?REMOVE_ADDRESSES is required}"
        ;;
    *)
        echo "Error: Unknown command '$COMMAND'. Use: setup, add-tx-keys, add-admins, remove-keys"
        exit 1
        ;;
esac

SCRIPT_PATH="script/solidity/SetupRoles.s.sol"

# Filecoin requires RPC-side gas handling for role tx broadcast.
SKIP_SIM_FLAG=""
if [[ "$CHAIN_ID" == "314159" ]]; then
    SKIP_SIM_FLAG="--skip-simulation"
fi

# Roles script does not perform source verification.
# Force-disable ETHERSCAN_API_KEY to prevent Foundry nightly from attempting verifier resolution on unsupported chains.
ETHERSCAN_API_KEY= \
forge script $SKIP_SIM_FLAG "$SCRIPT_PATH:$CONTRACT_NAME" \
    --rpc-url "$RPC_URL" \
    --broadcast \
    -vvvv

echo ""
echo "============================================"
echo "  Role management complete!"
echo "  Chain: $CHAIN_ID"
echo "  Command: $COMMAND"
echo "============================================"
