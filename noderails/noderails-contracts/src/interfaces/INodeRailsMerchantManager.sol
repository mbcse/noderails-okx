// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INodeRailsMerchantManager {
    // ============ Enums ============

    enum KeyRole {
        None,
        TransactionKey,
        Admin,
        SuperAdmin
    }

    // ============ Structs ============

    struct PermitData {
        uint256 amount;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct PayoutRecord {
        bool executed;
        address merchantWallet;
        uint256 totalAmount;
        uint256 executedAt;
    }

    // ============ Events ============

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

    event KeyRoleUpdated(address indexed key, KeyRole role);
    event FeeRecipientUpdated(address newRecipient);
    event FullStopped();
    event FullStopLifted();
    event ETHDeposited(address indexed merchantWallet, uint256 amount);
    event ETHWithdrawn(address indexed merchantWallet, uint256 amount);

    // ============ Single Payouts ============

    function executePayout(
        bytes32 payoutIntentId,
        address merchantWallet,
        address recipient,
        address token,
        uint256 amount,
        uint16 feeBps,
        uint256 sessionExpiry,
        PermitData calldata permitData,
        bytes calldata merchantSignature,
        bytes calldata noderailsSignature
    ) external;

    function executeNativePayout(
        bytes32 payoutIntentId,
        address merchantWallet,
        address recipient,
        uint256 amount,
        uint16 feeBps,
        uint256 sessionExpiry,
        bytes calldata merchantSignature,
        bytes calldata noderailsSignature
    ) external;

    // ============ Bulk Payouts ============

    function executeBulkPayout(
        bytes32 payoutIntentId,
        address merchantWallet,
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint16 feeBps,
        uint256 sessionExpiry,
        PermitData calldata permitData,
        bytes calldata merchantSignature,
        bytes calldata noderailsSignature
    ) external;

    function executeBulkNativePayout(
        bytes32 payoutIntentId,
        address merchantWallet,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint16 feeBps,
        uint256 sessionExpiry,
        bytes calldata merchantSignature,
        bytes calldata noderailsSignature
    ) external;

    // ============ ETH Deposit / Withdraw ============

    function depositETH(address merchantWallet) external payable;
    function withdrawETH(address merchantWallet, uint256 amount) external;
    function merchantETHBalance(address merchantWallet) external view returns (uint256);

    // ============ Admin ============

    function setKeyRole(address key, KeyRole role) external;
    function pause() external;
    function fullStop() external;

    // ============ View ============

    function isPayoutExecuted(bytes32 payoutIntentId) external view returns (bool);
    function getPayoutRecord(bytes32 payoutIntentId) external view returns (PayoutRecord memory);
    function getKeyRole(address key) external view returns (KeyRole);
    function isFullStopped() external view returns (bool);
}
