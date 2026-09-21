// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/NodeRailsEscrow.sol";
import "../src/interfaces/INodeRailsEscrow.sol";
import "../src/libraries/TimelocksLib.sol";
import "./SuperAdminTestBase.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract SuperAdmin3of5Test is SuperAdminTestBase {
    NodeRailsEscrow public escrow;
    address public admin;
    address public transactionKey;
    uint256 public transactionKeyPrivate;
    address public merchant;
    address public payer;
    address public treasury;

    function setUp() public {
        _initSuperAdminSigners();
        (admin,) = makeAddrAndKey("admin");
        (transactionKey, transactionKeyPrivate) = makeAddrAndKey("transactionKey");
        merchant = makeAddr("merchant");
        payer = makeAddr("payer");
        treasury = makeAddr("treasury");
        vm.deal(payer, 100 ether);

        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;
        escrow = _newEscrow(initialAdmins, _one(transactionKey), treasury);
    }

    function test_NonceCannotReplayOnSameContract() public {
        address router = makeAddr("router");
        SuperAdmin3of5.SuperAdminProof memory proof =
            _proof(escrow, escrow.ACTION_SET_SWAP_ROUTER(), keccak256(abi.encode(router, true)));
        escrow.setSwapRouter(router, true, proof);
        vm.expectRevert("Nonce already used");
        escrow.setSwapRouter(router, true, proof);
    }

    function test_WrongTargetReverts() public {
        address router = makeAddr("router");
        SuperAdmin3of5.ChainTarget[] memory targets = new SuperAdmin3of5.ChainTarget[](1);
        targets[0] = SuperAdmin3of5.ChainTarget({chainId: block.chainid, contractAddress: address(0xdead)});
        uint256 nonce = nextSaNonce++;
        uint256 deadline = block.timestamp + 1 days;
        bytes32 structHash = escrow.hashSuperAdminAction(
            keccak256("setSwapRouter"), keccak256(abi.encode(router, true)), nonce, deadline, targets
        );
        bytes32 digest = MessageHashUtils.toTypedDataHash(escrow.warRoomDomainSeparator(), structHash);
        SuperAdmin3of5.SuperAdminProof memory proof = SuperAdmin3of5.SuperAdminProof({
            nonce: nonce,
            deadline: deadline,
            targets: targets,
            signatures: _pack3(digest)
        });
        vm.expectRevert("This contract not in targets");
        escrow.setSwapRouter(router, true, proof);
    }

    function test_RotateSuperAdmin() public {
        address next = makeAddr("nextSigner");
        _saRotate(escrow, 4, next);
        assertEq(escrow.superAdminSigner(4), next);
        assertFalse(escrow.isSuperAdminSigner(sa[4]));
        assertTrue(escrow.isSuperAdminSigner(next));
    }

    function test_SingleSignerCannotUnpause() public {
        vm.prank(admin);
        escrow.pause();
        vm.prank(sa[0]);
        vm.expectRevert();
        escrow.unpause(_emptyProof());
    }

    function test_SettlePayment_BlockedWhenPaused() public {
        bytes32 paymentIntentId = keccak256("paused-settle");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 1 days);
        bytes32 nonce = keccak256(abi.encodePacked(paymentIntentId, "native"));
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "CaptureNativePayment(bytes32 paymentIntentId,address merchant,uint256 amount,uint16 feeBps,uint256 timelocks,uint256 nonce)"
                ),
                paymentIntentId,
                merchant,
                uint256(1 ether),
                uint16(200),
                Timelocks.unwrap(timelocks),
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(transactionKeyPrivate, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(payer);
        escrow.captureNativePayment{value: 1 ether}(paymentIntentId, merchant, 200, timelocks, signature);

        vm.prank(admin);
        escrow.pause();
        vm.warp(block.timestamp + 2 days);
        vm.prank(transactionKey);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        escrow.settlePayment(paymentIntentId);
    }

    function test_LiftClearsEmergencyWithdraw() public {
        vm.deal(address(escrow), 1 ether);
        address rescue = makeAddr("rescue");
        address[] memory tokens = new address[](0);
        vm.prank(admin);
        escrow.fullStop();
        _saInitiateEmergency(escrow, tokens, rescue);
        assertGt(escrow.emergencyWithdrawInitiatedAt(), 0);
        _saLift(escrow);
        assertEq(escrow.emergencyWithdrawInitiatedAt(), 0);
        assertEq(escrow.emergencyWithdrawTo(), address(0));
    }
}
