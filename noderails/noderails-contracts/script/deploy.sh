#!/usr/bin/env bash
# SUBMISSION_SNAPSHOT: refuse deploy/ops unless explicitly overridden (review copy).
if [[ "${SUBMISSION_ALLOW_RUN:-}" != "1" ]]; then
  echo "OKX submission snapshot: contract scripts are disabled."
  exit 1
fi
set -euo pipefail

# ============================================================================
# NodeRails Contract Deployment Script
# ============================================================================
#
# Usage:
#   ./script/deploy.sh <chainId> <target>
#
# Targets:
#   all               Deploy both Escrow + MerchantManager
#   escrow            Deploy only NodeRailsEscrow
#   merchant-manager  Deploy only NodeRailsMerchantManager
#
# Examples:
#   ./script/deploy.sh 11155111 all
#   ./script/deploy.sh 11155111 escrow
#   ./script/deploy.sh 84532 merchant-manager
#
# Required .env variables:
#   DEPLOYER_PRIVATE_KEY     Private key for deploying contracts
#   SUPER_ADMIN_ADDRESSES    Comma-separated 5 SuperAdmin signer EOAs (not KeyRole.SuperAdmin)
#   WAR_ROOM_URL             Optional. Register this deploy with NodeRails War Room
#   WAR_ROOM_DEPLOY_API_KEY  Bearer token for War Room PUT /api/deployments
#   ADMIN_ADDRESSES          Comma-separated admin addresses assigned in constructors
#   TRANSACTION_KEY_ADDRESSES  Optional. TX keys assigned in constructors
#   DEPLOY_SWAP_ROUTERS / DEPLOY_BRIDGE_ROUTERS / DEPLOY_SETTLEMENT_TOKENS
#                          Optional per-deploy Escrow constructor allowlists (ops UI).
#                          Override leftover .env lists for this run only.
#   FEE_RECIPIENT_ADDRESS    Address that receives platform fees (for escrow)
#   ETHERSCAN_API_KEY        Optional. Auto-verify after deploy if set
#   LEANRPC_API_KEY          RPC provider API key
#   DEPLOY_DRY_RUN=1         Simulate only (no broadcast, no save)
#   DEPLOY_WITH_GAS_PRICE    Locked maxFeePerGas (wei or 280gwei)
#   DEPLOY_PRIORITY_GAS_PRICE  Locked maxPriorityFeePerGas
#   DEPLOY_GAS_ESTIMATE_MULTIPLIER  Default 110 (Foundry default is 130)
#
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- Args ---
CHAIN_ID="${1:-}"
TARGET="${2:-}"

if [[ -z "$CHAIN_ID" || -z "$TARGET" ]]; then
    echo "Usage: ./script/deploy.sh <chainId> <target>"
    echo ""
    echo "Targets:"
    echo "  all               Deploy Escrow + MerchantManager"
    echo "  escrow            Deploy NodeRailsEscrow only"
    echo "  merchant-manager  Deploy NodeRailsMerchantManager only"
    echo ""
    echo "Examples:"
    echo "  ./script/deploy.sh 11155111 all"
    echo "  ./script/deploy.sh 84532 escrow"
    exit 1
fi

# --- Load .env ---
if [[ -f .env ]]; then
    set -a
    source .env
    set +a
fi

# Ops UI per-deploy fields win over leftover .env lists (even when empty).
if [[ -n "${DEPLOY_SWAP_ROUTERS+x}" ]]; then
    export SWAP_ROUTERS="$DEPLOY_SWAP_ROUTERS"
fi
if [[ -n "${DEPLOY_BRIDGE_ROUTERS+x}" ]]; then
    export BRIDGE_ROUTERS="$DEPLOY_BRIDGE_ROUTERS"
fi
if [[ -n "${DEPLOY_SETTLEMENT_TOKENS+x}" ]]; then
    export SETTLEMENT_TOKENS="$DEPLOY_SETTLEMENT_TOKENS"
fi

# --- Resolve chain config ---
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
GAS_LIMIT=$(get_chain_field "gasLimit")
EXPLORER_URL=$(get_chain_field "explorerUrl")
if [[ -z "$EXPLORER_URL" && -n "${OPS_EXPLORER_URL:-}" ]]; then
    EXPLORER_URL="$OPS_EXPLORER_URL"
fi
EVM_VERSION=$(get_chain_field "evmVersion")
EVM_VERSION_FLAG=""
if [[ -n "$EVM_VERSION" ]]; then
    EVM_VERSION_FLAG="--evm-version $EVM_VERSION"
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

# --- Map target to Solidity script ---
case "$TARGET" in
    all)
        SCRIPT_NAME="DeployAll"
        ;;
    escrow)
        SCRIPT_NAME="DeployEscrow"
        ;;
    merchant-manager)
        SCRIPT_NAME="DeployMerchantManager"
        ;;
    *)
        echo "Error: Unknown target '$TARGET'. Use: all, escrow, merchant-manager"
        exit 1
        ;;
esac

SCRIPT_PATH="script/solidity/${SCRIPT_NAME}.s.sol"

# --- Validate required env vars ---
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is required}"
: "${SUPER_ADMIN_ADDRESSES:?SUPER_ADMIN_ADDRESSES is required (exactly 5 addresses)}"
: "${ADMIN_ADDRESSES:?ADMIN_ADDRESSES is required}"

if [[ "$TARGET" == "all" || "$TARGET" == "escrow" ]]; then
    : "${FEE_RECIPIENT_ADDRESS:?FEE_RECIPIENT_ADDRESS is required for escrow deployment}"
fi

# --- Build ---
echo "============================================"
echo "  NodeRails Contract Deployment"
echo "============================================"
echo "  Chain:    $CHAIN_NAME ($CHAIN_ID)"
echo "  Target:   $TARGET ($SCRIPT_NAME)"
echo "  SuperAdmin signers: $SUPER_ADMIN_ADDRESSES"
echo "  Admins:     $ADMIN_ADDRESSES"
if [[ "$TARGET" == "all" || "$TARGET" == "escrow" ]]; then
    echo "  Swap routers: ${SWAP_ROUTERS:-<none>}"
    echo "  Bridge routers: ${BRIDGE_ROUTERS:-<none>}"
    echo "  Settlement tokens: ${SETTLEMENT_TOKENS:-<none>}"
fi
echo "============================================"
echo ""

echo "Building contracts..."
forge build
echo ""

# --- Deploy ---
echo "Deploying $SCRIPT_NAME on $CHAIN_NAME (chain $CHAIN_ID)..."
echo ""

# For Filecoin, we need to skip simulation and rely on RPC gas estimation
SKIP_SIM_FLAG=""
if [[ "$CHAIN_ID" == "314159" ]]; then
    SKIP_SIM_FLAG="--skip-simulation"
fi

DRY_RUN="${DEPLOY_DRY_RUN:-}"
BROADCAST_FLAG=""
if [[ "$DRY_RUN" != "1" ]]; then
    BROADCAST_FLAG="--broadcast"
else
    echo "Dry run: simulate only, no broadcast"
fi

FEE_FLAGS=""
if [[ -n "${DEPLOY_WITH_GAS_PRICE:-}" ]]; then
    FEE_FLAGS+=" --with-gas-price ${DEPLOY_WITH_GAS_PRICE}"
    echo "Locked max fee: $DEPLOY_WITH_GAS_PRICE"
fi
if [[ -n "${DEPLOY_PRIORITY_GAS_PRICE:-}" ]]; then
    FEE_FLAGS+=" --priority-gas-price ${DEPLOY_PRIORITY_GAS_PRICE}"
    echo "Locked priority fee: $DEPLOY_PRIORITY_GAS_PRICE"
fi
GAS_MULT="${DEPLOY_GAS_ESTIMATE_MULTIPLIER:-110}"
FEE_FLAGS+=" --gas-estimate-multiplier ${GAS_MULT}"

# Deploy without verification first (verification happens as separate step after save)
# shellcheck disable=SC2086
ETHERSCAN_API_KEY= \
forge script $SKIP_SIM_FLAG $EVM_VERSION_FLAG "$SCRIPT_PATH:$SCRIPT_NAME" \
    --rpc-url "$RPC_URL" \
    $BROADCAST_FLAG \
    $FEE_FLAGS \
    -vvvv

echo ""

if [[ "$DRY_RUN" == "1" ]]; then
    echo "Dry run complete. Addresses were not saved."
    exit 0
fi

# --- Save deploy data ---
echo "Saving deployment data..."
python3 script/save-deploy-data.py "$CHAIN_ID" "$SCRIPT_NAME"

echo ""

# --- Verify (best effort, does not block saved deployment metadata) ---
SHOULD_VERIFY="false"
if [[ -n "${ETHERSCAN_API_KEY:-}" ]]; then
    # Only verify if we have an API key
    SHOULD_VERIFY="true"
fi

if [[ "$SHOULD_VERIFY" == "true" ]]; then
    VERIFY_BACKEND=""
    VERIFY_API_URL=""

    # Blockscout-based chains
    if [[ "$EXPLORER_URL" == *"blockscout"* ]]; then
        VERIFY_BACKEND="blockscout"
        VERIFY_API_URL="${EXPLORER_URL%/}/api"
    elif [[ -n "${ETHERSCAN_API_KEY:-}" ]]; then
        # Etherscan-compatible path
        VERIFY_BACKEND="etherscan"
    fi

    if [[ -n "$VERIFY_BACKEND" ]]; then
        echo "Starting verification (best effort)..."
        set +e

        if [[ "$VERIFY_BACKEND" == "blockscout" ]]; then
            forge script "$SCRIPT_PATH:$SCRIPT_NAME" \
                --rpc-url "$RPC_URL" \
                --resume \
                --verify \
                --verifier blockscout \
                --verifier-url "$VERIFY_API_URL" \
                -vvvv
        else
            forge script "$SCRIPT_PATH:$SCRIPT_NAME" \
                --rpc-url "$RPC_URL" \
                --resume \
                --verify \
                --etherscan-api-key "$ETHERSCAN_API_KEY" \
                -vvvv
        fi

        VERIFY_EXIT_CODE=$?
        set -e

        if [[ $VERIFY_EXIT_CODE -eq 0 ]]; then
            echo "✓ Verification succeeded"
        else
            echo "⚠ Verification failed (best effort - deployment data already saved)"
        fi
    fi
fi

echo ""
echo "Registering deployment with NodeRails War Room..."
"$SCRIPT_DIR/register-war-room.sh" "$CHAIN_ID" "$SCRIPT_NAME" || true

echo ""
echo "============================================"
echo "  Deployment complete!"
echo "  Chain: $CHAIN_NAME ($CHAIN_ID)"
echo "  Target: $TARGET"
echo "============================================"
