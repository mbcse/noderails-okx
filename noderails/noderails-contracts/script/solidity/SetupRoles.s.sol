// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../../src/NodeRailsEscrow.sol";
import "../../src/NodeRailsMerchantManager.sol";

// ============================================================================
// SHARED HELPERS
// ============================================================================

abstract contract RoleScript is Script {
    NodeRailsEscrow internal escrow;
    NodeRailsMerchantManager internal merchantManager;
    bool internal hasEscrow;
    bool internal hasMerchantManager;

    function _loadContracts() internal {
        string memory escrowRaw = vm.envString("ESCROW_ADDRESS");
        string memory mmRaw = vm.envString("MERCHANT_MANAGER_ADDRESS");

        if (bytes(escrowRaw).length > 0) {
            address escrowAddr = vm.parseAddress(escrowRaw);
            escrow = NodeRailsEscrow(payable(escrowAddr));
            hasEscrow = true;
            console.log("Escrow:", escrowAddr);
        } else {
            hasEscrow = false;
            console.log("Escrow: <not deployed>");
        }

        if (bytes(mmRaw).length > 0) {
            address mmAddr = vm.parseAddress(mmRaw);
            merchantManager = NodeRailsMerchantManager(payable(mmAddr));
            hasMerchantManager = true;
            console.log("MerchantManager:", mmAddr);
        } else {
            hasMerchantManager = false;
            console.log("MerchantManager: <not deployed>");
        }

        require(hasEscrow || hasMerchantManager, "No target contract deployed");
    }

    function _parseAddresses(string memory envKey) internal view returns (address[] memory) {
        string memory raw = vm.envString(envKey);
        bytes memory b = bytes(raw);

        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ',') count++;
        }

        string[] memory parts = new string[](count);
        uint256 start = 0;
        uint256 idx = 0;
        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ',') {
                bytes memory part = new bytes(i - start);
                for (uint256 j = start; j < i; j++) {
                    part[j - start] = b[j];
                }
                parts[idx] = string(part);
                idx++;
                start = i + 1;
            }
        }

        address[] memory addrs = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            addrs[i] = vm.parseAddress(parts[i]);
            require(addrs[i] != address(0), "Invalid address in list");
        }
        return addrs;
    }

    function _firstAddressFromCsv(string memory envKey) internal view returns (address) {
        string memory raw = vm.envString(envKey);
        bytes memory b = bytes(raw);

        uint256 end = b.length;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ',') {
                end = i;
                break;
            }
        }

        bytes memory first = new bytes(end);
        for (uint256 i = 0; i < end; i++) {
            first[i] = b[i];
        }
        address parsed = vm.parseAddress(string(first));
        require(parsed != address(0), "Invalid first admin address");
        return parsed;
    }

    function _setRole(
        address key,
        INodeRailsEscrow.KeyRole escrowRole,
        INodeRailsMerchantManager.KeyRole mmRole
    ) internal {
        if (hasEscrow) {
            escrow.setKeyRole(key, escrowRole);
        }
        if (hasMerchantManager) {
            merchantManager.setKeyRole(key, mmRole);
        }
    }

    function _logRole(address key) internal view {
        console.log("  Address:", key);
        if (hasEscrow) {
            console.log("    Escrow role:", uint256(escrow.getKeyRole(key)));
        } else {
            console.log("    Escrow role: <skipped>");
        }
        if (hasMerchantManager) {
            console.log("    MerchantManager role:", uint256(merchantManager.getKeyRole(key)));
        } else {
            console.log("    MerchantManager role: <skipped>");
        }
    }
}

// ============================================================================
// FULL INITIAL SETUP (admins + transaction keys)
// Uses SUPER_ADMIN_PRIVATE_KEY to assign roles
// ============================================================================

contract SetupRoles is RoleScript {
    function run() external {
        uint256 superAdminKey = vm.envUint("SUPER_ADMIN_PRIVATE_KEY");
        _loadContracts();

        address[] memory admins = _parseAddresses("ADMIN_ADDRESSES");
        address[] memory txKeys = _parseAddresses("TRANSACTION_KEY_ADDRESSES");

        vm.startBroadcast(superAdminKey);

        for (uint256 i = 0; i < admins.length; i++) {
            _setRole(admins[i], INodeRailsEscrow.KeyRole.Admin, INodeRailsMerchantManager.KeyRole.Admin);
            console.log("Added admin:", admins[i]);
        }

        for (uint256 i = 0; i < txKeys.length; i++) {
            _setRole(txKeys[i], INodeRailsEscrow.KeyRole.TransactionKey, INodeRailsMerchantManager.KeyRole.TransactionKey);
            console.log("Added transaction key:", txKeys[i]);
        }

        vm.stopBroadcast();

        console.log("\n=== Setup Complete ===");
        console.log("Admins:", admins.length);
        for (uint256 i = 0; i < admins.length; i++) _logRole(admins[i]);
        console.log("Transaction Keys:", txKeys.length);
        for (uint256 i = 0; i < txKeys.length; i++) _logRole(txKeys[i]);
    }
}

// ============================================================================
// ADD TRANSACTION KEYS
// Uses ADMIN_PRIVATE_KEY (must match first ADMIN_ADDRESSES entry)
// ============================================================================

contract AddTransactionKeys is RoleScript {
    function run() external {
        uint256 adminKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address firstAdmin = _firstAddressFromCsv("ADMIN_ADDRESSES");
        address[] memory addrs = _parseAddresses("TRANSACTION_KEY_ADDRESSES");

        _loadContracts();
        require(vm.addr(adminKey) == firstAdmin, "ADMIN_PRIVATE_KEY must match first ADMIN_ADDRESSES entry");
        if (hasEscrow) {
            require(
                escrow.getKeyRole(firstAdmin) == INodeRailsEscrow.KeyRole.Admin,
                "First admin is not Admin in Escrow"
            );
        }
        if (hasMerchantManager) {
            require(
                merchantManager.getKeyRole(firstAdmin) == INodeRailsMerchantManager.KeyRole.Admin,
                "First admin is not Admin in MerchantManager"
            );
        }

        vm.startBroadcast(adminKey);

        for (uint256 i = 0; i < addrs.length; i++) {
            _setRole(addrs[i], INodeRailsEscrow.KeyRole.TransactionKey, INodeRailsMerchantManager.KeyRole.TransactionKey);
            console.log("Added transaction key:", addrs[i]);
        }

        vm.stopBroadcast();

        console.log("\n=== Added", addrs.length, "transaction key(s) ===");
        for (uint256 i = 0; i < addrs.length; i++) _logRole(addrs[i]);
    }
}

// ============================================================================
// ADD ADMINS
// Uses SUPER_ADMIN_PRIVATE_KEY
// ============================================================================

contract AddAdmins is RoleScript {
    function run() external {
        uint256 superAdminKey = vm.envUint("SUPER_ADMIN_PRIVATE_KEY");
        address[] memory addrs = _parseAddresses("ADMIN_ADDRESSES");

        _loadContracts();
        vm.startBroadcast(superAdminKey);

        for (uint256 i = 0; i < addrs.length; i++) {
            _setRole(addrs[i], INodeRailsEscrow.KeyRole.Admin, INodeRailsMerchantManager.KeyRole.Admin);
            console.log("Added admin:", addrs[i]);
        }

        vm.stopBroadcast();

        console.log("\n=== Added", addrs.length, "admin(s) ===");
        for (uint256 i = 0; i < addrs.length; i++) _logRole(addrs[i]);
    }
}

// ============================================================================
// REMOVE KEYS
// Uses SUPER_ADMIN_PRIVATE_KEY
// ============================================================================

contract RemoveKeys is RoleScript {
    function run() external {
        uint256 adminKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address[] memory addrs = _parseAddresses("REMOVE_ADDRESSES");

        _loadContracts();
        vm.startBroadcast(adminKey);

        for (uint256 i = 0; i < addrs.length; i++) {
            _setRole(addrs[i], INodeRailsEscrow.KeyRole.None, INodeRailsMerchantManager.KeyRole.None);
            console.log("Removed key:", addrs[i]);
        }

        vm.stopBroadcast();

        console.log("\n=== Removed", addrs.length, "key(s) ===");
        for (uint256 i = 0; i < addrs.length; i++) _logRole(addrs[i]);
    }
}
