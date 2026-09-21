// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/NodeRailsMerchantManager.sol";
import "../src/interfaces/INodeRailsMerchantManager.sol";
import "./SuperAdminTestBase.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1_000_000 * 10**18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockERC20WithPermit is ERC20, ERC20Permit {
    constructor() ERC20("Permit Token", "PMOCK") ERC20Permit("Permit Token") {
        _mint(msg.sender, 1_000_000 * 10**18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract NodeRailsMerchantManagerTest is SuperAdminTestBase {
    NodeRailsMerchantManager public manager;
    MockERC20 public mockToken;

    address public superAdmin;
    uint256 public superAdminKey;

    address public admin;
    uint256 public adminKey;

    address public transactionKey;
    uint256 public transactionKeyPrivate;

    address public merchantWallet;
    uint256 public merchantWalletKey;

    address public recipient;
    address public recipient2;
    address public recipient3;
    address public feeRecipientAddr;
    address public unauthorized;

    uint256 public constant PAYOUT_AMOUNT = 100 * 10**18;
    uint16 public constant FEE_BPS = 100; // 1%

    bytes32 private constant AUTHORIZE_PAYOUTS_TYPEHASH = keccak256(
        "NodeRailsAuthorizePayouts(address merchantWallet,string purpose,uint256 validUntil)"
    );
    string private constant PAYOUT_AUTH_PURPOSE = "I authorize NodeRails to execute payouts from this wallet";

    // Payout: EIP-712 (matches contract — no nonce, payoutIntentId is the replay key)
    bytes32 private constant PAYOUT_TYPEHASH = keccak256(
        "Payout(bytes32 payoutIntentId,address merchantWallet,address recipient,address token,uint256 amount,uint16 feeBps)"
    );

    bytes32 private constant NATIVE_PAYOUT_TYPEHASH = keccak256(
        "NativePayout(bytes32 payoutIntentId,address merchantWallet,address recipient,uint256 amount,uint16 feeBps)"
    );

    bytes32 private constant BULK_PAYOUT_TYPEHASH = keccak256(
        "BulkPayout(bytes32 payoutIntentId,address merchantWallet,address token,bytes32 recipientsHash,bytes32 amountsHash,uint16 feeBps)"
    );

    bytes32 private constant BULK_NATIVE_PAYOUT_TYPEHASH = keccak256(
        "BulkNativePayout(bytes32 payoutIntentId,address merchantWallet,bytes32 recipientsHash,bytes32 amountsHash,uint16 feeBps)"
    );

    event PayoutExecuted(
        bytes32 indexed payoutIntentId,
        address indexed merchantWallet,
        address indexed recipient,
        address token,
        uint256 amount,
        uint256 fee
    );

    event NativePayoutExecuted(
        bytes32 indexed payoutIntentId,
        address indexed merchantWallet,
        address indexed recipient,
        uint256 amount,
        uint256 fee
    );

    event BulkPayoutCompleted(
        bytes32 indexed payoutIntentId,
        address indexed merchantWallet,
        address token,
        uint256 totalAmount,
        uint256 totalFee,
        uint256 count
    );

    event BulkNativePayoutCompleted(
        bytes32 indexed payoutIntentId,
        address indexed merchantWallet,
        uint256 totalAmount,
        uint256 totalFee,
        uint256 count
    );

    function setUp() public {
        _initSuperAdminSigners();
        superAdmin = sa[0];
        superAdminKey = saKey[0];
        (admin, adminKey) = makeAddrAndKey("admin");
        (transactionKey, transactionKeyPrivate) = makeAddrAndKey("transactionKey");
        (merchantWallet, merchantWalletKey) = makeAddrAndKey("merchantWallet");
        recipient = makeAddr("recipient");
        recipient2 = makeAddr("recipient2");
        recipient3 = makeAddr("recipient3");
        feeRecipientAddr = makeAddr("feeRecipient");
        unauthorized = makeAddr("unauthorized");

        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;
        manager = _newMM(initialAdmins, _one(transactionKey), feeRecipientAddr);

        mockToken = new MockERC20();
        mockToken.mint(merchantWallet, PAYOUT_AMOUNT * 100);

        vm.prank(merchantWallet);
        mockToken.approve(address(manager), type(uint256).max);

        vm.deal(address(this), 100 ether);
    }

    function test_Constructor() public view {
        assertEq(uint256(manager.getKeyRole(superAdmin)), uint256(INodeRailsMerchantManager.KeyRole.None));
        assertTrue(manager.isSuperAdminSigner(superAdmin));
        assertEq(uint256(manager.getKeyRole(admin)), uint256(INodeRailsMerchantManager.KeyRole.Admin));
        assertEq(manager.feeRecipient(), feeRecipientAddr);
        assertEq(uint256(manager.getKeyRole(transactionKey)), uint256(INodeRailsMerchantManager.KeyRole.TransactionKey));
    }

    function test_Constructor_ZeroSuperAdmin() public {
        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;
        address[5] memory bad;
        bad[0] = address(0);
        bad[1] = sa[1];
        bad[2] = sa[2];
        bad[3] = sa[3];
        bad[4] = sa[4];
        vm.expectRevert("Invalid super admin signer");
        new NodeRailsMerchantManager(bad, initialAdmins, _empty(), feeRecipientAddr);
    }

    function test_Constructor_ZeroFeeRecipient() public {
        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;
        vm.expectRevert("Zero address");
        new NodeRailsMerchantManager(_saSigners(), initialAdmins, _empty(), address(0));
    }

    // ============ Single ERC20 Payout Tests ============

    function test_ExecutePayout() public {
        bytes32 payoutIntentId = keccak256("payout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        uint256 expectedFee = (PAYOUT_AMOUNT * uint256(FEE_BPS)) / 10000;

        vm.expectEmit(true, true, true, true);
        emit PayoutExecuted(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, expectedFee);

        vm.prank(transactionKey);
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );

        assertEq(mockToken.balanceOf(recipient), PAYOUT_AMOUNT);
        assertEq(mockToken.balanceOf(feeRecipientAddr), expectedFee);
        assertTrue(manager.isPayoutExecuted(payoutIntentId));

        // Verify PayoutRecord
        INodeRailsMerchantManager.PayoutRecord memory record = manager.getPayoutRecord(payoutIntentId);
        assertEq(record.merchantWallet, merchantWallet);
        assertEq(record.totalAmount, PAYOUT_AMOUNT);
        assertTrue(record.executedAt > 0);
    }

    function test_ExecutePayout_SessionReusable() public {
        uint256 sessionExpiry = block.timestamp + 1 hours;
        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);

        // First payout
        bytes32 id1 = keccak256("p1");
        bytes memory sig1 = _signPayout(id1, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        vm.prank(transactionKey);
        manager.executePayout(
            id1, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, sig1
        );

        // Second payout with SAME session
        bytes32 id2 = keccak256("p2");
        bytes memory sig2 = _signPayout(id2, merchantWallet, recipient2, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        vm.prank(transactionKey);
        manager.executePayout(
            id2, merchantWallet, recipient2, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, sig2
        );

        assertEq(mockToken.balanceOf(recipient), PAYOUT_AMOUNT);
        assertEq(mockToken.balanceOf(recipient2), PAYOUT_AMOUNT);
    }

    function test_ExecutePayout_PayoutIntentIdReplay() public {
        bytes32 payoutIntentId = keccak256("payout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        vm.prank(transactionKey);
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );

        vm.prank(transactionKey);
        vm.expectRevert("Payout already executed");
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );
    }

    function test_ExecutePayout_SessionExpired() public {
        bytes32 payoutIntentId = keccak256("payout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(transactionKey);
        vm.expectRevert("Session expired");
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );
    }

    function test_ExecutePayout_InvalidMerchantSignature() public {
        bytes32 payoutIntentId = keccak256("payout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        // Sign session with wrong key
        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, adminKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        vm.prank(transactionKey);
        vm.expectRevert("Invalid merchant signature");
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );
    }

    function test_ExecutePayout_InvalidPlatformSignature() public {
        bytes32 payoutIntentId = keccak256("payout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        // Sign noderails with unauthorized key
        bytes memory noderailsSig = _signPayoutWithKey(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS, merchantWalletKey);

        vm.prank(transactionKey);
        vm.expectRevert("Invalid platform signature");
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );
    }

    function test_ExecutePayout_RejectsAdminPlatformSignature() public {
        bytes32 payoutIntentId = keccak256("payout-admin-sig");
        uint256 sessionExpiry = block.timestamp + 1 hours;
        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayoutWithKey(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS, adminKey
        );
        vm.prank(transactionKey);
        vm.expectRevert("Invalid platform signature");
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );
    }

    function test_ExecutePayout_UnauthorizedCallerReverts() public {
        bytes32 payoutIntentId = keccak256("payout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        // Call from an address with no role — should revert
        vm.prank(unauthorized);
        vm.expectRevert("Not transaction key");
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );
    }

    function test_ExecutePayout_AdminCanCall() public {
        bytes32 payoutIntentId = keccak256("adminPayout");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        // Admin is also authorized to call payout functions
        vm.prank(admin);
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );

        assertTrue(manager.isPayoutExecuted(payoutIntentId));
    }

    function test_ExecutePayout_FeeTooHigh() public {
        bytes32 payoutIntentId = keccak256("payout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;
        uint16 badFeeBps = 1001;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, badFeeBps);

        vm.prank(transactionKey);
        vm.expectRevert("Fee too high");
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            badFeeBps, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );
    }

    // ============ Single Native Payout Tests ============

    function test_ExecuteNativePayout() public {
        bytes32 payoutIntentId = keccak256("nativePayout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;
        uint256 amount = 1 ether;

        uint256 expectedFee = (amount * uint256(FEE_BPS)) / 10000;
        uint256 totalRequired = amount + expectedFee;

        // Deposit ETH for merchant (amount + fee)
        manager.depositETH{value: totalRequired}(merchantWallet);

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signNativePayout(payoutIntentId, merchantWallet, recipient, amount, FEE_BPS);

        uint256 recipientBalanceBefore = recipient.balance;

        vm.expectEmit(true, true, true, true);
        emit NativePayoutExecuted(payoutIntentId, merchantWallet, recipient, amount, expectedFee);

        vm.prank(transactionKey);
        manager.executeNativePayout(
            payoutIntentId, merchantWallet, recipient, amount, FEE_BPS, sessionExpiry, merchantSig, noderailsSig
        );

        assertEq(recipient.balance - recipientBalanceBefore, amount);
        assertEq(feeRecipientAddr.balance, expectedFee);
        assertEq(manager.merchantETHBalance(merchantWallet), 0);
    }

    function test_ExecuteNativePayout_InsufficientBalance() public {
        bytes32 payoutIntentId = keccak256("nativePayout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        // No deposit — balance is 0
        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signNativePayout(payoutIntentId, merchantWallet, recipient, 1 ether, FEE_BPS);

        vm.prank(transactionKey);
        vm.expectRevert("Insufficient ETH balance");
        manager.executeNativePayout(
            payoutIntentId, merchantWallet, recipient, 1 ether, FEE_BPS, sessionExpiry, merchantSig, noderailsSig
        );
    }

    // ============ Bulk ERC20 Payout Tests ============

    function test_ExecuteBulkPayout() public {
        bytes32 payoutIntentId = keccak256("bulk1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        address[] memory recipients_ = new address[](3);
        recipients_[0] = recipient;
        recipients_[1] = recipient2;
        recipients_[2] = recipient3;

        uint256[] memory amounts_ = new uint256[](3);
        amounts_[0] = 50 * 10**18;
        amounts_[1] = 30 * 10**18;
        amounts_[2] = 20 * 10**18;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signBulkPayout(payoutIntentId, merchantWallet, address(mockToken), recipients_, amounts_, FEE_BPS);

        vm.prank(transactionKey);
        manager.executeBulkPayout(
            payoutIntentId, merchantWallet, address(mockToken), recipients_, amounts_,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );

        // Verify each recipient got full amount (fee is on top)
        for (uint256 i = 0; i < recipients_.length; i++) {
            assertEq(mockToken.balanceOf(recipients_[i]), amounts_[i]);
        }

        assertTrue(manager.isPayoutExecuted(payoutIntentId));
    }

    function test_ExecuteBulkPayout_LengthMismatch() public {
        bytes32 payoutIntentId = keccak256("bulk1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        address[] memory recipients_ = new address[](2);
        recipients_[0] = recipient;
        recipients_[1] = recipient2;

        uint256[] memory amounts_ = new uint256[](1);
        amounts_[0] = 50 * 10**18;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signBulkPayout(payoutIntentId, merchantWallet, address(mockToken), recipients_, amounts_, FEE_BPS);

        vm.prank(transactionKey);
        vm.expectRevert("Length mismatch");
        manager.executeBulkPayout(
            payoutIntentId, merchantWallet, address(mockToken), recipients_, amounts_,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );
    }

    // ============ Bulk Native Payout Tests ============

    function test_ExecuteBulkNativePayout() public {
        bytes32 payoutIntentId = keccak256("bulkNative1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        address[] memory recipients_ = new address[](2);
        recipients_[0] = recipient;
        recipients_[1] = recipient2;

        uint256[] memory amounts_ = new uint256[](2);
        amounts_[0] = 1 ether;
        amounts_[1] = 2 ether;

        uint256 totalAmount = 3 ether;
        uint256 fee1 = (1 ether * uint256(FEE_BPS)) / 10000;
        uint256 fee2 = (2 ether * uint256(FEE_BPS)) / 10000;
        uint256 totalFee = fee1 + fee2;

        // Deposit ETH for merchant (amounts + fees)
        manager.depositETH{value: totalAmount + totalFee}(merchantWallet);

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signBulkNativePayout(payoutIntentId, merchantWallet, recipients_, amounts_, FEE_BPS);

        vm.prank(transactionKey);
        manager.executeBulkNativePayout(
            payoutIntentId, merchantWallet, recipients_, amounts_,
            FEE_BPS, sessionExpiry, merchantSig, noderailsSig
        );

        // Recipients get full amounts, fee is on top
        assertEq(recipient.balance, 1 ether);
        assertEq(recipient2.balance, 2 ether);
        assertEq(feeRecipientAddr.balance, totalFee);
        assertEq(manager.merchantETHBalance(merchantWallet), 0);
    }

    function test_ExecuteBulkNativePayout_InsufficientBalance() public {
        bytes32 payoutIntentId = keccak256("bulkNative1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        address[] memory recipients_ = new address[](2);
        recipients_[0] = recipient;
        recipients_[1] = recipient2;

        uint256[] memory amounts_ = new uint256[](2);
        amounts_[0] = 1 ether;
        amounts_[1] = 2 ether;

        // Only deposit 2 ETH instead of 3
        manager.depositETH{value: 2 ether}(merchantWallet);

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signBulkNativePayout(payoutIntentId, merchantWallet, recipients_, amounts_, FEE_BPS);

        vm.prank(transactionKey);
        vm.expectRevert("Insufficient ETH balance");
        manager.executeBulkNativePayout(
            payoutIntentId, merchantWallet, recipients_, amounts_,
            FEE_BPS, sessionExpiry, merchantSig, noderailsSig
        );
    }

    // ============ ETH Deposit / Withdraw Tests ============

    function test_DepositETH() public {
        manager.depositETH{value: 5 ether}(merchantWallet);
        assertEq(manager.merchantETHBalance(merchantWallet), 5 ether);
    }

    function test_DepositETH_Multiple() public {
        manager.depositETH{value: 3 ether}(merchantWallet);
        manager.depositETH{value: 2 ether}(merchantWallet);
        assertEq(manager.merchantETHBalance(merchantWallet), 5 ether);
    }

    function test_DepositETH_ZeroAddress() public {
        vm.expectRevert("Zero address");
        manager.depositETH{value: 1 ether}(address(0));
    }

    function test_DepositETH_ZeroAmount() public {
        vm.expectRevert("Zero deposit");
        manager.depositETH{value: 0}(merchantWallet);
    }

    function test_WithdrawETH_ByMerchant() public {
        manager.depositETH{value: 5 ether}(merchantWallet);

        uint256 balanceBefore = merchantWallet.balance;
        vm.prank(merchantWallet);
        manager.withdrawETH(merchantWallet, 3 ether);

        assertEq(manager.merchantETHBalance(merchantWallet), 2 ether);
        assertEq(merchantWallet.balance - balanceBefore, 3 ether);
    }

    function test_WithdrawETH_ByTransactionKey() public {
        manager.depositETH{value: 5 ether}(merchantWallet);

        uint256 balanceBefore = merchantWallet.balance;
        // Transaction key can call withdrawETH on behalf of merchant — ETH goes to merchant
        vm.prank(transactionKey);
        manager.withdrawETH(merchantWallet, 3 ether);

        assertEq(manager.merchantETHBalance(merchantWallet), 2 ether);
        assertEq(merchantWallet.balance - balanceBefore, 3 ether);
    }

    function test_WithdrawETH_UnauthorizedReverts() public {
        manager.depositETH{value: 5 ether}(merchantWallet);

        vm.prank(unauthorized);
        vm.expectRevert("Not authorized");
        manager.withdrawETH(merchantWallet, 1 ether);
    }

    function test_WithdrawETH_InsufficientBalance() public {
        manager.depositETH{value: 1 ether}(merchantWallet);

        vm.prank(merchantWallet);
        vm.expectRevert("Insufficient balance");
        manager.withdrawETH(merchantWallet, 2 ether);
    }

    function test_WithdrawETH_BlockedDuringFullStop() public {
        manager.depositETH{value: 5 ether}(merchantWallet);

        vm.prank(admin);
        manager.fullStop();

        vm.prank(merchantWallet);
        vm.expectRevert("Full stop active");
        manager.withdrawETH(merchantWallet, 1 ether);
    }

    function test_WithdrawETH_BlockedDuringPause() public {
        manager.depositETH{value: 5 ether}(merchantWallet);

        vm.prank(admin);
        manager.pause();

        vm.prank(merchantWallet);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        manager.withdrawETH(merchantWallet, 1 ether);
    }

    // ============ Permit Tests ============

    function test_ExecutePayout_WithPermit() public {
        MockERC20WithPermit permitToken = new MockERC20WithPermit();
        uint256 expectedFee = (PAYOUT_AMOUNT * uint256(FEE_BPS)) / 10000;
        uint256 totalNeeded = PAYOUT_AMOUNT + expectedFee;
        permitToken.mint(merchantWallet, totalNeeded);

        // NO prior approval — permit will handle it
        bytes32 payoutIntentId = keccak256("permitPayout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;
        uint256 permitDeadline = block.timestamp + 1 hours;

        INodeRailsMerchantManager.PermitData memory permit = _signPermit(
            address(permitToken), merchantWallet, address(manager), totalNeeded, permitDeadline, merchantWalletKey
        );

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(permitToken), PAYOUT_AMOUNT, FEE_BPS);

        vm.prank(transactionKey);
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(permitToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, permit, merchantSig, noderailsSig
        );

        assertEq(permitToken.balanceOf(recipient), PAYOUT_AMOUNT);
        assertEq(permitToken.balanceOf(feeRecipientAddr), expectedFee);
    }

    function test_ExecuteBulkPayout_WithPermit() public {
        MockERC20WithPermit permitToken = new MockERC20WithPermit();
        uint256 totalAmount = 80 * 10**18;
        uint256 totalFee = (totalAmount * uint256(FEE_BPS)) / 10000;
        permitToken.mint(merchantWallet, totalAmount + totalFee);

        // NO prior approval
        bytes32 payoutIntentId = keccak256("permitBulk1");
        uint256 sessionExpiry = block.timestamp + 1 hours;
        uint256 permitDeadline = block.timestamp + 1 hours;

        address[] memory recipients_ = new address[](2);
        recipients_[0] = recipient;
        recipients_[1] = recipient2;

        uint256[] memory amounts_ = new uint256[](2);
        amounts_[0] = 50 * 10**18;
        amounts_[1] = 30 * 10**18;

        // Permit for total amount + fees
        INodeRailsMerchantManager.PermitData memory permit = _signPermit(
            address(permitToken), merchantWallet, address(manager), totalAmount + totalFee, permitDeadline, merchantWalletKey
        );

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signBulkPayout(payoutIntentId, merchantWallet, address(permitToken), recipients_, amounts_, FEE_BPS);

        vm.prank(transactionKey);
        manager.executeBulkPayout(
            payoutIntentId, merchantWallet, address(permitToken), recipients_, amounts_,
            FEE_BPS, sessionExpiry, permit, merchantSig, noderailsSig
        );

        for (uint256 i = 0; i < recipients_.length; i++) {
            assertEq(permitToken.balanceOf(recipients_[i]), amounts_[i]);
        }
    }

    function test_ExecutePayout_PermitIgnoredWhenAlreadyApproved() public {
        // Merchant has already approved via tx — empty permit should work fine
        bytes32 payoutIntentId = keccak256("alreadyApproved");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        vm.prank(transactionKey);
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );

        assertEq(mockToken.balanceOf(recipient), PAYOUT_AMOUNT);
    }

    function test_ExecutePayout_PermitFailsSilently_WhenTokenDoesNotSupportPermit() public {
        MockERC20 nonPermitToken = new MockERC20();
        uint256 fee = (PAYOUT_AMOUNT * uint256(FEE_BPS)) / 10000;
        nonPermitToken.mint(merchantWallet, PAYOUT_AMOUNT + fee);

        vm.prank(merchantWallet);
        nonPermitToken.approve(address(manager), type(uint256).max);

        bytes32 payoutIntentId = keccak256("nonPermitToken");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(nonPermitToken), PAYOUT_AMOUNT, FEE_BPS);

        // Pass a fake permit with deadline > 0 — should fail silently
        INodeRailsMerchantManager.PermitData memory fakePermit = INodeRailsMerchantManager.PermitData({
            amount: PAYOUT_AMOUNT,
            deadline: block.timestamp + 1 hours,
            v: 27,
            r: bytes32(uint256(1)),
            s: bytes32(uint256(2))
        });

        vm.prank(transactionKey);
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(nonPermitToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, fakePermit, merchantSig, noderailsSig
        );

        assertEq(nonPermitToken.balanceOf(recipient), PAYOUT_AMOUNT);
    }

    // ============ FullStop Tests ============

    function test_FullStop() public {
        vm.prank(admin);
        manager.fullStop();

        assertTrue(manager.isFullStopped());
    }

    function test_FullStop_BlocksPayouts() public {
        vm.prank(admin);
        manager.fullStop();

        bytes32 payoutIntentId = keccak256("payout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        vm.prank(transactionKey);
        vm.expectRevert("Full stop active");
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );
    }

    function test_LiftFullStop() public {
        vm.prank(admin);
        manager.fullStop();
        assertTrue(manager.isFullStopped());
        _saLift(manager);
        assertFalse(manager.isFullStopped());
    }

    function test_EmergencyWithdraw_RequiresFullStop() public {
        address[] memory tokens = new address[](1);
        tokens[0] = address(mockToken);
        vm.expectRevert("Not full stopped");
        _saInitiateEmergency(manager, tokens, merchantWallet);
    }

    function test_EmergencyWithdraw_ERC20AfterDelay() public {
        mockToken.mint(address(manager), 100 * 10**18);
        address rescue = makeAddr("rescue");
        address[] memory tokens = new address[](1);
        tokens[0] = address(mockToken);

        vm.prank(admin);
        manager.fullStop();
        _saInitiateEmergency(manager, tokens, rescue);
        vm.warp(block.timestamp + 24 hours);
        _saExecuteEmergency(manager);

        assertEq(mockToken.balanceOf(rescue), 100 * 10**18);
        assertEq(mockToken.balanceOf(address(manager)), 0);
    }

    function test_EmergencyWithdraw_NativeETH() public {
        manager.depositETH{value: 5 ether}(merchantWallet);
        address rescue = makeAddr("rescue");
        address[] memory tokens = new address[](0);

        vm.prank(admin);
        manager.fullStop();
        _saInitiateEmergency(manager, tokens, rescue);
        vm.warp(block.timestamp + 24 hours);
        _saExecuteEmergency(manager);

        assertEq(rescue.balance, 5 ether);
        assertEq(address(manager).balance, 0);
    }

    function test_EmergencyWithdraw_SweepsEntireNativeBalance() public {
        manager.depositETH{value: 10 ether}(merchantWallet);
        address merchantB = makeAddr("merchantB");
        manager.depositETH{value: 5 ether}(merchantB);
        address rescue = makeAddr("rescue");
        address[] memory tokens = new address[](0);

        vm.prank(admin);
        manager.fullStop();
        _saInitiateEmergency(manager, tokens, rescue);
        vm.warp(block.timestamp + 24 hours);
        _saExecuteEmergency(manager);
        _saLift(manager);

        assertEq(rescue.balance, 15 ether);
        vm.prank(merchantB);
        vm.expectRevert("ETH transfer failed");
        manager.withdrawETH(merchantB, 5 ether);
    }

    function test_EmergencyWithdraw_ZeroRecipientReverts() public {
        vm.prank(admin);
        manager.fullStop();
        address[] memory tokens = new address[](0);
        vm.expectRevert("Invalid recipient");
        _saInitiateEmergency(manager, tokens, address(0));
    }

    function test_DepositETH_BlockedDuringPause() public {
        vm.prank(admin);
        manager.pause();
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        manager.depositETH{value: 1 ether}(merchantWallet);
    }

    function test_RotateSuperAdmin_DuringFullStop() public {
        address next = makeAddr("nextSignerDuringHalt");
        vm.prank(admin);
        manager.fullStop();
        _saRotate(manager, 4, next);
        assertEq(manager.superAdminSigner(4), next);
    }

    // ============ Admin Tests ============

    function test_SetFeeRecipient() public {
        address newFeeRecipient = makeAddr("newFeeRecipient");
        _saSetFeeRecipient(manager, newFeeRecipient);
        assertEq(manager.feeRecipient(), newFeeRecipient);
    }

    function test_SetKeyRole_RevokeBlocksAccess() public {
        vm.prank(admin);
        manager.setKeyRole(transactionKey, INodeRailsMerchantManager.KeyRole.None);

        assertEq(uint256(manager.getKeyRole(transactionKey)), uint256(INodeRailsMerchantManager.KeyRole.None));

        bytes32 payoutIntentId = keccak256("revokedPayout");
        uint256 sessionExpiry = block.timestamp + 1 hours;
        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        vm.prank(transactionKey);
        vm.expectRevert("Not transaction key");
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );
    }

    function test_SetKeyRole_CannotModifySuperAdminSigner() public {
        vm.prank(admin);
        vm.expectRevert("Admin can only revoke TX keys");
        manager.setKeyRole(superAdmin, INodeRailsMerchantManager.KeyRole.None);
    }

    function test_SetKeyRole_AdminCannotAddTransactionKey() public {
        vm.prank(admin);
        vm.expectRevert("Admin can only revoke");
        manager.setKeyRole(recipient, INodeRailsMerchantManager.KeyRole.TransactionKey);
    }

    function test_Pause_BlocksPayouts() public {
        vm.prank(admin);
        manager.pause();

        assertTrue(manager.paused());

        bytes32 payoutIntentId = keccak256("payout1");
        uint256 sessionExpiry = block.timestamp + 1 hours;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, FEE_BPS);

        vm.prank(transactionKey);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            FEE_BPS, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );
    }

    function test_ZeroFeeBps_NoFeeDeducted() public {
        bytes32 payoutIntentId = keccak256("zeroFee");
        uint256 sessionExpiry = block.timestamp + 1 hours;
        uint16 zeroFee = 0;

        bytes memory merchantSig = _signSession(merchantWallet, sessionExpiry, merchantWalletKey);
        bytes memory noderailsSig = _signPayout(payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT, zeroFee);

        vm.prank(transactionKey);
        manager.executePayout(
            payoutIntentId, merchantWallet, recipient, address(mockToken), PAYOUT_AMOUNT,
            zeroFee, sessionExpiry, _emptyPermit(), merchantSig, noderailsSig
        );

        assertEq(mockToken.balanceOf(recipient), PAYOUT_AMOUNT);
        assertEq(mockToken.balanceOf(feeRecipientAddr), 0);
    }

    // ============ Helper Functions ============

    function _emptyPermit() internal pure returns (INodeRailsMerchantManager.PermitData memory) {
        return INodeRailsMerchantManager.PermitData(0, 0, 0, bytes32(0), bytes32(0));
    }

    function _signPermit(
        address token,
        address owner,
        address spender,
        uint256 amount,
        uint256 deadline,
        uint256 privateKey
    ) internal view returns (INodeRailsMerchantManager.PermitData memory) {
        bytes32 PERMIT_TYPEHASH = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
        uint256 nonces = ERC20Permit(token).nonces(owner);
        bytes32 domainSep = ERC20Permit(token).DOMAIN_SEPARATOR();

        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, amount, nonces, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return INodeRailsMerchantManager.PermitData(amount, deadline, v, r, s);
    }

    function _signSession(
        address _merchantWallet,
        uint256 sessionExpiry,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                AUTHORIZE_PAYOUTS_TYPEHASH,
                _merchantWallet,
                keccak256(bytes(PAYOUT_AUTH_PURPOSE)),
                sessionExpiry
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", manager.payoutAuthDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signPayout(
        bytes32 payoutIntentId,
        address _merchantWallet,
        address _recipient,
        address token,
        uint256 amount,
        uint16 feeBps
    ) internal view returns (bytes memory) {
        return _signPayoutWithKey(payoutIntentId, _merchantWallet, _recipient, token, amount, feeBps, transactionKeyPrivate);
    }

    function _signPayoutWithKey(
        bytes32 payoutIntentId,
        address _merchantWallet,
        address _recipient,
        address token,
        uint256 amount,
        uint16 feeBps,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            PAYOUT_TYPEHASH, payoutIntentId, _merchantWallet, _recipient, token, amount, feeBps
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", manager.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signNativePayout(
        bytes32 payoutIntentId,
        address _merchantWallet,
        address _recipient,
        uint256 amount,
        uint16 feeBps
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            NATIVE_PAYOUT_TYPEHASH, payoutIntentId, _merchantWallet, _recipient, amount, feeBps
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", manager.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(transactionKeyPrivate, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signBulkPayout(
        bytes32 payoutIntentId,
        address _merchantWallet,
        address token,
        address[] memory recipients_,
        uint256[] memory amounts_,
        uint16 feeBps
    ) internal view returns (bytes memory) {
        bytes32 recipientsHash = keccak256(abi.encodePacked(recipients_));
        bytes32 amountsHash = keccak256(abi.encodePacked(amounts_));
        bytes32 structHash = keccak256(abi.encode(
            BULK_PAYOUT_TYPEHASH, payoutIntentId, _merchantWallet, token, recipientsHash, amountsHash, feeBps
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", manager.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(transactionKeyPrivate, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signBulkNativePayout(
        bytes32 payoutIntentId,
        address _merchantWallet,
        address[] memory recipients_,
        uint256[] memory amounts_,
        uint16 feeBps
    ) internal view returns (bytes memory) {
        bytes32 recipientsHash = keccak256(abi.encodePacked(recipients_));
        bytes32 amountsHash = keccak256(abi.encodePacked(amounts_));
        bytes32 structHash = keccak256(abi.encode(
            BULK_NATIVE_PAYOUT_TYPEHASH, payoutIntentId, _merchantWallet, recipientsHash, amountsHash, feeBps
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", manager.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(transactionKeyPrivate, digest);
        return abi.encodePacked(r, s, v);
    }
}