// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../libraries/TimelocksLib.sol";

/**
 * @title INodeRailsEscrow
 * @notice Escrow API. After capture: refund before Settlement; dispute after DisputeStart and before
 *         Settlement; settle after Settlement. Dest credit / bank / withdraw do not use those clocks.
 */
interface INodeRailsEscrow {
    // ============ Enums ============

    enum PaymentStatus {
        None,
        Captured,
        Settled,
        Disputed,
        Refunded
    }

    enum KeyRole {
        None,
        TransactionKey,
        Admin,
        SuperAdmin
    }

    // ============ Structs ============

    struct Payment {
        address merchant;
        address payer;
        address token;
        uint256 amount;
        uint16 feeBps;
        PaymentStatus status;
        Timelocks timelocks;
    }

    struct PermitData {
        uint256 amount;    // The allowance value the user signed (may differ from payment amount for subscriptions)
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct ConversionRecord {
        address settlementToken;
        uint256 amountOut;
        bool converted;
    }

    // ============ Events ============

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
        address indexed merchant,
        address indexed payer
    );

    event DisputeResolved(
        bytes32 indexed paymentIntentId,
        address winner,
        uint256 amount,
        uint256 platformFee
    );

    event PaymentRefunded(
        bytes32 indexed paymentIntentId,
        address indexed payer,
        uint256 amount,
        uint256 remainingSettleAmount
    );

    event KeyRoleUpdated(address indexed key, KeyRole role);

    event FeeRecipientUpdated(address indexed newFeeRecipient);

    event FullStopped();

    event FullStopLifted();

    event SwapRouterUpdated(address indexed router, bool allowed);

    event BridgeRouterUpdated(address indexed router, bool allowed);

    event AllowedSettlementTokenUpdated(address indexed token, bool allowed);

    event FeeOnTransferEnabledUpdated(bool enabled);

    event MerchantBalanceCredited(
        bytes32 indexed paymentIntentId,
        address indexed merchant,
        address token,
        uint256 amount
    );

    event SettledToMerchantBalance(
        bytes32 indexed paymentIntentId,
        address indexed merchant,
        uint256 merchantAmount,
        uint256 platformFee,
        bool bridged
    );

    event SettledToBank(
        bytes32 indexed paymentIntentId,
        bytes32 indexed bankSettlementId,
        address indexed merchant,
        address depositAddress,
        address token,
        uint256 amount
    );

    event SettlementBalanceWithdrawn(
        bytes32 indexed withdrawId,
        address indexed merchant,
        address indexed destination,
        address token,
        uint256 amount
    );

    event DestFeeTaken(bytes32 indexed paymentIntentId, uint256 leftover);

    event SettlementBridgeRetried(
        bytes32 indexed paymentIntentId,
        address indexed merchant,
        uint256 amount,
        uint256 retryCount
    );

    event StuckMerchantBalanceSettled(
        bytes32 indexed paymentIntentId,
        address indexed merchant,
        address token,
        uint256 promised,
        address destination
    );

    // ============ Functions ============

    /// @notice Capture native ETH. Payer is msg.sender. Stores Captured + timelocks. No settle clock yet.
    function captureNativePayment(
        bytes32 paymentIntentId,
        address merchant,
        uint16 feeBps,
        Timelocks timelocks,
        bytes calldata noderailsSignature
    ) external payable;

    /// @notice Capture ERC-20 from `payer` (optional permit). TransactionKey. Stores Captured + timelocks.
    function captureERC20Payment(
        bytes32 paymentIntentId,
        address merchant,
        address token,
        uint256 amount,
        address payer,
        uint16 feeBps,
        Timelocks timelocks,
        PermitData calldata permitData,
        bytes calldata noderailsSignature
    ) external;

    /// @notice Default settle after Settlement: merchant gets amount minus feeBps, rest to feeRecipient.
    function settlePayment(bytes32 paymentIntentId) external;

    /// @notice Open dispute while Captured, after DisputeStart and before Settlement. Funds stay in escrow.
    function initiateDispute(bytes32 paymentIntentId) external;

    /// @notice Close dispute: merchant gets settle split, or payer is refunded in full. Status must be Disputed.
    function resolveDispute(bytes32 paymentIntentId, address winner) external;

    /// @notice Refund leftover settleAmount to payer while Captured and before Settlement. TransactionKey only.
    function refundPayment(bytes32 paymentIntentId) external;

    /// @notice Partial refund of `amt` to payer while Captured and before Settlement. TransactionKey only.
    function refundPaymentAmount(bytes32 paymentIntentId, uint256 amt) external;

    /// @notice Capture ERC-20 then swap into allowlisted `settlementToken`. Stored payment uses the output token.
    function captureAndConvert(
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
        PermitData calldata permitData,
        address payer,
        bytes calldata swapCalldata,
        bytes calldata noderailsSignature
    ) external;

    /// @notice Capture native ETH then swap into allowlisted `settlementToken`.
    function captureNativeAndConvert(
        bytes32 paymentIntentId,
        address merchant,
        address settlementToken,
        uint256 minAmountOut,
        address router,
        bytes32 swapCalldataHash,
        uint16 feeBps,
        Timelocks timelocks,
        bytes calldata swapCalldata,
        bytes calldata noderailsSignature
    ) external payable;

    /// @notice First source settle after Settlement: same-chain dest split, or bridge full amount. Sets Settled.
    function settleToMerchantBalance(
        bytes32 paymentIntentId,
        address token,
        uint256 settlementChainId,
        address settlementEscrow,
        address router,
        bytes32 bridgeCalldataHash,
        uint256 minDestinationAmount,
        address destination,
        bytes calldata bridgeCalldata,
        bytes calldata noderailsSignature
    ) external;

    /// @notice Re-bridge after a source refund. Status Settled, dest chain only, max 4 retries, 1 hour between attempts.
    function retrySettleToMerchantBalance(
        bytes32 paymentIntentId,
        address token,
        uint256 settlementChainId,
        address settlementEscrow,
        address router,
        bytes32 bridgeCalldataHash,
        uint256 minDestinationAmount,
        address destination,
        bytes calldata bridgeCalldata,
        bytes calldata noderailsSignature
    ) external;

    /// @notice Dest happy path: pull tokens, pay promised, leftover to feeRecipient. One-shot credit, no payment timelock.
    function creditMerchantBalance(
        bytes32 paymentIntentId,
        address merchant,
        address token,
        uint256 minAmount,
        address destination,
        bytes calldata noderailsSignature
    ) external;

    /// @notice Dest stuck path: tokens already here, pay exactly promised, no pull. Same signed credit as happy path.
    function settleStuckMerchantBalance(
        bytes32 paymentIntentId,
        address merchant,
        address token,
        uint256 minAmount,
        address destination,
        bytes calldata noderailsSignature
    ) external;

    /// @notice Debit merchantSettlementBalances to a bank deposit. Dual-sig; one-shot bankSettlementId.
    function settleToBank(
        bytes32 paymentIntentId,
        address merchant,
        address token,
        uint256 amount,
        address depositAddress,
        bytes32 bankSettlementId,
        uint256 authValidUntil,
        bytes calldata merchantSignature,
        bytes calldata noderailsSignature
    ) external;

    /// @notice Debit merchantSettlementBalances to a wallet. Dual-sig; one-shot withdrawId.
    function withdrawSettlementBalance(
        address merchant,
        address token,
        uint256 amount,
        address destination,
        bytes32 withdrawId,
        uint256 authValidUntil,
        bytes calldata merchantSignature,
        bytes calldata noderailsSignature
    ) external;

    function getPayment(bytes32 paymentIntentId) external view returns (Payment memory);

    function getKeyRole(address key) external view returns (KeyRole);

    /// @notice Any Admin or SuperAdmin signer halt.
    function fullStop() external;

    function isFullStopped() external view returns (bool);
}
