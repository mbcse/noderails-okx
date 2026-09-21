// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./LibEnvParse.sol";
import "../../src/NodeRailsMerchantManager.sol";

contract DeployMerchantManager is LibEnvParse {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address[5] memory signers = _parseSuperAdminSigners();
        address[] memory admins = _parseAddresses("ADMIN_ADDRESSES", "Invalid admin in ADMIN_ADDRESSES");
        address[] memory txKeys = _parseAddressesOptional("TRANSACTION_KEY_ADDRESSES", "Invalid TX key in TRANSACTION_KEY_ADDRESSES");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT_ADDRESS");

        require(admins.length > 0, "ADMIN_ADDRESSES not set");
        require(feeRecipient != address(0), "FEE_RECIPIENT_ADDRESS not set");
        _requireAdminsNotSigners(admins, signers);
        _requireNotSigners(txKeys, signers, "TX key cannot be super admin signer");
        _requireNoOverlap(admins, txKeys, "Admin and TX key lists overlap");

        console.log("Deploying NodeRailsMerchantManager...");
        console.log("Chain ID:", block.chainid);
        console.log("Fee Recipient:", feeRecipient);

        vm.startBroadcast(deployerPrivateKey);
        NodeRailsMerchantManager merchantManager = new NodeRailsMerchantManager(signers, admins, txKeys, feeRecipient);
        vm.stopBroadcast();

        for (uint256 i = 0; i < 5; i++) {
            require(merchantManager.isSuperAdminSigner(signers[i]), "MM: signer not set");
        }
        require(merchantManager.feeRecipient() == feeRecipient, "MerchantManager: Fee recipient not set correctly");
        for (uint256 i = 0; i < admins.length; i++) {
            require(
                merchantManager.getKeyRole(admins[i]) == INodeRailsMerchantManager.KeyRole.Admin,
                "MM: Admin not set correctly"
            );
        }
        for (uint256 i = 0; i < txKeys.length; i++) {
            require(
                merchantManager.getKeyRole(txKeys[i]) == INodeRailsMerchantManager.KeyRole.TransactionKey,
                "MM: TX key not set"
            );
        }

        console.log("NodeRailsMerchantManager deployed at:", address(merchantManager));
        console.log("Verification passed!");
        console.log("Later Admin/TX changes: NodeRails War Room 3-of-5");
    }
}
