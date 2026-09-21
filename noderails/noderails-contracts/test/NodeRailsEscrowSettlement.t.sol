// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/NodeRailsEscrow.sol";
import "../src/interfaces/INodeRailsEscrow.sol";
import "../src/libraries/TimelocksLib.sol";
import "./SuperAdminTestBase.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockSwapRouter {
    function swap(address src, address dst, uint256 amountIn, uint256 amountOut) external payable {
        if (src != address(0)) {
            IERC20(src).transferFrom(msg.sender, address(this), amountIn);
        } else {
            require(msg.value == amountIn, "native mismatch");
        }
        MockERC20(dst).mint(msg.sender, amountOut);
    }
}

contract MockBridgeRouter {
    address public lastRecipient;
    uint256 public lastAmount;

    function bridge(address token, uint256 amount, address recipient) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        lastRecipient = recipient;
        lastAmount = amount;
    }
}

contract MockFailingBridgeRouter {
    function bridge(address token, uint256 amount, address) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        revert("bridge failed");
    }
}

contract NodeRailsEscrowSettlementTest is SuperAdminTestBase {
    NodeRailsEscrow public escrow;
    MockERC20 public sourceToken;
    MockERC20 public stablecoin;
    MockSwapRouter public swapRouter;
    MockBridgeRouter public bridgeRouter;
    MockFailingBridgeRouter public failingBridgeRouter;

    address public superAdmin;
    uint256 public superAdminKey;
    address public admin;
    address public transactionKey;
    uint256 public transactionKeyPrivate;
    address public merchant;
    uint256 public merchantKey;
    address public payer;
    address public treasury;
    address public bloxfiDeposit;

    uint256 public constant AMOUNT_IN = 100 * 10**18;
    uint256 public constant AMOUNT_OUT = 99 * 10**18;
    uint16 public constant FEE_BPS = 200;

    bytes32 private constant CAPTURE_AND_CONVERT_TYPEHASH = keccak256(
        "CaptureAndConvert(bytes32 paymentIntentId,address merchant,address sourceToken,uint256 amountIn,address settlementToken,uint256 minAmountOut,address router,bytes32 swapCalldataHash,uint16 feeBps,uint256 timelocks,uint256 nonce)"
    );
    bytes32 private constant SETTLE_TO_MERCHANT_BALANCE_TYPEHASH = keccak256(
        "SettleToMerchantBalance(bytes32 paymentIntentId,uint256 merchantAmount,address token,uint256 settlementChainId,address settlementEscrow,address router,bytes32 bridgeCalldataHash,uint256 minDestinationAmount,address destination)"
    );
    bytes32 private constant CREDIT_MERCHANT_BALANCE_TYPEHASH = keccak256(
        "CreditMerchantBalance(bytes32 paymentIntentId,address merchant,address token,uint256 minAmount,address destination)"
    );
    bytes32 private constant RETRY_SETTLE_TO_MERCHANT_BALANCE_TYPEHASH = keccak256(
        "RetrySettleToMerchantBalance(bytes32 paymentIntentId,uint256 merchantAmount,address token,uint256 settlementChainId,address settlementEscrow,address router,bytes32 bridgeCalldataHash,uint256 minDestinationAmount,address destination,uint256 retryNonce)"
    );
    bytes32 private constant SETTLE_TO_BANK_TYPEHASH = keccak256(
        "SettleToBank(bytes32 paymentIntentId,address merchant,address token,uint256 amount,address depositAddress,bytes32 bankSettlementId)"
    );
    bytes32 private constant WITHDRAW_SETTLEMENT_BALANCE_TYPEHASH = keccak256(
        "WithdrawSettlementBalance(address merchant,address token,uint256 amount,address destination,bytes32 withdrawId)"
    );
    bytes32 private constant AUTHORIZE_BANK_SETTLEMENT_TYPEHASH = keccak256(
        "NodeRailsAuthorizeBankSettlement(address merchantWallet,string purpose,uint256 validUntil)"
    );
    string private constant BANK_AUTH_PURPOSE =
        "I authorize NodeRails to execute bank settlements and withdrawals from this wallet";

    function setUp() public {
        _initSuperAdminSigners();
        superAdmin = sa[0];
        superAdminKey = saKey[0];
        (admin,) = makeAddrAndKey("admin");
        (transactionKey, transactionKeyPrivate) = makeAddrAndKey("transactionKey");
        (merchant, merchantKey) = makeAddrAndKey("merchant");
        payer = makeAddr("payer");
        treasury = makeAddr("treasury");
        bloxfiDeposit = makeAddr("bloxfiDeposit");

        address[] memory initialAdmins = new address[](1);
        initialAdmins[0] = admin;

        escrow = _newEscrow(initialAdmins, _one(transactionKey), treasury);

        sourceToken = new MockERC20("Source", "SRC");
        stablecoin = new MockERC20("USD Coin", "USDC");
        swapRouter = new MockSwapRouter();
        bridgeRouter = new MockBridgeRouter();
        failingBridgeRouter = new MockFailingBridgeRouter();

        sourceToken.mint(payer, AMOUNT_IN * 10);
        vm.deal(payer, 100 ether);

        _saSetSwapRouter(escrow, address(swapRouter), true);
        _saSetBridgeRouter(escrow, address(bridgeRouter), true);
        _adminSetSettlementToken(escrow, admin, address(stablecoin), true);
    }

    function test_CaptureAndConvert_ERC20() public {
        bytes32 paymentIntentId = keccak256("convert1");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        bytes memory swapCalldata = abi.encodeWithSelector(
            MockSwapRouter.swap.selector, address(sourceToken), address(stablecoin), AMOUNT_IN, AMOUNT_OUT
        );

        vm.prank(payer);
        sourceToken.approve(address(escrow), AMOUNT_IN);

        bytes memory sig = _signConvert(paymentIntentId, merchant, address(sourceToken), AMOUNT_IN, address(stablecoin), AMOUNT_OUT, address(swapRouter), keccak256(swapCalldata), FEE_BPS, timelocks, keccak256(abi.encodePacked(paymentIntentId, "erc20")));
        vm.prank(transactionKey);
        escrow.captureAndConvert(
            paymentIntentId,
            merchant,
            address(sourceToken),
            AMOUNT_IN,
            address(stablecoin),
            AMOUNT_OUT,
            address(swapRouter),
            keccak256(swapCalldata),
            FEE_BPS,
            timelocks,
            _emptyPermit(),
            payer,
            swapCalldata,
            sig
        );

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(payment.token, address(stablecoin));
        assertEq(payment.amount, AMOUNT_OUT);
        assertEq(escrow.settleAmount(paymentIntentId), AMOUNT_OUT);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Captured));
        (address recStable,, bool converted) = escrow.conversionRecords(paymentIntentId);
        assertTrue(converted);
        assertEq(recStable, address(stablecoin));
        assertEq(stablecoin.balanceOf(address(escrow)), AMOUNT_OUT);
        assertEq(sourceToken.allowance(address(escrow), address(swapRouter)), 0);
    }

    function test_CaptureNativeAndConvert() public {
        bytes32 paymentIntentId = keccak256("convert-native");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        uint256 value = 1 ether;
        bytes memory swapCalldata = abi.encodeWithSelector(
            MockSwapRouter.swap.selector, address(0), address(stablecoin), value, AMOUNT_OUT
        );

        bytes memory sig = _signConvert(paymentIntentId, merchant, address(0), value, address(stablecoin), AMOUNT_OUT, address(swapRouter), keccak256(swapCalldata), FEE_BPS, timelocks, keccak256(abi.encodePacked(paymentIntentId, "native")));
        vm.prank(payer);
        escrow.captureNativeAndConvert{value: value}(
            paymentIntentId,
            merchant,
            address(stablecoin),
            AMOUNT_OUT,
            address(swapRouter),
            keccak256(swapCalldata),
            FEE_BPS,
            timelocks,
            swapCalldata,
            sig
        );

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(payment.token, address(stablecoin));
        assertEq(payment.amount, AMOUNT_OUT);
        assertEq(payment.payer, payer);
    }

    function test_CaptureAndConvert_RevertsUnknownRouter() public {
        bytes32 paymentIntentId = keccak256("bad-router");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        address rogue = makeAddr("rogue");
        bytes memory swapCalldata = hex"1234";

        vm.prank(payer);
        sourceToken.approve(address(escrow), AMOUNT_IN);

        vm.prank(transactionKey);
        vm.expectRevert("Router not allowed");
        escrow.captureAndConvert(
            paymentIntentId, merchant, address(sourceToken), AMOUNT_IN, address(stablecoin), AMOUNT_OUT,
            rogue, keccak256(swapCalldata), FEE_BPS, timelocks, _emptyPermit(), payer, swapCalldata, hex""
        );
    }

    function test_CaptureAndConvert_RevertsCalldataMismatch() public {
        bytes32 paymentIntentId = keccak256("bad-data");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        bytes memory swapCalldata = hex"1234";

        vm.prank(payer);
        sourceToken.approve(address(escrow), AMOUNT_IN);

        vm.prank(transactionKey);
        vm.expectRevert("Calldata mismatch");
        escrow.captureAndConvert(
            paymentIntentId, merchant, address(sourceToken), AMOUNT_IN, address(stablecoin), AMOUNT_OUT,
            address(swapRouter), keccak256("other"), FEE_BPS, timelocks, _emptyPermit(), payer, swapCalldata, hex""
        );
    }

    function test_SettleToMerchantBalance_Local() public {
        bytes32 paymentIntentId = _captureConverted();
        vm.warp(block.timestamp + 8 days);

        uint256 promised = AMOUNT_OUT - (AMOUNT_OUT * 300) / 10000;
        uint256 leftover = AMOUNT_OUT - promised;
        bytes memory sig = _signSettleBalance(
            paymentIntentId, AMOUNT_OUT, address(stablecoin), block.chainid, address(escrow), address(0), bytes32(0), promised, address(0)
        );

        vm.prank(transactionKey);
        escrow.settleToMerchantBalance(
            paymentIntentId,
            address(stablecoin),
            block.chainid,
            address(escrow),
            address(0),
            bytes32(0),
            promised,
            address(0),
            "",
            sig
        );

        assertEq(escrow.merchantSettlementBalances(merchant, address(stablecoin)), promised);
        assertEq(stablecoin.balanceOf(treasury), leftover);
        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Settled));
        assertTrue(escrow.settlementCreditConsumed(paymentIntentId));
    }

    function test_SettleToMerchantBalance_Local_PaysWallet() public {
        bytes32 paymentIntentId = _captureConverted();
        vm.warp(block.timestamp + 8 days);
        uint256 promised = 97 * 10**18;
        bytes memory sig = _signSettleBalance(
            paymentIntentId, AMOUNT_OUT, address(stablecoin), block.chainid, address(escrow), address(0), bytes32(0), promised, merchant
        );

        vm.prank(transactionKey);
        escrow.settleToMerchantBalance(
            paymentIntentId, address(stablecoin), block.chainid, address(escrow), address(0), bytes32(0), promised, merchant, "", sig
        );

        assertEq(stablecoin.balanceOf(merchant), promised);
        assertEq(stablecoin.balanceOf(treasury), AMOUNT_OUT - promised);
        assertEq(escrow.merchantSettlementBalances(merchant, address(stablecoin)), 0);
    }

    function test_SettleToMerchantBalance_WrongDestinationReverts() public {
        bytes32 paymentIntentId = _captureConverted();
        vm.warp(block.timestamp + 8 days);
        address wallet = makeAddr("settlementWallet");
        uint256 promised = 97 * 10**18;
        bytes memory sig = _signSettleBalance(
            paymentIntentId, AMOUNT_OUT, address(stablecoin), block.chainid, address(escrow), address(0), bytes32(0), promised, wallet
        );

        vm.prank(transactionKey);
        vm.expectRevert("Destination must be merchant");
        escrow.settleToMerchantBalance(
            paymentIntentId, address(stablecoin), block.chainid, address(escrow), address(0), bytes32(0), promised, wallet, "", sig
        );
    }

    function test_CreditMerchantBalance_WrongDestinationReverts() public {
        bytes32 paymentIntentId = keccak256("credit-wrong-dest");
        uint256 promised = 97 * 10**18;
        address wallet = makeAddr("otherWallet");
        bytes memory sig = _signCredit(paymentIntentId, merchant, address(stablecoin), promised, wallet);
        vm.expectRevert("Destination must be merchant");
        escrow.creditMerchantBalance(paymentIntentId, merchant, address(stablecoin), promised, wallet, sig);
    }

    function test_SettleToMerchantBalance_Bridge() public {
        bytes32 paymentIntentId = _captureConverted();
        vm.warp(block.timestamp + 8 days);

        uint256 promised = 97 * 10**18;
        bytes memory bridgeCalldata = abi.encodeWithSelector(
            MockBridgeRouter.bridge.selector, address(stablecoin), AMOUNT_OUT, address(escrow)
        );
        uint256 destChain = 137;
        bytes memory sig = _signSettleBalance(
            paymentIntentId, AMOUNT_OUT, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(bridgeCalldata), promised, merchant
        );

        vm.prank(transactionKey);
        escrow.settleToMerchantBalance(
            paymentIntentId,
            address(stablecoin),
            destChain,
            address(escrow),
            address(bridgeRouter),
            keccak256(bridgeCalldata),
            promised,
            merchant,
            bridgeCalldata,
            sig
        );

        assertEq(bridgeRouter.lastAmount(), AMOUNT_OUT);
        assertEq(escrow.merchantSettlementBalances(merchant, address(stablecoin)), 0);
        assertEq(stablecoin.allowance(address(escrow), address(bridgeRouter)), 0);
        assertEq(stablecoin.balanceOf(treasury), 0);
    }

    function test_CreditMerchantBalance_Pull() public {
        bytes32 paymentIntentId = keccak256("credit1");
        uint256 promised = 97 * 10**18;
        uint256 received = AMOUNT_OUT;
        stablecoin.mint(address(this), received);
        stablecoin.approve(address(escrow), received);

        escrow.creditMerchantBalance(
            paymentIntentId,
            merchant,
            address(stablecoin),
            promised,
            address(0),
            _signCredit(paymentIntentId, merchant, address(stablecoin), promised, address(0))
        );

        assertEq(escrow.merchantSettlementBalances(merchant, address(stablecoin)), promised);
        assertEq(stablecoin.balanceOf(treasury), received - promised);
        assertTrue(escrow.settlementCreditConsumed(paymentIntentId));
    }

    function test_CreditMerchantBalance_PaysDestination() public {
        bytes32 paymentIntentId = keccak256("credit-dest");
        uint256 promised = 97 * 10**18;
        stablecoin.mint(address(this), AMOUNT_OUT);
        stablecoin.approve(address(escrow), AMOUNT_OUT);

        escrow.creditMerchantBalance(
            paymentIntentId, merchant, address(stablecoin), promised, merchant,
            _signCredit(paymentIntentId, merchant, address(stablecoin), promised, merchant)
        );

        assertEq(stablecoin.balanceOf(merchant), promised);
        assertEq(stablecoin.balanceOf(treasury), AMOUNT_OUT - promised);
        assertEq(escrow.merchantSettlementBalances(merchant, address(stablecoin)), 0);
    }

    function test_CreditMerchantBalance_ReplayReverts() public {
        bytes32 paymentIntentId = keccak256("credit-replay");
        stablecoin.mint(address(this), AMOUNT_OUT * 2);
        stablecoin.approve(address(escrow), AMOUNT_OUT * 2);
        bytes memory sig = _signCredit(paymentIntentId, merchant, address(stablecoin), AMOUNT_OUT, address(0));
        escrow.creditMerchantBalance(paymentIntentId, merchant, address(stablecoin), AMOUNT_OUT, address(0), sig);
        vm.expectRevert("Credit already consumed");
        escrow.creditMerchantBalance(paymentIntentId, merchant, address(stablecoin), AMOUNT_OUT, address(0), sig);
    }

    function test_SettleStuckMerchantBalance() public {
        bytes32 paymentIntentId = keccak256("stuck1");
        uint256 promised = 97 * 10**18;
        stablecoin.mint(address(escrow), AMOUNT_OUT);
        bytes memory sig = _signCredit(paymentIntentId, merchant, address(stablecoin), promised, merchant);

        vm.prank(transactionKey);
        escrow.settleStuckMerchantBalance(
            paymentIntentId, merchant, address(stablecoin), promised, merchant, sig
        );

        assertEq(stablecoin.balanceOf(merchant), promised);
        assertEq(stablecoin.balanceOf(address(escrow)), AMOUNT_OUT - promised);
        assertEq(stablecoin.balanceOf(treasury), 0);
        assertTrue(escrow.settlementCreditConsumed(paymentIntentId));
    }

    function test_SettleStuckThenCreditReverts() public {
        bytes32 paymentIntentId = keccak256("stuck-then-credit");
        uint256 promised = 97 * 10**18;
        stablecoin.mint(address(escrow), AMOUNT_OUT);
        bytes memory sig = _signCredit(paymentIntentId, merchant, address(stablecoin), promised, address(0));
        vm.prank(transactionKey);
        escrow.settleStuckMerchantBalance(paymentIntentId, merchant, address(stablecoin), promised, address(0), sig);
        stablecoin.mint(address(this), AMOUNT_OUT);
        stablecoin.approve(address(escrow), AMOUNT_OUT);
        vm.expectRevert("Credit already consumed");
        escrow.creditMerchantBalance(paymentIntentId, merchant, address(stablecoin), promised, address(0), sig);
    }

    function test_RetrySettleToMerchantBalance() public {
        bytes32 paymentIntentId = _captureConverted();
        vm.warp(block.timestamp + 8 days);
        uint256 promised = 97 * 10**18;
        bytes memory firstCalldata = abi.encodeWithSelector(
            MockBridgeRouter.bridge.selector, address(stablecoin), AMOUNT_OUT, address(escrow)
        );
        uint256 destChain = 137;
        bytes memory firstSig = _signSettleBalance(
            paymentIntentId, AMOUNT_OUT, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(firstCalldata), promised, merchant
        );
        vm.prank(transactionKey);
        escrow.settleToMerchantBalance(
            paymentIntentId, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(firstCalldata), promised, merchant, firstCalldata, firstSig
        );

        stablecoin.mint(address(escrow), AMOUNT_OUT);
        bytes memory retryCalldata = abi.encodeWithSelector(
            MockBridgeRouter.bridge.selector, address(stablecoin), AMOUNT_OUT, address(escrow)
        );
        bytes memory retrySig = _signRetrySettle(
            paymentIntentId, AMOUNT_OUT, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(retryCalldata), promised, merchant, 0
        );
        vm.prank(transactionKey);
        vm.expectRevert("Retry delay");
        escrow.retrySettleToMerchantBalance(
            paymentIntentId, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(retryCalldata), promised, merchant, retryCalldata, retrySig
        );

        vm.warp(block.timestamp + 1 hours);
        vm.prank(transactionKey);
        escrow.retrySettleToMerchantBalance(
            paymentIntentId, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(retryCalldata), promised, merchant, retryCalldata, retrySig
        );

        assertEq(escrow.settleBridgeRetryCount(paymentIntentId), 1);
        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Settled));
    }

    function test_RetrySettleToMerchantBalance_Cap() public {
        bytes32 paymentIntentId = _captureConverted();
        vm.warp(block.timestamp + 8 days);
        uint256 promised = 97 * 10**18;
        uint256 destChain = 137;
        bytes memory firstCalldata = abi.encodeWithSelector(
            MockBridgeRouter.bridge.selector, address(stablecoin), AMOUNT_OUT, address(escrow)
        );
        bytes memory firstSig = _signSettleBalance(
            paymentIntentId, AMOUNT_OUT, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(firstCalldata), promised, merchant
        );
        vm.prank(transactionKey);
        escrow.settleToMerchantBalance(
            paymentIntentId, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(firstCalldata), promised, merchant, firstCalldata, firstSig
        );

        for (uint256 i = 0; i < 4; i++) {
            vm.warp(block.timestamp + 1 hours);
            stablecoin.mint(address(escrow), AMOUNT_OUT);
            bytes memory retryCalldata = abi.encodeWithSelector(
                MockBridgeRouter.bridge.selector, address(stablecoin), AMOUNT_OUT, address(escrow)
            );
            bytes memory retrySig = _signRetrySettle(
                paymentIntentId, AMOUNT_OUT, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(retryCalldata), promised, merchant, i
            );
            vm.prank(transactionKey);
            escrow.retrySettleToMerchantBalance(
                paymentIntentId, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(retryCalldata), promised, merchant, retryCalldata, retrySig
            );
        }
        assertEq(escrow.settleBridgeRetryCount(paymentIntentId), 4);

        stablecoin.mint(address(escrow), AMOUNT_OUT);
        bytes memory extraCalldata = abi.encodeWithSelector(
            MockBridgeRouter.bridge.selector, address(stablecoin), AMOUNT_OUT, address(escrow)
        );
        bytes memory extraSig = _signRetrySettle(
            paymentIntentId, AMOUNT_OUT, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(extraCalldata), promised, merchant, 4
        );
        vm.prank(transactionKey);
        vm.expectRevert("Retry limit reached");
        escrow.retrySettleToMerchantBalance(
            paymentIntentId, address(stablecoin), destChain, address(escrow), address(bridgeRouter), keccak256(extraCalldata), promised, merchant, extraCalldata, extraSig
        );
    }

    function test_SettleToBank() public {
        _creditLocal(AMOUNT_OUT);
        bytes32 paymentIntentId = keccak256("bank-pay");
        bytes32 bankSettlementId = keccak256("bank1");
        uint256 authValidUntil = block.timestamp + 365 days;
        bytes memory merchantSig = _signMerchantBankAuth(merchant, authValidUntil);
        bytes memory platformSig = _signBank(
            paymentIntentId, merchant, address(stablecoin), AMOUNT_OUT, bloxfiDeposit, bankSettlementId
        );

        vm.prank(transactionKey);
        escrow.settleToBank(
            paymentIntentId,
            merchant,
            address(stablecoin),
            AMOUNT_OUT,
            bloxfiDeposit,
            bankSettlementId,
            authValidUntil,
            merchantSig,
            platformSig
        );

        assertEq(escrow.merchantSettlementBalances(merchant, address(stablecoin)), 0);
        assertEq(stablecoin.balanceOf(bloxfiDeposit), AMOUNT_OUT);
        assertTrue(escrow.bankSettlementConsumed(bankSettlementId));
    }

    function test_SettleToBank_ReplayReverts() public {
        _creditLocal(AMOUNT_OUT);
        bytes32 paymentIntentId = keccak256("bank-pay-replay");
        bytes32 bankSettlementId = keccak256("bank-replay");
        uint256 authValidUntil = block.timestamp + 365 days;
        bytes memory merchantSig = _signMerchantBankAuth(merchant, authValidUntil);
        bytes memory platformSig = _signBank(
            paymentIntentId, merchant, address(stablecoin), AMOUNT_OUT, bloxfiDeposit, bankSettlementId
        );

        vm.startPrank(transactionKey);
        escrow.settleToBank(
            paymentIntentId, merchant, address(stablecoin), AMOUNT_OUT, bloxfiDeposit,
            bankSettlementId, authValidUntil, merchantSig, platformSig
        );
        vm.expectRevert("Bank settlement already executed");
        escrow.settleToBank(
            paymentIntentId, merchant, address(stablecoin), AMOUNT_OUT, bloxfiDeposit,
            bankSettlementId, authValidUntil, merchantSig, platformSig
        );
        vm.stopPrank();
    }

    function test_WithdrawSettlementBalance() public {
        _creditLocal(AMOUNT_OUT);
        bytes32 withdrawId = keccak256("withdraw1");
        uint256 authValidUntil = block.timestamp + 365 days;
        bytes memory merchantSig = _signMerchantBankAuth(merchant, authValidUntil);
        bytes memory platformSig = _signWithdraw(merchant, address(stablecoin), AMOUNT_OUT, merchant, withdrawId);

        vm.prank(transactionKey);
        escrow.withdrawSettlementBalance(
            merchant,
            address(stablecoin),
            AMOUNT_OUT,
            merchant,
            withdrawId,
            authValidUntil,
            merchantSig,
            platformSig
        );

        assertEq(stablecoin.balanceOf(merchant), AMOUNT_OUT);
        assertEq(escrow.merchantSettlementBalances(merchant, address(stablecoin)), 0);
        assertTrue(escrow.withdrawSettlementConsumed(withdrawId));
    }

    function test_SettleToBank_InvalidMerchantSig() public {
        _creditLocal(AMOUNT_OUT);
        bytes32 paymentIntentId = keccak256("bank-bad-sig");
        bytes32 bankSettlementId = keccak256("bank-bad-sig");
        uint256 authValidUntil = block.timestamp + 365 days;
        bytes memory badSig = _signMerchantBankAuth(payer, authValidUntil);

        vm.prank(transactionKey);
        vm.expectRevert("Invalid merchant signature");
        escrow.settleToBank(
            paymentIntentId, merchant, address(stablecoin), AMOUNT_OUT, bloxfiDeposit,
            bankSettlementId, authValidUntil, badSig, hex""
        );
    }

    function test_SettleToBank_ExpiredAuth() public {
        _creditLocal(AMOUNT_OUT);
        bytes32 paymentIntentId = keccak256("bank-expired-auth");
        bytes32 bankSettlementId = keccak256("bank-expired");
        uint256 authValidUntil = block.timestamp + 1;
        bytes memory merchantSig = _signMerchantBankAuth(merchant, authValidUntil);
        vm.warp(block.timestamp + 2);

        vm.prank(transactionKey);
        vm.expectRevert("Bank auth expired");
        escrow.settleToBank(
            paymentIntentId, merchant, address(stablecoin), AMOUNT_OUT, bloxfiDeposit,
            bankSettlementId, authValidUntil, merchantSig, hex""
        );
    }

    function test_SettleToBank_InvalidPaymentIntentId() public {
        _creditLocal(AMOUNT_OUT);
        bytes32 bankSettlementId = keccak256("bank-no-intent");
        uint256 authValidUntil = block.timestamp + 365 days;
        bytes memory merchantSig = _signMerchantBankAuth(merchant, authValidUntil);

        vm.prank(transactionKey);
        vm.expectRevert("Invalid payment intent");
        escrow.settleToBank(
            bytes32(0), merchant, address(stablecoin), AMOUNT_OUT, bloxfiDeposit,
            bankSettlementId, authValidUntil, merchantSig, hex""
        );
    }

    function test_WithdrawSettlementBalance_ReplayReverts() public {
        _creditLocal(AMOUNT_OUT);
        bytes32 withdrawId = keccak256("withdraw-replay");
        uint256 authValidUntil = block.timestamp + 365 days;
        bytes memory merchantSig = _signMerchantBankAuth(merchant, authValidUntil);
        bytes memory platformSig = _signWithdraw(merchant, address(stablecoin), AMOUNT_OUT, merchant, withdrawId);

        vm.startPrank(transactionKey);
        escrow.withdrawSettlementBalance(
            merchant, address(stablecoin), AMOUNT_OUT, merchant, withdrawId,
            authValidUntil, merchantSig, platformSig
        );
        vm.expectRevert("Withdraw already executed");
        escrow.withdrawSettlementBalance(
            merchant, address(stablecoin), AMOUNT_OUT, merchant, withdrawId,
            authValidUntil, merchantSig, platformSig
        );
        vm.stopPrank();
    }

    function test_SettleToBank_DisallowedTokenReverts() public {
        _creditLocal(AMOUNT_OUT);
        bytes32 paymentIntentId = keccak256("bank-bad-token");
        bytes32 bankSettlementId = keccak256("bank-bad-token-id");
        uint256 authValidUntil = block.timestamp + 365 days;
        bytes memory merchantSig = _signMerchantBankAuth(merchant, authValidUntil);
        bytes memory platformSig = _signBank(
            paymentIntentId, merchant, address(stablecoin), AMOUNT_OUT, bloxfiDeposit, bankSettlementId
        );

        _adminSetSettlementToken(escrow, admin, address(stablecoin), false);

        vm.prank(transactionKey);
        vm.expectRevert("Settlement token not allowed");
        escrow.settleToBank(
            paymentIntentId, merchant, address(stablecoin), AMOUNT_OUT, bloxfiDeposit,
            bankSettlementId, authValidUntil, merchantSig, platformSig
        );
    }

    function test_SettleToMerchantBalance_BridgeFails() public {
        bytes32 paymentIntentId = _captureConverted();
        vm.warp(block.timestamp + 8 days);

        _saSetBridgeRouter(escrow, address(failingBridgeRouter), true);

        uint256 promised = 97 * 10**18;
        bytes memory bridgeCalldata = abi.encodeWithSelector(
            MockFailingBridgeRouter.bridge.selector, address(stablecoin), AMOUNT_OUT, address(escrow)
        );
        uint256 destChain = 137;
        bytes memory sig = _signSettleBalance(
            paymentIntentId, AMOUNT_OUT, address(stablecoin), destChain, address(escrow),
            address(failingBridgeRouter), keccak256(bridgeCalldata), promised, merchant
        );

        uint256 escrowBalanceBefore = stablecoin.balanceOf(address(escrow));

        vm.prank(transactionKey);
        vm.expectRevert("Bridge failed");
        escrow.settleToMerchantBalance(
            paymentIntentId, address(stablecoin), destChain, address(escrow),
            address(failingBridgeRouter), keccak256(bridgeCalldata), promised, merchant,
            bridgeCalldata, sig
        );

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(uint256(payment.status), uint256(INodeRailsEscrow.PaymentStatus.Captured));
        assertEq(stablecoin.balanceOf(address(escrow)), escrowBalanceBefore);
        assertEq(stablecoin.allowance(address(escrow), address(failingBridgeRouter)), 0);
    }

    function test_RetrySettleToMerchantBalance_BridgeFails() public {
        bytes32 paymentIntentId = _captureConverted();
        vm.warp(block.timestamp + 8 days);

        uint256 promised = 97 * 10**18;
        bytes memory firstCalldata = abi.encodeWithSelector(
            MockBridgeRouter.bridge.selector, address(stablecoin), AMOUNT_OUT, address(escrow)
        );
        uint256 destChain = 137;
        bytes memory firstSig = _signSettleBalance(
            paymentIntentId, AMOUNT_OUT, address(stablecoin), destChain, address(escrow),
            address(bridgeRouter), keccak256(firstCalldata), promised, merchant
        );
        vm.prank(transactionKey);
        escrow.settleToMerchantBalance(
            paymentIntentId, address(stablecoin), destChain, address(escrow),
            address(bridgeRouter), keccak256(firstCalldata), promised, merchant, firstCalldata, firstSig
        );

        stablecoin.mint(address(escrow), AMOUNT_OUT);

        _saSetBridgeRouter(escrow, address(failingBridgeRouter), true);

        bytes memory retryCalldata = abi.encodeWithSelector(
            MockFailingBridgeRouter.bridge.selector, address(stablecoin), AMOUNT_OUT, address(escrow)
        );
        bytes memory retrySig = _signRetrySettle(
            paymentIntentId, AMOUNT_OUT, address(stablecoin), destChain, address(escrow),
            address(failingBridgeRouter), keccak256(retryCalldata), promised, merchant, 0
        );

        vm.warp(block.timestamp + 1 hours);
        vm.prank(transactionKey);
        vm.expectRevert("Bridge failed");
        escrow.retrySettleToMerchantBalance(
            paymentIntentId, address(stablecoin), destChain, address(escrow),
            address(failingBridgeRouter), keccak256(retryCalldata), promised, merchant,
            retryCalldata, retrySig
        );

        assertEq(escrow.settleBridgeRetryCount(paymentIntentId), 0);
    }

    function test_ExistingCaptureStillWorks() public {
        bytes32 paymentIntentId = keccak256("legacy");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        bytes32 nonce = keccak256(abi.encodePacked(paymentIntentId, "erc20"));
        bytes32 typehash = keccak256(
            "CaptureERC20Payment(bytes32 paymentIntentId,address merchant,address token,uint256 amount,address payer,uint16 feeBps,uint256 timelocks,uint256 nonce)"
        );
        bytes32 structHash = keccak256(abi.encode(
            typehash, paymentIntentId, merchant, address(sourceToken), AMOUNT_IN, payer, FEE_BPS, Timelocks.unwrap(timelocks), nonce
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(transactionKeyPrivate, digest);

        vm.prank(payer);
        sourceToken.approve(address(escrow), AMOUNT_IN);

        vm.prank(transactionKey);
        escrow.captureERC20Payment(
            paymentIntentId, merchant, address(sourceToken), AMOUNT_IN, payer, FEE_BPS, timelocks,
            _emptyPermit(), abi.encodePacked(r, s, v)
        );

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(payment.token, address(sourceToken));
        assertEq(payment.amount, AMOUNT_IN);
    }

    function _captureConverted() internal returns (bytes32 paymentIntentId) {
        paymentIntentId = keccak256("converted-pay");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        bytes memory swapCalldata = abi.encodeWithSelector(
            MockSwapRouter.swap.selector, address(sourceToken), address(stablecoin), AMOUNT_IN, AMOUNT_OUT
        );
        vm.prank(payer);
        sourceToken.approve(address(escrow), AMOUNT_IN);
        bytes memory sig = _signConvert(paymentIntentId, merchant, address(sourceToken), AMOUNT_IN, address(stablecoin), AMOUNT_OUT, address(swapRouter), keccak256(swapCalldata), FEE_BPS, timelocks, keccak256(abi.encodePacked(paymentIntentId, "erc20")));
        vm.prank(transactionKey);
        escrow.captureAndConvert(
            paymentIntentId, merchant, address(sourceToken), AMOUNT_IN, address(stablecoin), AMOUNT_OUT,
            address(swapRouter), keccak256(swapCalldata), FEE_BPS, timelocks, _emptyPermit(), payer, swapCalldata,
            sig
        );
    }

    function _creditLocal(uint256 amount) internal {
        bytes32 paymentIntentId = keccak256(abi.encodePacked("credit", amount));
        stablecoin.mint(address(this), amount);
        stablecoin.approve(address(escrow), amount);
        escrow.creditMerchantBalance(
            paymentIntentId, merchant, address(stablecoin), amount, address(0),
            _signCredit(paymentIntentId, merchant, address(stablecoin), amount, address(0))
        );
    }

    function _emptyPermit() internal pure returns (INodeRailsEscrow.PermitData memory) {
        return INodeRailsEscrow.PermitData({amount: 0, deadline: 0, v: 0, r: bytes32(0), s: bytes32(0)});
    }

    function _signConvert(
        bytes32 paymentIntentId,
        address _merchant,
        address sourceToken_,
        uint256 amountIn,
        address settlementToken_,
        uint256 minAmountOut,
        address router,
        bytes32 swapCalldataHash,
        uint16 feeBps,
        Timelocks timelocks,
        bytes32 nonce
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            CAPTURE_AND_CONVERT_TYPEHASH,
            paymentIntentId, _merchant, sourceToken_, amountIn, settlementToken_, minAmountOut, router, swapCalldataHash, feeBps, Timelocks.unwrap(timelocks), nonce
        ));
        return _signDigest(structHash);
    }

    function _signSettleBalance(
        bytes32 paymentIntentId,
        uint256 merchantAmount,
        address token_,
        uint256 settlementChainId,
        address settlementEscrow,
        address router,
        bytes32 bridgeCalldataHash,
        uint256 minDestinationAmount,
        address destination
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            SETTLE_TO_MERCHANT_BALANCE_TYPEHASH,
            paymentIntentId, merchantAmount, token_, settlementChainId, settlementEscrow, router, bridgeCalldataHash, minDestinationAmount, destination
        ));
        return _signDigest(structHash);
    }

    function _signRetrySettle(
        bytes32 paymentIntentId,
        uint256 merchantAmount,
        address token_,
        uint256 settlementChainId,
        address settlementEscrow,
        address router,
        bytes32 bridgeCalldataHash,
        uint256 minDestinationAmount,
        address destination,
        uint256 retryNonce
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            RETRY_SETTLE_TO_MERCHANT_BALANCE_TYPEHASH,
            paymentIntentId, merchantAmount, token_, settlementChainId, settlementEscrow, router, bridgeCalldataHash, minDestinationAmount, destination, retryNonce
        ));
        return _signDigest(structHash);
    }

    function _signCredit(bytes32 paymentIntentId, address _merchant, address token, uint256 minAmount, address destination) internal view returns (bytes memory) {
        return _signDigest(keccak256(abi.encode(CREDIT_MERCHANT_BALANCE_TYPEHASH, paymentIntentId, _merchant, token, minAmount, destination)));
    }

    function _signBank(
        bytes32 paymentIntentId,
        address _merchant, address token, uint256 amount, address depositAddress, bytes32 bankSettlementId
    ) internal view returns (bytes memory) {
        return _signDigest(keccak256(abi.encode(
            SETTLE_TO_BANK_TYPEHASH, paymentIntentId, _merchant, token, amount, depositAddress, bankSettlementId
        )));
    }

    function _signWithdraw(
        address _merchant, address token, uint256 amount, address destination, bytes32 withdrawId
    ) internal view returns (bytes memory) {
        return _signDigest(keccak256(abi.encode(WITHDRAW_SETTLEMENT_BALANCE_TYPEHASH, _merchant, token, amount, destination, withdrawId)));
    }

    function _signMerchantBankAuth(
        address _merchant, uint256 validUntil
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                AUTHORIZE_BANK_SETTLEMENT_TYPEHASH,
                _merchant,
                keccak256(bytes(BANK_AUTH_PURPOSE)),
                validUntil
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.bankAuthDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(merchantKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signDigest(bytes32 structHash) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(transactionKeyPrivate, digest);
        return abi.encodePacked(r, s, v);
    }
}
