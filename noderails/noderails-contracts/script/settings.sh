#!/usr/bin/env bash
# SUBMISSION_SNAPSHOT: refuse deploy/ops unless explicitly overridden (review copy).
if [[ "${SUBMISSION_ALLOW_RUN:-}" != "1" ]]; then
  echo "OKX submission snapshot: contract scripts are disabled."
  exit 1
fi
set -euo pipefail

# ============================================================================
# NodeRails post-deploy settings / admin txs
# ============================================================================
#
# Usage:
#   ./script/settings.sh <chainId> <command> [args...] [--contract escrow|merchant-manager]
#
# Commands:
#   configure
#   set-swap-router <address> <true|false>
#   set-bridge-router <address> <true|false>
#   set-settlement-token <address> <true|false>
#   set-fee-on-transfer <true|false>
#   set-fee-recipient <address>
#   set-key-role <address> <None|TransactionKey|Admin|SuperAdmin>
#   pause | unpause | full-stop | lift-full-stop
#   emergency-withdraw <token> <to-or-merchant> <amount>
#
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

usage() {
    echo "Usage: ./script/settings.sh <chainId> <command> [args...] [--contract escrow|merchant-manager]"
    echo ""
    echo "Commands:"
    echo "  configure"
    echo "  set-swap-router <address> <true|false>"
    echo "  set-bridge-router <address> <true|false>"
    echo "  set-settlement-token <address> <true|false>"
    echo "  set-fee-on-transfer <true|false>"
    echo "  set-fee-recipient <address>"
    echo "  set-key-role <address> <None|TransactionKey|Admin|SuperAdmin>"
    echo "  pause | unpause | full-stop | lift-full-stop"
    echo "  emergency-withdraw <token> <to-or-merchant> <amount>"
    exit 1
}

CHAIN_ID="${1:-}"
COMMAND="${2:-}"
if [[ -z "$CHAIN_ID" || -z "$COMMAND" ]]; then
    usage
fi
shift 2

CONTRACT_KIND=""
POS_ARGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --contract)
            CONTRACT_KIND="${2:-}"
            if [[ "$CONTRACT_KIND" != "escrow" && "$CONTRACT_KIND" != "merchant-manager" ]]; then
                echo "Error: --contract must be escrow or merchant-manager"
                exit 1
            fi
            shift 2
            ;;
        *)
            POS_ARGS+=("$1")
            shift
            ;;
    esac
done

if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

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

ADDRESSES_FILE="deployData/contractAddresses.json"
if [[ ! -f "$ADDRESSES_FILE" ]]; then
    echo "Error: $ADDRESSES_FILE not found. Deploy contracts first."
    exit 1
fi

ESCROW_ADDRESS=$(python3 -c "
import json
with open('$ADDRESSES_FILE') as f:
    data = json.load(f)
print(data.get('$CHAIN_ID', {}).get('NodeRailsEscrow', ''))
")
MERCHANT_MANAGER_ADDRESS=$(python3 -c "
import json
with open('$ADDRESSES_FILE') as f:
    data = json.load(f)
print(data.get('$CHAIN_ID', {}).get('NodeRailsMerchantManager', ''))
")
export ESCROW_ADDRESS
export MERCHANT_MANAGER_ADDRESS

if [[ -z "$ESCROW_ADDRESS" && -z "$MERCHANT_MANAGER_ADDRESS" ]]; then
    echo "Error: No contract addresses found for chain $CHAIN_ID"
    exit 1
fi

resolve_target() {
    local want="$1"
    if [[ -n "$CONTRACT_KIND" ]]; then
        if [[ "$CONTRACT_KIND" == "escrow" ]]; then
            if [[ -z "$ESCROW_ADDRESS" ]]; then
                echo "Error: Escrow not deployed on chain $CHAIN_ID" >&2
                exit 1
            fi
            echo "escrow|$ESCROW_ADDRESS"
            return
        fi
        if [[ -z "$MERCHANT_MANAGER_ADDRESS" ]]; then
            echo "Error: MerchantManager not deployed on chain $CHAIN_ID" >&2
            exit 1
        fi
        echo "merchant-manager|$MERCHANT_MANAGER_ADDRESS"
        return
    fi
    if [[ "$want" == "escrow" ]]; then
        if [[ -z "$ESCROW_ADDRESS" ]]; then
            echo "Error: Escrow not deployed on chain $CHAIN_ID" >&2
            exit 1
        fi
        echo "escrow|$ESCROW_ADDRESS"
        return
    fi
    if [[ "$want" == "merchant-manager" ]]; then
        if [[ -z "$MERCHANT_MANAGER_ADDRESS" ]]; then
            echo "Error: MerchantManager not deployed on chain $CHAIN_ID" >&2
            exit 1
        fi
        echo "merchant-manager|$MERCHANT_MANAGER_ADDRESS"
        return
    fi
    if [[ -n "$ESCROW_ADDRESS" ]]; then
        echo "escrow|$ESCROW_ADDRESS"
        return
    fi
    echo "merchant-manager|$MERCHANT_MANAGER_ADDRESS"
}

role_to_uint() {
    case "$1" in
        None|none|0) echo 0 ;;
        TransactionKey|transactionkey|txkey|1) echo 1 ;;
        Admin|admin|2) echo 2 ;;
        SuperAdmin|superadmin|3) echo 3 ;;
        *)
            echo "Error: Unknown role '$1'. Use None|TransactionKey|Admin|SuperAdmin" >&2
            exit 1
            ;;
    esac
}

bool_arg() {
    case "$1" in
        true|TRUE|1|yes|on) echo true ;;
        false|FALSE|0|no|off) echo false ;;
        *)
            echo "Error: Expected true|false, got '$1'" >&2
            exit 1
            ;;
    esac
}

cast_send() {
    local key="$1"
    local to="$2"
    shift 2
    local extra=()
    if [[ -n "$GAS_LIMIT" ]]; then
        extra+=(--gas-limit "$GAS_LIMIT")
    fi
    cast send "$to" "$@" \
        --rpc-url "$RPC_URL" \
        --private-key "$key" \
        "${extra[@]}"
}

echo "============================================"
echo "  NodeRails Settings"
echo "  Chain:    $CHAIN_NAME ($CHAIN_ID)"
echo "  Command:  $COMMAND"
echo "  Escrow:   ${ESCROW_ADDRESS:-<not deployed>}"
echo "  Merchant: ${MERCHANT_MANAGER_ADDRESS:-<not deployed>}"
echo "============================================"
echo ""

SKIP_SIM_FLAG=""
if [[ "$CHAIN_ID" == "314159" ]]; then
    SKIP_SIM_FLAG="--skip-simulation"
fi

case "$COMMAND" in
    configure|set-swap-router|set-bridge-router|set-fee-recipient|unpause|lift-full-stop|emergency-withdraw)
        echo "This command is SuperAdmin 3-of-5. Use NodeRails War Room (shareable proposal)."
        echo "Settlement tokens: set-settlement-token with ADMIN_PRIVATE_KEY, or the admin portal."
        echo "Local ops-ui halt (pause / full-stop) and Admin revoke-TX still work here."
        exit 1
        ;;
    set-settlement-token)
        addr="${POS_ARGS[0]:-}"
        allowed_raw="${POS_ARGS[1]:-}"
        if [[ -z "$addr" || -z "$allowed_raw" ]]; then usage; fi
        allowed=$(bool_arg "$allowed_raw")
        resolved=$(resolve_target escrow)
        to="${resolved#*|}"
        : "${ADMIN_PRIVATE_KEY:?ADMIN_PRIVATE_KEY is required}"
        echo "setAllowedSettlementToken($addr, $allowed) as Admin on $to"
        cast_send "$ADMIN_PRIVATE_KEY" "$to" "setAllowedSettlementToken(address,bool)" "$addr" "$allowed"
        ;;
    set-fee-on-transfer)
        enabled_raw="${POS_ARGS[0]:-}"
        if [[ -z "$enabled_raw" ]]; then usage; fi
        enabled=$(bool_arg "$enabled_raw")
        resolved=$(resolve_target escrow)
        to="${resolved#*|}"
        : "${ADMIN_PRIVATE_KEY:?ADMIN_PRIVATE_KEY is required}"
        echo "setFeeOnTransferEnabled($enabled) as Admin on $to"
        cast_send "$ADMIN_PRIVATE_KEY" "$to" "setFeeOnTransferEnabled(bool)" "$enabled"
        ;;
    set-key-role)
        addr="${POS_ARGS[0]:-}"
        role_name="${POS_ARGS[1]:-}"
        if [[ -z "$addr" || -z "$role_name" ]]; then usage; fi
        role_u=$(role_to_uint "$role_name")
        if [[ "$role_u" != "0" ]]; then
            echo "Admin can only revoke (None). Adding Admin/TX keys is SuperAdmin 3-of-5 in War Room."
            exit 1
        fi
        resolved=$(resolve_target any)
        kind="${resolved%%|*}"
        to="${resolved#*|}"
        : "${ADMIN_PRIVATE_KEY:?ADMIN_PRIVATE_KEY is required}"
        echo "setKeyRole($addr, None) as Admin on $kind $to"
        cast_send "$ADMIN_PRIVATE_KEY" "$to" "setKeyRole(address,uint8)" "$addr" "$role_u"
        ;;
    pause)
        resolved=$(resolve_target any)
        kind="${resolved%%|*}"
        to="${resolved#*|}"
        : "${ADMIN_PRIVATE_KEY:?ADMIN_PRIVATE_KEY is required to pause (Admin or SuperAdmin signer)}"
        echo "pause() on $kind $to"
        cast_send "$ADMIN_PRIVATE_KEY" "$to" "pause()"
        ;;
    full-stop)
        resolved=$(resolve_target any)
        kind="${resolved%%|*}"
        to="${resolved#*|}"
        : "${ADMIN_PRIVATE_KEY:?ADMIN_PRIVATE_KEY is required for fullStop (Admin or SuperAdmin signer)}"
        echo "fullStop() on $kind $to"
        cast_send "$ADMIN_PRIVATE_KEY" "$to" "fullStop()"
        ;;
    *)
        echo "Error: Unknown command '$COMMAND'"
        usage
        ;;
esac

echo ""
echo "============================================"
echo "  Settings complete: $COMMAND"
echo "============================================"
