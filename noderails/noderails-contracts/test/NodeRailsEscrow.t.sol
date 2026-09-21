// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/NodeRailsEscrow.sol";
import "../src/interfaces/INodeRailsEscrow.sol";
import "../src/libraries/TimelocksLib.sol";
import "./SuperAdminTestBase.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1_000_000 * 10**18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockFeeOnTransferERC20 is ERC20 {
    uint16 public immutable taxBps;

    constructor(uint16 taxBps_) ERC20("Tax Token", "TAX") {
        taxBps = taxBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && taxBps > 0) {
            uint256 tax = (value * taxBps) / 10_000;
            super._update(from, to, value - tax);
            if (tax > 0) {
                super._update(from, address(0), tax);
            }
            return;
        }
        super._update(from, to, value);
    }
}

contract NodeRailsEscrowTest is SuperAdminTestBase {
    using TimelocksLib for Timelocks;

    NodeRailsEscrow public escrow;
    MockERC20 public mockToken;

    address public superAdmin;
    uint256 public superAdminKey;
    
    address public admin;
    uint256 public adminKey;
    
    address public transactionKey;
    uint256 public transactionKeyPrivate;
    
    address public merchant;
    address public payer;
    address public treasury;
    
    uint256 public constant PAYMENT_AMOUNT = 100 * 10**18;
    uint16 public constant DEFAULT_FEE_BPS = 200; // 2%

    bytes32 private constant CAPTURE_NATIVE_TYPEHASH = keccak256(
        "CaptureNativePayment(bytes32 paymentIntentId,address merchant,uint256 amount,uint16 feeBps,uint256 timelocks,uint256 nonce)"
    );

    bytes32 private constant CAPTURE_ERC20_TYPEHASH = keccak256(
        "CaptureERC20Payment(bytes32 paymentIntentId,address merchant,address token,uint256 amount,address payer,uint16 feeBps,uint256 timelocks,uint256 nonce)"
    );

    event PaymentCaptured(
        bytes32 indexed paymentIntentId,
        address indexed merchant,
        address indexed payer,
        address token,
        uint256 amount,
        uint16 feeBps,
        Timelocks timelocks
    );

    event PaymentSettled(
        bytes32 indexed paymentIntentId,
        address indexed merchant,
        uint256 merchantAmount,
        uint256 platformFee
    );

    event DisputeInitiated(
        bytes32 indexed paymentIntentId,
        address indexed payer
    );

    event DisputeResolved(
        bytes32 indexed paymentIntentId,
        address winner,
        uint256 amount,
        uint256 platformFee
    );

    event FeeRecipientUpdated(address indexed newFeeRecipient);

    function setUp() public {
        _initSuperAdminSigners();
        superAdmin = sa[0];
        superAdminKey = saKey[0];
        (admin, adminKey) = makeAddrAndKey("admin");
        (transactionKey, transactionKeyPrivate) = makeAddrAndKey("transactionKey");
        merchant = makeAddr("merchant");
        payer = makeAddr("payer");
        treasury = makeAddr("treasury");

        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;

        escrow = _newEscrow(initialAdmins, _one(transactionKey), treasury);

        mockToken = new MockERC20();
        mockToken.mint(payer, PAYMENT_AMOUNT * 10);
        vm.deal(payer, 100 ether);
    }

    // ============ Constructor Tests ============

    function test_Constructor() public view {
        assertEq(uint256(escrow.getKeyRole(superAdmin)), uint256(INodeRailsEscrow.KeyRole.None));
        assertTrue(escrow.isSuperAdminSigner(superAdmin));
        assertEq(escrow.superAdminSigner(0), sa[0]);
        assertEq(uint256(escrow.getKeyRole(admin)), uint256(INodeRailsEscrow.KeyRole.Admin));
        assertEq(escrow.feeRecipient(), treasury);
        assertEq(uint256(escrow.getKeyRole(transactionKey)), uint256(INodeRailsEscrow.KeyRole.TransactionKey));
    }

    function test_Constructor_InvalidSuperAdmin() public {
        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;
        address[5] memory bad;
        bad[0] = address(0);
        bad[1] = sa[1];
        bad[2] = sa[2];
        bad[3] = sa[3];
        bad[4] = sa[4];
        vm.expectRevert("Invalid super admin signer");
        new NodeRailsEscrow(bad, initialAdmins, _empty(), treasury, _empty(), _empty(), _empty());
    }

    function test_Constructor_InvalidFeeRecipient() public {
        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;
        vm.expectRevert("Invalid fee recipient");
        new NodeRailsEscrow(_saSigners(), initialAdmins, _empty(), address(0), _empty(), _empty(), _empty());
    }

    function test_Constructor_SetsTxKeysAndAllowlists() public {
        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;
        address router = makeAddr("ctorSwap");
        address bridge = makeAddr("ctorBridge");
        address token = makeAddr("ctorToken");
        NodeRailsEscrow deployed = _newEscrow(
            initialAdmins,
            _one(transactionKey),
            treasury,
            _one(router),
            _one(bridge),
            _one(token)
        );
        assertEq(uint256(deployed.getKeyRole(transactionKey)), uint256(INodeRailsEscrow.KeyRole.TransactionKey));
        assertTrue(deployed.allowedSwapRouters(router));
        assertTrue(deployed.allowedBridgeRouters(bridge));
        assertTrue(deployed.allowedSettlementTokens(token));
    }

    function test_Constructor_RejectsDuplicateKey() public {
        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;
        vm.expectRevert("Duplicate initial key");
        _newEscrow(initialAdmins, _one(admin), treasury);
    }

    // ============ Native Payment Tests ============

    function test_CaptureNativePayment() public {
        bytes32 paymentIntentId = keccak256("payment1");
        uint256 amount = 1 ether;
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);

        bytes memory signature = _signNativeCapture(
            paymentIntentId, merchant, amount, DEFAULT_FEE_BPS, timelocks, transactionKeyPrivate
        );

        vm.prank(payer);
        escrow.captureNativePayment{value: amount}(
            paymentIntentId,
            merchant,
            DEFAULT_FEE_BPS,
            timelocks,
            signature
        );

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(payment.merchant, merchant);
        assertEq(payment.payer, payer);
        assertEq(payment.token, address(0));
        assertEq(payment.amount, amount);
        assertEq(payment.feeBps, DEFAULT_FEE_BPS);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Captured));
        assertEq(payment.timelocks.get(TimelocksLib.Stage.Settlement), block.timestamp + 7 days);
    }

    function test_CaptureNativePayment_NoETH() public {
        bytes32 paymentIntentId = keccak256("payment1");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        bytes memory signature = _signNativeCapture(
            paymentIntentId, merchant, 1 ether, DEFAULT_FEE_BPS, timelocks, transactionKeyPrivate
        );

        vm.prank(payer);
        vm.expectRevert("No ETH sent");
        escrow.captureNativePayment{value: 0}(
            paymentIntentId,
            merchant,
            DEFAULT_FEE_BPS,
            timelocks,
            signature
        );
    }

    function test_CaptureNativePayment_InvalidMerchant() public {
        bytes32 paymentIntentId = keccak256("payment1");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        bytes memory signature = _signNativeCapture(
            paymentIntentId, address(0), 1 ether, DEFAULT_FEE_BPS, timelocks, transactionKeyPrivate
        );

        vm.prank(payer);
        vm.expectRevert("Invalid merchant");
        escrow.captureNativePayment{value: 1 ether}(
            paymentIntentId,
            address(0),
            DEFAULT_FEE_BPS,
            timelocks,
            signature
        );
    }

    function test_CaptureNativePayment_FeeTooHigh() public {
        bytes32 paymentIntentId = keccak256("payment1");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        uint16 excessiveFee = 1001;
        bytes memory signature = _signNativeCapture(
            paymentIntentId, merchant, 1 ether, excessiveFee, timelocks, transactionKeyPrivate
        );

        vm.prank(payer);
        vm.expectRevert("Fee too high");
        escrow.captureNativePayment{value: 1 ether}(
            paymentIntentId,
            merchant,
            excessiveFee,
            timelocks,
            signature
        );
    }

    function test_CaptureNativePayment_DuplicatePayment() public {
        bytes32 paymentIntentId = keccak256("payment1");
        uint256 amount = 1 ether;
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);

        bytes memory signature = _signNativeCapture(
            paymentIntentId, merchant, amount, DEFAULT_FEE_BPS, timelocks, transactionKeyPrivate
        );

        vm.prank(payer);
        escrow.captureNativePayment{value: amount}(
            paymentIntentId,
            merchant,
            DEFAULT_FEE_BPS,
            timelocks,
            signature
        );

        vm.prank(payer);
        vm.expectRevert("Payment exists");
        escrow.captureNativePayment{value: amount}(
            paymentIntentId,
            merchant,
            DEFAULT_FEE_BPS,
            timelocks,
            signature
        );
    }

    // ============ ERC20 Payment Tests ============

    function test_CaptureERC20Payment() public {
        bytes32 paymentIntentId = keccak256("payment2");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);

        vm.prank(payer);
        mockToken.approve(address(escrow), PAYMENT_AMOUNT);

        bytes memory signature = _signERC20Capture(
            paymentIntentId,
            merchant,
            address(mockToken),
            PAYMENT_AMOUNT,
            payer,
            DEFAULT_FEE_BPS,
            timelocks,
            transactionKeyPrivate
        );

        INodeRailsEscrow.PermitData memory permitData = INodeRailsEscrow.PermitData({
            amount: 0, deadline: 0, v: 0, r: bytes32(0), s: bytes32(0)
        });

        vm.prank(transactionKey);
        escrow.captureERC20Payment(
            paymentIntentId,
            merchant,
            address(mockToken),
            PAYMENT_AMOUNT,
            payer,
            DEFAULT_FEE_BPS,
            timelocks,
            permitData,
            signature
        );

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(payment.merchant, merchant);
        assertEq(payment.payer, payer);
        assertEq(payment.token, address(mockToken));
        assertEq(payment.amount, PAYMENT_AMOUNT);
        assertEq(payment.feeBps, DEFAULT_FEE_BPS);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Captured));
    }

    function test_CaptureERC20Payment_RejectsAdminPlatformSignature() public {
        bytes32 paymentIntentId = keccak256("payment-admin-sig");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        INodeRailsEscrow.PermitData memory permitData = INodeRailsEscrow.PermitData({
            amount: 0, deadline: 0, v: 0, r: bytes32(0), s: bytes32(0)
        });
        bytes memory signature = _signERC20Capture(
            paymentIntentId, merchant, address(mockToken), PAYMENT_AMOUNT, payer, DEFAULT_FEE_BPS, timelocks, adminKey
        );
        vm.prank(transactionKey);
        vm.expectRevert("Invalid signature");
        escrow.captureERC20Payment(
            paymentIntentId, merchant, address(mockToken), PAYMENT_AMOUNT, payer, DEFAULT_FEE_BPS, timelocks, permitData, signature
        );
    }

    function test_CaptureERC20Payment_OnlyTransactionKey() public {
        bytes32 paymentIntentId = keccak256("payment2");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);

        INodeRailsEscrow.PermitData memory permitData = INodeRailsEscrow.PermitData({
            amount: 0, deadline: 0, v: 0, r: bytes32(0), s: bytes32(0)
        });

        bytes memory signature = _signERC20Capture(
            paymentIntentId, merchant, address(mockToken), PAYMENT_AMOUNT, payer, DEFAULT_FEE_BPS, timelocks, transactionKeyPrivate
        );

        vm.prank(payer);
        vm.expectRevert("Not authorized");
        escrow.captureERC20Payment(
            paymentIntentId, merchant, address(mockToken), PAYMENT_AMOUNT, payer, DEFAULT_FEE_BPS, timelocks, permitData, signature
        );
    }

    // ============ Settlement Tests ============

    function test_SettlePayment() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);

        vm.warp(block.timestamp + 7 days + 1);

        uint256 merchantBalanceBefore = merchant.balance;
        uint256 treasuryBalanceBefore = treasury.balance;

        vm.prank(transactionKey);
        escrow.settlePayment(paymentIntentId);

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Settled));

        // 2% of 1 ether = 0.02 ether fee, 0.98 ether to merchant
        assertEq(merchant.balance - merchantBalanceBefore, 0.98 ether);
        assertEq(treasury.balance - treasuryBalanceBefore, 0.02 ether);
    }

    function test_SettlePayment_ZeroFee() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, 0, 7 days);

        vm.warp(block.timestamp + 7 days + 1);

        uint256 merchantBalanceBefore = merchant.balance;
        uint256 treasuryBalanceBefore = treasury.balance;

        vm.prank(transactionKey);
        escrow.settlePayment(paymentIntentId);

        assertEq(merchant.balance - merchantBalanceBefore, 1 ether);
        assertEq(treasury.balance - treasuryBalanceBefore, 0);
    }

    function test_SettlePayment_TimelockNotExpired() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);

        vm.prank(transactionKey);
        vm.expectRevert("Too early");
        escrow.settlePayment(paymentIntentId);
    }

    function test_SettlePayment_ERC20() public {
        bytes32 paymentIntentId = _captureERC20Payment(PAYMENT_AMOUNT, DEFAULT_FEE_BPS, 7 days);

        vm.warp(block.timestamp + 7 days + 1);

        uint256 merchantBalanceBefore = mockToken.balanceOf(merchant);
        uint256 treasuryBalanceBefore = mockToken.balanceOf(treasury);

        vm.prank(transactionKey);
        escrow.settlePayment(paymentIntentId);

        // 2% of PAYMENT_AMOUNT
        uint256 expectedFee = (PAYMENT_AMOUNT * uint256(DEFAULT_FEE_BPS)) / 10000;
        uint256 expectedMerchantAmount = PAYMENT_AMOUNT - expectedFee;
        assertEq(mockToken.balanceOf(merchant) - merchantBalanceBefore, expectedMerchantAmount);
        assertEq(mockToken.balanceOf(treasury) - treasuryBalanceBefore, expectedFee);
    }

    // ============ Refund Tests ============

    function test_RefundPayment_FullAmount() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);

        uint256 payerBalanceBefore = payer.balance;

        vm.prank(transactionKey);
        escrow.refundPayment(paymentIntentId);

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Refunded));
        assertEq(payer.balance - payerBalanceBefore, 1 ether);
        assertEq(escrow.settleAmount(paymentIntentId), 0);
    }

    // ============ Dispute Tests ============

    function test_InitiateDispute() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);

        vm.prank(transactionKey);
        escrow.initiateDispute(paymentIntentId);

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Disputed));
    }

    function test_InitiateDispute_NotAuthorized() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);

        vm.prank(merchant);
        vm.expectRevert("Not authorized");
        escrow.initiateDispute(paymentIntentId);
    }

    function test_InitiateDispute_TimelockExpired() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);

        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(transactionKey);
        vm.expectRevert("Too late");
        escrow.initiateDispute(paymentIntentId);
    }

    function test_ResolveDispute_MerchantWins() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);

        vm.prank(transactionKey);
        escrow.initiateDispute(paymentIntentId);

        uint256 merchantBalanceBefore = merchant.balance;
        uint256 treasuryBalanceBefore = treasury.balance;

        vm.prank(transactionKey);
        escrow.resolveDispute(paymentIntentId, merchant);

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Settled));

        // 2% of 1 ether: 0.02 ether fee, 0.98 ether to merchant
        assertEq(merchant.balance - merchantBalanceBefore, 0.98 ether);
        assertEq(treasury.balance - treasuryBalanceBefore, 0.02 ether);
    }

    function test_ResolveDispute_PayerWins() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);

        vm.prank(transactionKey);
        escrow.initiateDispute(paymentIntentId);

        uint256 payerBalanceBefore = payer.balance;
        uint256 treasuryBalanceBefore = treasury.balance;

        vm.prank(transactionKey);
        escrow.resolveDispute(paymentIntentId, payer);

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Refunded));
        assertEq(payer.balance - payerBalanceBefore, 1 ether);
        assertEq(treasury.balance - treasuryBalanceBefore, 0);
    }

    function test_ResolveDispute_InvalidWinner() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);

        vm.prank(transactionKey);
        escrow.initiateDispute(paymentIntentId);

        address randomAddress = makeAddr("random");
        vm.prank(transactionKey);
        vm.expectRevert("Invalid winner");
        escrow.resolveDispute(paymentIntentId, randomAddress);
    }

    // ============ Admin Tests ============

    function test_SetKeyRole() public {
        address newKey = makeAddr("newKey");
        _saSetKeyRole(escrow, newKey, INodeRailsEscrow.KeyRole.TransactionKey);
        assertEq(uint256(escrow.getKeyRole(newKey)), uint256(INodeRailsEscrow.KeyRole.TransactionKey));
    }

    function test_SetKeyRole_AdminCannotAddTransactionKey() public {
        address newKey = makeAddr("newKey");
        vm.prank(admin);
        vm.expectRevert("Admin can only revoke");
        escrow.setKeyRole(newKey, INodeRailsEscrow.KeyRole.TransactionKey);
    }

    function test_SetKeyRole_AdminCannotSetAdmin() public {
        address newKey = makeAddr("newKey");
        vm.prank(admin);
        vm.expectRevert("Admin can only revoke");
        escrow.setKeyRole(newKey, INodeRailsEscrow.KeyRole.Admin);
    }

    function test_Pause() public {
        vm.prank(superAdmin);
        escrow.pause();
        assertTrue(escrow.paused());
    }

    function test_Pause_AdminOrSigner() public {
        vm.prank(admin);
        escrow.pause();
        assertTrue(escrow.paused());
    }

    function test_Pause_OutsiderReverts() public {
        vm.prank(payer);
        vm.expectRevert("Not admin or super admin signer");
        escrow.pause();
    }

    function test_CaptureWhenPaused() public {
        vm.prank(superAdmin);
        escrow.pause();

        bytes32 paymentIntentId = keccak256("payment1");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        bytes memory signature = _signNativeCapture(
            paymentIntentId, merchant, 1 ether, DEFAULT_FEE_BPS, timelocks, transactionKeyPrivate
        );

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        escrow.captureNativePayment{value: 1 ether}(
            paymentIntentId, merchant, DEFAULT_FEE_BPS, timelocks, signature
        );
    }

    // ============ Timelock Tests ============

    function test_Timelocks() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);
        
        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        Timelocks t = payment.timelocks;

        assertEq(t.getCapturedAt(), block.timestamp);
        assertEq(t.get(TimelocksLib.Stage.DisputeStart), block.timestamp);
        assertEq(t.get(TimelocksLib.Stage.Settlement), block.timestamp + 7 days);
    }

    function test_DisputeWindowTiming() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);
        
        vm.prank(transactionKey);
        escrow.initiateDispute(paymentIntentId);
        
        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Disputed));
    }

    function test_SettlementTiming() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);
        
        vm.prank(transactionKey);
        vm.expectRevert("Too early");
        escrow.settlePayment(paymentIntentId);

        vm.warp(block.timestamp + 7 days + 1);
        
        vm.prank(transactionKey);
        escrow.settlePayment(paymentIntentId);
    }

    // ============ Fee Recipient Tests ============

    function test_SetFeeRecipient() public {
        address newTreasury = makeAddr("newTreasury");
        _saSetFeeRecipient(escrow, newTreasury);
        assertEq(escrow.feeRecipient(), newTreasury);
    }

    function test_SetFeeRecipient_RequiresProof() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(payer);
        vm.expectRevert("Need 3 signatures");
        escrow.setFeeRecipient(newTreasury, _emptyProof());
    }

    function test_SetFeeRecipient_InvalidAddress() public {
        vm.expectRevert("Invalid fee recipient");
        _saSetFeeRecipient(escrow, address(0));
    }

    function test_SettlePayment_AfterFeeRecipientChange() public {
        bytes32 paymentIntentId = _captureNativePayment(1 ether, DEFAULT_FEE_BPS, 7 days);

        address newTreasury = makeAddr("newTreasury");
        _saSetFeeRecipient(escrow, newTreasury);

        vm.warp(block.timestamp + 7 days + 1);

        uint256 newTreasuryBalanceBefore = newTreasury.balance;

        vm.prank(transactionKey);
        escrow.settlePayment(paymentIntentId);

        // 2% of 1 ether fee
        assertEq(newTreasury.balance - newTreasuryBalanceBefore, 0.02 ether);
    }

    // ============ Fee Arithmetic Tests ============

    function test_FeeSplit_200Bps() public {
        bytes32 paymentIntentId = _captureNativePayment(10 ether, 200, 7 days);
        vm.warp(block.timestamp + 7 days + 1);

        uint256 merchantBefore = merchant.balance;
        uint256 treasuryBefore = treasury.balance;

        vm.prank(transactionKey);
        escrow.settlePayment(paymentIntentId);

        assertEq(merchant.balance - merchantBefore, 9.8 ether);
        assertEq(treasury.balance - treasuryBefore, 0.2 ether);
    }

    function test_FeeSplit_MaxFee() public {
        bytes32 paymentIntentId = _captureNativePayment(10 ether, 1000, 7 days);
        vm.warp(block.timestamp + 7 days + 1);

        uint256 merchantBefore = merchant.balance;
        uint256 treasuryBefore = treasury.balance;

        vm.prank(transactionKey);
        escrow.settlePayment(paymentIntentId);

        assertEq(merchant.balance - merchantBefore, 9 ether);
        assertEq(treasury.balance - treasuryBefore, 1 ether);
    }

    function test_CaptureERC20_FeeOnTransferOff_RevertsOnHaircut() public {
        MockFeeOnTransferERC20 taxToken = new MockFeeOnTransferERC20(100);
        taxToken.mint(payer, PAYMENT_AMOUNT);
        bytes32 paymentIntentId = keccak256("fot-off");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        vm.prank(payer);
        taxToken.approve(address(escrow), PAYMENT_AMOUNT);
        bytes memory signature = _signERC20Capture(
            paymentIntentId, merchant, address(taxToken), PAYMENT_AMOUNT, payer, DEFAULT_FEE_BPS, timelocks, transactionKeyPrivate
        );
        INodeRailsEscrow.PermitData memory permitData = INodeRailsEscrow.PermitData({
            amount: 0, deadline: 0, v: 0, r: bytes32(0), s: bytes32(0)
        });
        vm.prank(transactionKey);
        vm.expectRevert("Transfer amount mismatch");
        escrow.captureERC20Payment(
            paymentIntentId, merchant, address(taxToken), PAYMENT_AMOUNT, payer, DEFAULT_FEE_BPS, timelocks, permitData, signature
        );
    }

    function test_CaptureERC20_FeeOnTransferOn_StoresReceived() public {
        MockFeeOnTransferERC20 taxToken = new MockFeeOnTransferERC20(100);
        taxToken.mint(payer, PAYMENT_AMOUNT);
        vm.prank(admin);
        escrow.setFeeOnTransferEnabled(true);

        bytes32 paymentIntentId = keccak256("fot-on");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        vm.prank(payer);
        taxToken.approve(address(escrow), PAYMENT_AMOUNT);
        bytes memory signature = _signERC20Capture(
            paymentIntentId, merchant, address(taxToken), PAYMENT_AMOUNT, payer, DEFAULT_FEE_BPS, timelocks, transactionKeyPrivate
        );
        INodeRailsEscrow.PermitData memory permitData = INodeRailsEscrow.PermitData({
            amount: 0, deadline: 0, v: 0, r: bytes32(0), s: bytes32(0)
        });
        vm.prank(transactionKey);
        escrow.captureERC20Payment(
            paymentIntentId, merchant, address(taxToken), PAYMENT_AMOUNT, payer, DEFAULT_FEE_BPS, timelocks, permitData, signature
        );

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        uint256 expected = PAYMENT_AMOUNT - (PAYMENT_AMOUNT * 100) / 10_000;
        assertEq(payment.amount, expected);
        assertEq(taxToken.balanceOf(address(escrow)), expected);
    }

    // ============ Helper Functions ============

    function _captureNativePayment(uint256 amount, uint16 feeBps, uint256 timelockDuration) internal returns (bytes32) {
        bytes32 paymentIntentId = keccak256(abi.encodePacked("payment", block.timestamp, amount, feeBps));
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, timelockDuration);
        
        bytes memory signature = _signNativeCapture(
            paymentIntentId, merchant, amount, feeBps, timelocks, transactionKeyPrivate
        );

        vm.prank(payer);
        escrow.captureNativePayment{value: amount}(
            paymentIntentId, merchant, feeBps, timelocks, signature
        );

        return paymentIntentId;
    }

    function _captureERC20Payment(uint256 amount, uint16 feeBps, uint256 timelockDuration) internal returns (bytes32) {
        bytes32 paymentIntentId = keccak256(abi.encodePacked("erc20payment", block.timestamp, amount, feeBps));
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, timelockDuration);

        vm.prank(payer);
        mockToken.approve(address(escrow), amount);

        bytes memory signature = _signERC20Capture(
            paymentIntentId, merchant, address(mockToken), amount, payer, feeBps, timelocks, transactionKeyPrivate
        );

        INodeRailsEscrow.PermitData memory permitData = INodeRailsEscrow.PermitData({
            amount: 0, deadline: 0, v: 0, r: bytes32(0), s: bytes32(0)
        });

        vm.prank(transactionKey);
        escrow.captureERC20Payment(
            paymentIntentId, merchant, address(mockToken), amount, payer, feeBps, timelocks, permitData, signature
        );

        return paymentIntentId;
    }

    function _signNativeCapture(
        bytes32 paymentIntentId,
        address _merchant,
        uint256 amount,
        uint16 feeBps,
        Timelocks timelocks,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 nonce = keccak256(abi.encodePacked(paymentIntentId, "native"));
        
        bytes32 structHash = keccak256(
            abi.encode(
                CAPTURE_NATIVE_TYPEHASH,
                paymentIntentId,
                _merchant,
                amount,
                feeBps,
                Timelocks.unwrap(timelocks),
                nonce
            )
        );
        
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signERC20Capture(
        bytes32 paymentIntentId,
        address _merchant,
        address token,
        uint256 amount,
        address _payer,
        uint16 feeBps,
        Timelocks timelocks,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 nonce = keccak256(abi.encodePacked(paymentIntentId, "erc20"));
        
        bytes32 structHash = keccak256(
            abi.encode(
                CAPTURE_ERC20_TYPEHASH,
                paymentIntentId,
                _merchant,
                token,
                amount,
                _payer,
                feeBps,
                Timelocks.unwrap(timelocks),
                nonce
            )
        );
        
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
