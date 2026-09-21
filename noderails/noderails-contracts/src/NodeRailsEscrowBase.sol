// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./interfaces/INodeRailsEscrow.sol";
import "./libraries/TimelocksLib.sol";
import "./SuperAdmin3of5.sol";

/// @dev Shared storage + helpers. Escrow and Logic must not add further storage slots.
abstract contract NodeRailsEscrowBase is INodeRailsEscrow, EIP712, ReentrancyGuard, Pausable, SuperAdmin3of5 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    uint16 public constant MAX_FEE_BPS = 1000;
    uint256 public constant MAX_SETTLE_BRIDGE_RETRIES = 4;
    uint256 public constant SETTLE_BRIDGE_RETRY_DELAY = 1 hours;

    bytes32 internal constant CAPTURE_NATIVE_TYPEHASH = keccak256(
        "CaptureNativePayment(bytes32 paymentIntentId,address merchant,uint256 amount,uint16 feeBps,uint256 timelocks,uint256 nonce)"
    );

    bytes32 internal constant CAPTURE_ERC20_TYPEHASH = keccak256(
        "CaptureERC20Payment(bytes32 paymentIntentId,address merchant,address token,uint256 amount,address payer,uint16 feeBps,uint256 timelocks,uint256 nonce)"
    );

    bytes32 internal constant CAPTURE_AND_CONVERT_TYPEHASH = keccak256(
        "CaptureAndConvert(bytes32 paymentIntentId,address merchant,address sourceToken,uint256 amountIn,address settlementToken,uint256 minAmountOut,address router,bytes32 swapCalldataHash,uint16 feeBps,uint256 timelocks,uint256 nonce)"
    );

    bytes32 internal constant SETTLE_TO_MERCHANT_BALANCE_TYPEHASH = keccak256(
        "SettleToMerchantBalance(bytes32 paymentIntentId,uint256 merchantAmount,address token,uint256 settlementChainId,address settlementEscrow,address router,bytes32 bridgeCalldataHash,uint256 minDestinationAmount,address destination)"
    );

    bytes32 internal constant CREDIT_MERCHANT_BALANCE_TYPEHASH = keccak256(
        "CreditMerchantBalance(bytes32 paymentIntentId,address merchant,address token,uint256 minAmount,address destination)"
    );

    bytes32 internal constant RETRY_SETTLE_TO_MERCHANT_BALANCE_TYPEHASH = keccak256(
        "RetrySettleToMerchantBalance(bytes32 paymentIntentId,uint256 merchantAmount,address token,uint256 settlementChainId,address settlementEscrow,address router,bytes32 bridgeCalldataHash,uint256 minDestinationAmount,address destination,uint256 retryNonce)"
    );

    bytes32 internal constant SETTLE_TO_BANK_TYPEHASH = keccak256(
        "SettleToBank(bytes32 paymentIntentId,address merchant,address token,uint256 amount,address depositAddress,bytes32 bankSettlementId)"
    );

    bytes32 internal constant WITHDRAW_SETTLEMENT_BALANCE_TYPEHASH = keccak256(
        "WithdrawSettlementBalance(address merchant,address token,uint256 amount,address destination,bytes32 withdrawId)"
    );

    string public constant BANK_AUTH_PURPOSE =
        "I authorize NodeRails to execute bank settlements and withdrawals from this wallet";

    bytes32 private constant BANK_AUTH_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant BANK_AUTH_DOMAIN_SEPARATOR = keccak256(
        abi.encode(
            BANK_AUTH_DOMAIN_TYPEHASH,
            keccak256(bytes("NodeRailsBank")),
            keccak256(bytes("1")),
            uint256(0),
            address(0)
        )
    );

    bytes32 public constant AUTHORIZE_BANK_SETTLEMENT_TYPEHASH = keccak256(
        "NodeRailsAuthorizeBankSettlement(address merchantWallet,string purpose,uint256 validUntil)"
    );

    mapping(bytes32 => Payment) public payments;
    mapping(address => KeyRole) public keyRoles;
    mapping(bytes32 => bool) public usedNonces;
    address public feeRecipient;
    bool public fullStopped;
    bool public feeOnTransferEnabled;

    mapping(address => bool) public allowedSwapRouters;
    mapping(address => bool) public allowedBridgeRouters;
    mapping(address => bool) public allowedSettlementTokens;
    mapping(address => mapping(address => uint256)) public merchantSettlementBalances;
    mapping(bytes32 => bool) public settlementCreditConsumed;
    mapping(bytes32 => bool) public bankSettlementConsumed;
    mapping(bytes32 => bool) public withdrawSettlementConsumed;
    mapping(bytes32 => ConversionRecord) public conversionRecords;
    mapping(bytes32 => uint256) public settleBridgeRetryCount;
    mapping(bytes32 => uint256) public settleBridgeLastAttemptAt;
    /// @dev Leftover escrowed units for this payment. Set at capture; shrunk by refunds. Never use payment.amount after a partial.
    mapping(bytes32 => uint256) public settleAmount;

    constructor() EIP712("NodeRailsEscrow", "1") {}

    function bankAuthDomainSeparator() public pure returns (bytes32) {
        return BANK_AUTH_DOMAIN_SEPARATOR;
    }

    function _verifyNoderailsSignature(bytes32 structHash, bytes calldata signature) internal view {
        address signer = _hashTypedDataV4(structHash).recover(signature);
        require(keyRoles[signer] == KeyRole.TransactionKey, "Invalid signature");
    }

    function _requireMerchant(address merchant) internal pure {
        require(merchant != address(0), "Invalid merchant");
    }

    function _requireToken(address token) internal pure {
        require(token != address(0), "Invalid token");
    }

    function _requireRouter(address router) internal pure {
        require(router != address(0), "Invalid router");
    }

    function _requirePayer(address payer) internal pure {
        require(payer != address(0), "Invalid payer");
    }

    function _requireFeeBps(uint16 feeBps) internal pure {
        require(feeBps <= MAX_FEE_BPS, "Fee too high");
    }

    function _requireCalldataHash(bytes calldata data, bytes32 expected) internal pure {
        require(keccak256(data) == expected, "Calldata mismatch");
    }

    function _requireNewCapture(
        bytes32 paymentIntentId,
        address merchant,
        uint16 feeBps,
        Timelocks timelocks
    ) internal view {
        _requireMerchant(merchant);
        _requireFeeBps(feeBps);
        require(payments[paymentIntentId].status == PaymentStatus.None, "Payment exists");
        _validateTimelocks(timelocks);
    }

    function _useNonce(bytes32 paymentIntentId, bool native) internal returns (bytes32 nonce) {
        nonce = keccak256(abi.encodePacked(paymentIntentId, native ? "native" : "erc20"));
        require(!usedNonces[nonce], "Nonce already used");
        usedNonces[nonce] = true;
    }

    function _storeCaptured(
        bytes32 paymentIntentId,
        address merchant,
        address payer,
        address token,
        uint256 amount,
        uint16 feeBps,
        Timelocks timelocks
    ) internal {
        payments[paymentIntentId] = Payment({
            merchant: merchant,
            payer: payer,
            token: token,
            amount: amount,
            feeBps: feeBps,
            status: PaymentStatus.Captured,
            timelocks: timelocks
        });
        settleAmount[paymentIntentId] = amount;
        emit PaymentCaptured(paymentIntentId, merchant, payer, token, amount, feeBps, timelocks);
    }

    function _payFeeSplit(address token, address merchant, uint256 amount, uint16 feeBps)
        internal
        returns (uint256 merchantAmount, uint256 fee)
    {
        (merchantAmount, fee) = _splitFee(amount, feeBps);
        _transferOut(token, merchant, merchantAmount);
        if (fee > 0) {
            _transferOut(token, feeRecipient, fee);
        }
    }

    function _verifyCaptureAndConvert(
        bytes32 paymentIntentId,
        address merchant,
        address sourceToken,
        uint256 amountIn,
        address settlementToken,
        uint256 minAmountOut,
        address router,
        bytes32 swapCalldataHash,
        uint16 feeBps,
        Timelocks timelocks,
        bytes32 nonce,
        bytes calldata noderailsSignature
    ) internal view {
        _verifyNoderailsSignature(
            keccak256(abi.encode(
                CAPTURE_AND_CONVERT_TYPEHASH,
                paymentIntentId,
                merchant,
                sourceToken,
                amountIn,
                settlementToken,
                minAmountOut,
                router,
                swapCalldataHash,
                feeBps,
                Timelocks.unwrap(timelocks),
                nonce
            )),
            noderailsSignature
        );
    }

    function _requireDestSettle(
        bytes32 paymentIntentId,
        Payment storage payment,
        address token,
        uint256 minDestinationAmount,
        address destination
    ) internal view {
        require(payment.token != address(0), "Native not supported");
        require(payment.token == token, "Token mismatch");
        require(minDestinationAmount > 0, "Invalid min destination");
        require(minDestinationAmount <= settleAmount[paymentIntentId], "Promised exceeds amount");
        _requireSettlementDestination(payment.merchant, destination);
    }

    function _bridgeToRouter(
        address token,
        uint256 amount,
        address router,
        bytes32 bridgeCalldataHash,
        bytes calldata bridgeCalldata
    ) internal {
        require(allowedBridgeRouters[router], "Router not allowed");
        _requireCalldataHash(bridgeCalldata, bridgeCalldataHash);
        IERC20(token).forceApprove(router, amount);
        (bool success, ) = router.call(bridgeCalldata);
        require(success, "Bridge failed");
        IERC20(token).forceApprove(router, 0);
    }

    function _setRouter(
        mapping(address => bool) storage routers,
        bytes32 action,
        address router,
        bool allowed,
        SuperAdminProof calldata proof
    ) internal {
        _requireRouter(router);
        _consumeSuperAdmin(action, keccak256(abi.encode(router, allowed)), proof);
        routers[router] = allowed;
    }

    function _requireSettlementSendAuth(
        address merchant,
        address token,
        uint256 amount,
        uint256 authValidUntil,
        bytes calldata merchantSignature
    ) internal view {
        require(allowedSettlementTokens[token], "Settlement token not allowed");
        require(amount > 0, "Invalid amount");
        _verifyMerchantBankSettlementAuth(merchant, authValidUntil, merchantSignature);
    }

    function _debitAndTransferSettlement(address merchant, address token, uint256 amount, address to) internal {
        _debitSettlementBalance(merchant, token, amount);
        _transferOut(token, to, amount);
    }

    function _executePermit(address token, address owner, PermitData calldata permitData) internal {
        if (permitData.deadline > 0) {
            try IERC20Permit(token).permit(
                owner, address(this), permitData.amount, permitData.deadline, permitData.v, permitData.r, permitData.s
            ) {} catch {}
        }
    }

    /// @dev Pull `amount` then credit the balance delta. Off: delta must equal `amount`. On: store delta if > 0.
    function _transferInMeasured(address token, address from, uint256 amount) internal returns (uint256 received) {
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        received = IERC20(token).balanceOf(address(this)) - before;
        require(received > 0, "No tokens received");
        if (!feeOnTransferEnabled) {
            require(received == amount, "Transfer amount mismatch");
        }
    }

    function _transferOut(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _splitFee(uint256 amount, uint16 feeBps) internal pure returns (uint256 merchantAmount, uint256 fee) {
        fee = (amount * feeBps) / 10000;
        merchantAmount = amount - fee;
    }

    function _validateTimelocks(Timelocks timelocks) internal pure {
        uint256 data = Timelocks.unwrap(timelocks);
        uint256 capturedAt = data >> 224;
        uint256 settlement = uint32(data >> 64);
        uint256 disputeStart = uint32(data >> 32);
        require(capturedAt > 0, "Invalid capturedAt");
        require(settlement > 0, "Invalid settlement timelock");
        require(disputeStart <= settlement, "Dispute must start before settlement");
    }

    function _validateConvertCapture(
        bytes32 paymentIntentId,
        address merchant,
        address settlementToken,
        uint256 minAmountOut,
        address router,
        bytes32 swapCalldataHash,
        uint16 feeBps,
        Timelocks timelocks,
        bytes calldata swapCalldata
    ) internal view {
        _requireMerchant(merchant);
        _requireFeeBps(feeBps);
        require(payments[paymentIntentId].status == PaymentStatus.None, "Payment exists");
        require(allowedSwapRouters[router], "Router not allowed");
        require(allowedSettlementTokens[settlementToken], "Settlement token not allowed");
        require(minAmountOut > 0, "Invalid min output");
        _requireCalldataHash(swapCalldata, swapCalldataHash);
        _validateTimelocks(timelocks);
    }

    function _executeSwap(
        address sourceToken,
        uint256 amountIn,
        address settlementToken,
        uint256 minAmountOut,
        address router,
        bytes calldata swapCalldata
    ) internal returns (uint256 amountOut) {
        uint256 before = IERC20(settlementToken).balanceOf(address(this));
        uint256 value;
        if (sourceToken == address(0)) {
            value = amountIn;
        } else {
            IERC20(sourceToken).forceApprove(router, amountIn);
        }

        (bool success, ) = router.call{value: value}(swapCalldata);
        require(success, "Swap failed");

        if (sourceToken != address(0)) {
            IERC20(sourceToken).forceApprove(router, 0);
        }

        amountOut = IERC20(settlementToken).balanceOf(address(this)) - before;
        require(amountOut >= minAmountOut, "Insufficient output");
    }

    function _storeConvertedPayment(
        bytes32 paymentIntentId,
        address merchant,
        address payer,
        address settlementToken,
        uint256 amountOut,
        uint16 feeBps,
        Timelocks timelocks
    ) internal {
        _storeCaptured(paymentIntentId, merchant, payer, settlementToken, amountOut, feeBps, timelocks);
        conversionRecords[paymentIntentId] = ConversionRecord({
            settlementToken: settlementToken,
            amountOut: amountOut,
            converted: true
        });
    }

    function _consumeSettlementCredit(
        bytes32 paymentIntentId,
        address merchant,
        address token,
        uint256 minAmount,
        address destination,
        bytes calldata noderailsSignature
    ) internal {
        _requireMerchant(merchant);
        _requireSettlementDestination(merchant, destination);
        require(allowedSettlementTokens[token], "Settlement token not allowed");
        require(minAmount > 0, "Invalid amount");
        require(!settlementCreditConsumed[paymentIntentId], "Credit already consumed");
        settlementCreditConsumed[paymentIntentId] = true;

        _verifyNoderailsSignature(
            keccak256(abi.encode(
                CREDIT_MERCHANT_BALANCE_TYPEHASH,
                paymentIntentId,
                merchant,
                token,
                minAmount,
                destination
            )),
            noderailsSignature
        );
    }

    function _requireSettlementDestination(address merchant, address destination) internal pure {
        if (destination != address(0)) {
            require(destination == merchant, "Destination must be merchant");
        }
    }

    function _applyDestCredit(
        address merchant,
        address token,
        uint256 promised,
        uint256 received,
        address destination
    ) internal returns (uint256 leftover) {
        require(received >= promised, "Below promised");
        if (destination != address(0)) {
            _transferOut(token, destination, promised);
        } else {
            merchantSettlementBalances[merchant][token] += promised;
        }
        leftover = received - promised;
        if (leftover > 0) {
            _transferOut(token, feeRecipient, leftover);
        }
    }

    function _pullOrMeasureToken(address token, uint256 minAmount) internal returns (uint256 received) {
        uint256 before = IERC20(token).balanceOf(address(this));
        uint256 allowance = IERC20(token).allowance(msg.sender, address(this));
        if (allowance > 0) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), allowance);
        }
        received = IERC20(token).balanceOf(address(this)) - before;
        require(received >= minAmount, "Insufficient credit amount");
    }

    function _verifyMerchantBankSettlementAuth(
        address merchant,
        uint256 validUntil,
        bytes calldata merchantSignature
    ) internal view {
        _requireMerchant(merchant);
        require(validUntil > block.timestamp, "Bank auth expired");
        bytes32 structHash = keccak256(
            abi.encode(
                AUTHORIZE_BANK_SETTLEMENT_TYPEHASH,
                merchant,
                keccak256(bytes(BANK_AUTH_PURPOSE)),
                validUntil
            )
        );
        bytes32 digest = MessageHashUtils.toTypedDataHash(BANK_AUTH_DOMAIN_SEPARATOR, structHash);
        address recovered = ECDSA.recover(digest, merchantSignature);
        require(recovered == merchant, "Invalid merchant signature");
    }

    function _debitSettlementBalance(address merchant, address token, uint256 amount) internal {
        uint256 balance = merchantSettlementBalances[merchant][token];
        require(balance >= amount, "Insufficient settlement balance");
        merchantSettlementBalances[merchant][token] = balance - amount;
    }

    function _isAdminOrSuperAdminSigner(address account) internal view override returns (bool) {
        return keyRoles[account] == KeyRole.Admin || isSuperAdminSigner(account);
    }
}
