// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/NodeRailsEscrow.sol";
import "../src/interfaces/INodeRailsEscrow.sol";
import "./SuperAdminTestBase.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract AdminMockERC20 is ERC20 {
    constructor() ERC20("Mock", "MOCK") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

contract NodeRailsEscrowAdminTest is SuperAdminTestBase {
    NodeRailsEscrow public escrow;
    AdminMockERC20 public token;

    address public superAdmin;
    address public admin;
    address public transactionKey;
    address public treasury;
    address public outsider;

    address public swapRouter;
    address public bridgeRouter;

    function setUp() public {
        _initSuperAdminSigners();
        superAdmin = sa[0];
        (admin,) = makeAddrAndKey("admin");
        (transactionKey,) = makeAddrAndKey("transactionKey");
        treasury = makeAddr("treasury");
        outsider = makeAddr("outsider");
        swapRouter = makeAddr("swapRouter");
        bridgeRouter = makeAddr("bridgeRouter");

        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;

        escrow = _newEscrow(initialAdmins, _one(transactionKey), treasury);

        token = new AdminMockERC20();
    }

    function test_SetSwapRouter_AllowAndRevoke() public {
        _saSetSwapRouter(escrow, swapRouter, true);
        assertTrue(escrow.allowedSwapRouters(swapRouter));
        _saSetSwapRouter(escrow, swapRouter, false);
        assertFalse(escrow.allowedSwapRouters(swapRouter));
    }

    function test_SetSwapRouter_RequiresProof() public {
        vm.prank(outsider);
        vm.expectRevert("Need 3 signatures");
        escrow.setSwapRouter(swapRouter, true, _emptyProof());
    }

    function test_SetSwapRouter_InvalidRouter() public {
        vm.expectRevert("Invalid router");
        _saSetSwapRouter(escrow, address(0), true);
    }

    function test_SetBridgeRouter_AllowAndRevoke() public {
        _saSetBridgeRouter(escrow, bridgeRouter, true);
        assertTrue(escrow.allowedBridgeRouters(bridgeRouter));
        _saSetBridgeRouter(escrow, bridgeRouter, false);
        assertFalse(escrow.allowedBridgeRouters(bridgeRouter));
    }

    function test_SetAllowedSettlementToken_AllowAndRevoke() public {
        _adminSetSettlementToken(escrow, admin, address(token), true);
        assertTrue(escrow.allowedSettlementTokens(address(token)));
        _adminSetSettlementToken(escrow, admin, address(token), false);
        assertFalse(escrow.allowedSettlementTokens(address(token)));
    }

    function test_SetAllowedSettlementToken_RequiresAdmin() public {
        vm.prank(outsider);
        vm.expectRevert("Not admin");
        escrow.setAllowedSettlementToken(address(token), true);

        vm.prank(transactionKey);
        vm.expectRevert("Not admin");
        escrow.setAllowedSettlementToken(address(token), true);
    }

    function test_SetAllowedSettlementToken_InvalidToken() public {
        vm.prank(admin);
        vm.expectRevert("Invalid token");
        escrow.setAllowedSettlementToken(address(0), true);
    }

    function test_Allowlist_BlockedDuringFullStop() public {
        vm.prank(admin);
        escrow.fullStop();

        vm.expectRevert("Contract is full stopped");
        _saSetSwapRouter(escrow, swapRouter, true);

        vm.expectRevert("Contract is full stopped");
        _saSetBridgeRouter(escrow, bridgeRouter, true);

        vm.prank(admin);
        vm.expectRevert("Contract is full stopped");
        escrow.setAllowedSettlementToken(address(token), true);
    }

    function test_FullStop_AdminOrSigner_AndLift() public {
        assertFalse(escrow.isFullStopped());

        vm.prank(admin);
        escrow.fullStop();
        assertTrue(escrow.isFullStopped());

        vm.prank(superAdmin);
        vm.expectRevert("Already full stopped");
        escrow.fullStop();

        _saLift(escrow);
        assertFalse(escrow.isFullStopped());
    }

    function test_FullStop_OutsiderReverts() public {
        vm.prank(outsider);
        vm.expectRevert("Not admin or super admin signer");
        escrow.fullStop();
    }

    function test_LiftFullStop_WhenNotStoppedReverts() public {
        vm.expectRevert("Not full stopped");
        _saLift(escrow);
    }

    function test_EmergencyWithdraw_RequiresFullStop() public {
        token.transfer(address(escrow), 1 ether);
        address recipient = makeAddr("recipient");
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);

        vm.expectRevert("Contract is not full stopped");
        _saInitiateEmergency(escrow, tokens, recipient);
    }

    function test_EmergencyWithdraw_ERC20AfterDelay() public {
        token.transfer(address(escrow), 5 ether);
        address recipient = makeAddr("recipient");
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);

        vm.prank(admin);
        escrow.fullStop();

        _saInitiateEmergency(escrow, tokens, recipient);
        vm.expectRevert("Emergency withdraw delay");
        _saExecuteEmergency(escrow);

        vm.warp(block.timestamp + 24 hours);
        _saExecuteEmergency(escrow);

        assertEq(token.balanceOf(recipient), 5 ether);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_EmergencyWithdraw_NativeAfterDelay() public {
        vm.deal(address(escrow), 3 ether);
        address recipient = makeAddr("recipient");
        uint256 before = recipient.balance;
        address[] memory tokens = new address[](0);

        vm.prank(admin);
        escrow.fullStop();
        _saInitiateEmergency(escrow, tokens, recipient);
        vm.warp(block.timestamp + 24 hours);
        _saExecuteEmergency(escrow);

        assertEq(recipient.balance - before, 3 ether);
        assertEq(address(escrow).balance, 0);
    }

    function test_EmergencyWithdraw_ReinitResetsTimer() public {
        vm.deal(address(escrow), 1 ether);
        address first = makeAddr("first");
        address second = makeAddr("second");
        address[] memory tokens = new address[](0);

        vm.prank(admin);
        escrow.fullStop();
        _saInitiateEmergency(escrow, tokens, first);
        vm.warp(block.timestamp + 12 hours);
        _saInitiateEmergency(escrow, tokens, second);
        uint256 started = escrow.emergencyWithdrawInitiatedAt();
        vm.warp(started + 24 hours - 1);
        vm.expectRevert("Emergency withdraw delay");
        _saExecuteEmergency(escrow);

        vm.warp(started + 24 hours);
        _saExecuteEmergency(escrow);
        assertEq(second.balance, 1 ether);
        assertEq(first.balance, 0);
    }

    function test_AdminRevokeTxKeyDuringFullStop() public {
        vm.prank(admin);
        escrow.fullStop();
        vm.prank(admin);
        escrow.setKeyRole(transactionKey, INodeRailsEscrow.KeyRole.None);
        assertEq(uint256(escrow.getKeyRole(transactionKey)), uint256(INodeRailsEscrow.KeyRole.None));
    }

    function test_MAX_SETTLE_BRIDGE_RETRIES_IsFour() public view {
        assertEq(escrow.MAX_SETTLE_BRIDGE_RETRIES(), 4);
        assertEq(escrow.SETTLE_BRIDGE_RETRY_DELAY(), 1 hours);
    }

    function test_SetFeeOnTransferEnabled() public {
        assertFalse(escrow.feeOnTransferEnabled());
        vm.prank(admin);
        escrow.setFeeOnTransferEnabled(true);
        assertTrue(escrow.feeOnTransferEnabled());
        vm.prank(admin);
        escrow.setFeeOnTransferEnabled(false);
        assertFalse(escrow.feeOnTransferEnabled());
    }

    function test_SetFeeOnTransferEnabled_RequiresAdmin() public {
        vm.prank(outsider);
        vm.expectRevert("Not admin");
        escrow.setFeeOnTransferEnabled(true);
    }

    function test_SetFeeOnTransferEnabled_BlockedDuringFullStop() public {
        vm.prank(admin);
        escrow.fullStop();
        vm.prank(admin);
        vm.expectRevert("Contract is full stopped");
        escrow.setFeeOnTransferEnabled(true);
    }

    function test_RotateSuperAdmin_DuringFullStop() public {
        address next = makeAddr("nextSignerDuringHalt");
        vm.prank(admin);
        escrow.fullStop();
        _saRotate(escrow, 4, next);
        assertEq(escrow.superAdminSigner(4), next);
    }
}
