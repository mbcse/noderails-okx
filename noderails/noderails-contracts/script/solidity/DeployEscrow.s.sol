// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./LibEnvParse.sol";
import "../../src/NodeRailsEscrow.sol";

contract DeployEscrow is LibEnvParse {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address[5] memory signers = _parseSuperAdminSigners();
        address[] memory admins = _parseAddresses("ADMIN_ADDRESSES", "Invalid admin in ADMIN_ADDRESSES");
        address[] memory txKeys = _parseAddressesOptional("TRANSACTION_KEY_ADDRESSES", "Invalid TX key in TRANSACTION_KEY_ADDRESSES");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT_ADDRESS");
        address[] memory swapRouters = _parseAddressesOptional("SWAP_ROUTERS", "Invalid router in SWAP_ROUTERS");
        address[] memory bridgeRouters = _parseAddressesOptional("BRIDGE_ROUTERS", "Invalid router in BRIDGE_ROUTERS");
        address[] memory settlementTokens = _parseAddressesOptional("SETTLEMENT_TOKENS", "Invalid token in SETTLEMENT_TOKENS");

        require(admins.length > 0, "ADMIN_ADDRESSES not set");
        require(feeRecipient != address(0), "FEE_RECIPIENT_ADDRESS not set");
        _requireAdminsNotSigners(admins, signers);
        _requireNotSigners(txKeys, signers, "TX key cannot be super admin signer");
        _requireNoOverlap(admins, txKeys, "Admin and TX key lists overlap");

        console.log("Deploying NodeRailsEscrow...");
        console.log("Chain ID:", block.chainid);
        console.log("Admins:", admins.length);
        console.log("TX keys:", txKeys.length);
        console.log("Fee Recipient:", feeRecipient);

        vm.startBroadcast(deployerPrivateKey);
        NodeRailsEscrow escrow = new NodeRailsEscrow(
            signers, admins, txKeys, feeRecipient, swapRouters, bridgeRouters, settlementTokens
        );
        vm.stopBroadcast();

        for (uint256 i = 0; i < 5; i++) {
            require(escrow.isSuperAdminSigner(signers[i]), "Escrow: signer not set");
        }
        for (uint256 i = 0; i < admins.length; i++) {
            require(escrow.getKeyRole(admins[i]) == INodeRailsEscrow.KeyRole.Admin, "Escrow: Admin not set correctly");
        }
        for (uint256 i = 0; i < txKeys.length; i++) {
            require(escrow.getKeyRole(txKeys[i]) == INodeRailsEscrow.KeyRole.TransactionKey, "Escrow: TX key not set");
        }

        console.log("NodeRailsEscrow deployed at:", address(escrow));
        console.log("NodeRailsEscrowLogic:", escrow.logic());
        console.log("Admins set:", admins.length);
        console.log("TX keys set:", txKeys.length);
        console.log("Verification passed!");
        console.log("Later Admin/TX/router/fee changes: NodeRails War Room 3-of-5");
        console.log("Later settlement tokens: Admin (admin portal or settings.sh)");
    }
}
