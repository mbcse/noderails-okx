// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../../src/NodeRailsEscrow.sol";

/// @notice Allowlists are SuperAdmin 3-of-5. This script does not broadcast those writes.
/// Use NodeRails War Room (shareable proposal) after deploy.
contract ConfigureEscrow is Script {
    function run() public view {
        address escrowAddr = vm.envAddress("ESCROW_ADDRESS");
        console.log("ConfigureEscrow: setSwapRouter / setBridgeRouter require SuperAdmin 3-of-5.");
        console.log("Settlement tokens: Admin via admin portal or settings.sh set-settlement-token.");
        console.log("Escrow:", escrowAddr);
        revert("Use War Room for routers; Admin for settlement tokens");
    }
}
