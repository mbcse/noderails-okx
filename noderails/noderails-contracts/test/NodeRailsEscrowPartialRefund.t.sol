// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/NodeRailsEscrow.sol";
import "../src/interfaces/INodeRailsEscrow.sol";
import "../src/libraries/TimelocksLib.sol";
import "./SuperAdminTestBase.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockRefundToken is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract NodeRailsEscrowPartialRefundTest is SuperAdminTestBase {
    using TimelocksLib for Timelocks;

    NodeRailsEscrow public escrow;
    MockRefundToken public mockToken;

    address public admin;
    address public transactionKey;
    uint256 public transactionKeyPrivate;
    address public merchant;
    address public payer;
    address public treasury;

    uint256 public constant PAYMENT_AMOUNT = 100 * 10**18;
    uint16 public constant DEFAULT_FEE_BPS = 200;

    bytes32 private constant CAPTURE_ERC20_TYPEHASH = keccak256(
        "CaptureERC20Payment(bytes32 paymentIntentId,address merchant,address token,uint256 amount,address payer,uint16 feeBps,uint256 timelocks,uint256 nonce)"
    );

    function setUp() public {
        _initSuperAdminSigners();
        (admin,) = makeAddrAndKey("admin");
        (transactionKey, transactionKeyPrivate) = makeAddrAndKey("transactionKey");
        merchant = makeAddr("merchant");
        payer = makeAddr("payer");
        treasury = makeAddr("treasury");

        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;
        escrow = _newEscrow(initialAdmins, _one(transactionKey), treasury);

        mockToken = new MockRefundToken();
        mockToken.mint(payer, PAYMENT_AMOUNT * 10);
    }

    function test_CaptureSetsSettleAmount() public {
        bytes32 id = _capture(PAYMENT_AMOUNT);
        assertEq(escrow.settleAmount(id), PAYMENT_AMOUNT);
        assertEq(escrow.getPayment(id).amount, PAYMENT_AMOUNT);
    }

    function test_PartialThenSettleDoesNotTouchOtherPayment() public {
        uint256 amount = PAYMENT_AMOUNT;
        bytes32 paymentA = _captureId(keccak256("pool-a"), amount);
        bytes32 paymentB = _captureId(keccak256("pool-b"), amount);

        uint256 refundAmt = amount / 2;
        uint256 payerBefore = mockToken.balanceOf(payer);
        vm.prank(transactionKey);
        escrow.refundPaymentAmount(paymentA, refundAmt);

        INodeRailsEscrow.Payment memory afterRefund = escrow.getPayment(paymentA);
        assertEq(uint256(afterRefund.status), uint256(INodeRailsEscrow.PaymentStatus.Captured));
        assertEq(afterRefund.amount, amount);
        assertEq(escrow.settleAmount(paymentA), amount - refundAmt);
        assertEq(mockToken.balanceOf(payer) - payerBefore, refundAmt);
        assertEq(mockToken.balanceOf(address(escrow)), amount * 2 - refundAmt);

        vm.warp(block.timestamp + 7 days + 1);
        uint256 merchantBefore = mockToken.balanceOf(merchant);
        uint256 treasuryBefore = mockToken.balanceOf(treasury);
        vm.prank(merchant);
        escrow.settlePayment(paymentA);

        uint256 leftover = amount - refundAmt;
        uint256 expectedFee = (leftover * uint256(DEFAULT_FEE_BPS)) / 10000;
        assertEq(mockToken.balanceOf(merchant) - merchantBefore, leftover - expectedFee);
        assertEq(mockToken.balanceOf(treasury) - treasuryBefore, expectedFee);
        assertEq(escrow.settleAmount(paymentA), 0);
        assertEq(escrow.settleAmount(paymentB), amount);
        assertEq(mockToken.balanceOf(address(escrow)), amount);

        INodeRailsEscrow.Payment memory b = escrow.getPayment(paymentB);
        assertEq(uint256(b.status), uint256(INodeRailsEscrow.PaymentStatus.Captured));
        assertEq(b.amount, amount);
    }

    function test_RefundPaymentAfterPartialSendsRemaining() public {
        bytes32 id = _capture(PAYMENT_AMOUNT);
        uint256 refundAmt = PAYMENT_AMOUNT / 5;
        vm.prank(transactionKey);
        escrow.refundPaymentAmount(id, refundAmt);

        uint256 payerBefore = mockToken.balanceOf(payer);
        vm.prank(transactionKey);
        escrow.refundPayment(id);

        assertEq(mockToken.balanceOf(payer) - payerBefore, PAYMENT_AMOUNT - refundAmt);
        assertEq(uint256(escrow.getPayment(id).status), uint256(INodeRailsEscrow.PaymentStatus.Refunded));
        assertEq(escrow.settleAmount(id), 0);
    }

    function test_RefundAmountExceedsLeftoverReverts() public {
        bytes32 id = _capture(PAYMENT_AMOUNT);
        vm.prank(transactionKey);
        escrow.refundPaymentAmount(id, PAYMENT_AMOUNT / 2);

        vm.prank(transactionKey);
        vm.expectRevert("Invalid refund amount");
        escrow.refundPaymentAmount(id, PAYMENT_AMOUNT);
    }

    function test_MerchantCannotRefundAmount() public {
        bytes32 id = _capture(PAYMENT_AMOUNT);
        vm.prank(merchant);
        vm.expectRevert("Not authorized");
        escrow.refundPaymentAmount(id, 1);
    }

    function _capture(uint256 amount) internal returns (bytes32) {
        return _captureId(keccak256(abi.encodePacked("erc20", amount, block.timestamp)), amount);
    }

    function _captureId(bytes32 paymentIntentId, uint256 amount) internal returns (bytes32) {
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        vm.prank(payer);
        mockToken.approve(address(escrow), amount);

        bytes32 nonce = keccak256(abi.encodePacked(paymentIntentId, "erc20"));
        bytes32 structHash = keccak256(
            abi.encode(
                CAPTURE_ERC20_TYPEHASH,
                paymentIntentId,
                merchant,
                address(mockToken),
                amount,
                payer,
                DEFAULT_FEE_BPS,
                Timelocks.unwrap(timelocks),
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(transactionKeyPrivate, digest);

        INodeRailsEscrow.PermitData memory permitData = INodeRailsEscrow.PermitData({
            amount: 0, deadline: 0, v: 0, r: bytes32(0), s: bytes32(0)
        });

        vm.prank(transactionKey);
        escrow.captureERC20Payment(
            paymentIntentId,
            merchant,
            address(mockToken),
            amount,
            payer,
            DEFAULT_FEE_BPS,
            timelocks,
            permitData,
            abi.encodePacked(r, s, v)
        );
        return paymentIntentId;
    }
}
