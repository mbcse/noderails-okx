#!/usr/bin/env python3
"""
Extract deployed contract addresses and ABIs from forge broadcast output.
Saves to deployData/ and appends to deploymentHistory.json.

Usage:
  python3 script/save-deploy-data.py <chainId> <scriptName>

  scriptName: DeployAll, DeployEscrow, or DeployMerchantManager
              Maps to the broadcast directory under script/solidity/

Examples:
  python3 script/save-deploy-data.py 11155111 DeployAll
  python3 script/save-deploy-data.py 11155111 DeployEscrow
"""

import json
import os
import sys
from datetime import datetime, timezone


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 script/save-deploy-data.py <chainId> <scriptName>", file=sys.stderr)
        sys.exit(1)

    chain_id = sys.argv[1]
    script_name = sys.argv[2]
    deploy_dir = "deployData"
    addresses_file = os.path.join(deploy_dir, "contractAddresses.json")
    abis_file = os.path.join(deploy_dir, "contractAbis.json")
    history_file = os.path.join(deploy_dir, "deploymentHistory.json")
    broadcast_file = f"broadcast/{script_name}.s.sol/{chain_id}/run-latest.json"

    os.makedirs(deploy_dir, exist_ok=True)

    if not os.path.exists(broadcast_file):
        print(f"Error: Broadcast file not found at {broadcast_file}", file=sys.stderr)
        sys.exit(1)

    with open(broadcast_file) as f:
        broadcast = json.load(f)

    # Extract contract addresses from CREATE transactions
    new_addresses = {}
    for tx in broadcast.get("transactions", []):
        if tx.get("transactionType") == "CREATE" and tx.get("contractName"):
            new_addresses[tx["contractName"]] = tx["contractAddress"]

    if not new_addresses:
        print("Warning: No contract deployments found in broadcast", file=sys.stderr)
        sys.exit(0)

    # --- Load existing data ---
    all_addresses = {}
    if os.path.exists(addresses_file):
        with open(addresses_file) as f:
            all_addresses = json.load(f)

    # --- Archive old addresses to history before overwriting ---
    history = []
    if os.path.exists(history_file):
        with open(history_file) as f:
            history = json.load(f)

    old_chain_addresses = all_addresses.get(chain_id, {})
    for contract_name, new_addr in new_addresses.items():
        old_addr = old_chain_addresses.get(contract_name)
        if old_addr and old_addr.lower() != new_addr.lower():
            history.append({
                "chainId": chain_id,
                "contract": contract_name,
                "address": old_addr,
                "replacedBy": new_addr,
                "replacedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            })

    # --- Update current addresses (merge, don't overwrite entire chain) ---
    if chain_id not in all_addresses:
        all_addresses[chain_id] = {}
    all_addresses[chain_id].update(new_addresses)

    with open(addresses_file, "w") as f:
        json.dump(all_addresses, f, indent=2)

    print(f"Saved {len(new_addresses)} contract address(es) for chain {chain_id}")
    for name, addr in new_addresses.items():
        print(f"  {name}: {addr}")

    # --- Save ABIs ---
    all_abis = {}
    if os.path.exists(abis_file):
        with open(abis_file) as f:
            all_abis = json.load(f)

    if chain_id not in all_abis:
        all_abis[chain_id] = {}

    for name in new_addresses:
        abi_path = os.path.join("out", f"{name}.sol", f"{name}.json")
        if os.path.exists(abi_path):
            with open(abi_path) as f:
                artifact = json.load(f)
            all_abis[chain_id][name] = artifact["abi"]
        else:
            print(f"  Warning: ABI not found at {abi_path}", file=sys.stderr)

    with open(abis_file, "w") as f:
        json.dump(all_abis, f, indent=2)

    # --- Log new deployment to history ---
    for contract_name, addr in new_addresses.items():
        history.append({
            "chainId": chain_id,
            "contract": contract_name,
            "address": addr,
            "deployedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        })

    with open(history_file, "w") as f:
        json.dump(history, f, indent=2)

    print("Deployment data saved successfully!")

if __name__ == "__main__":
    main()
