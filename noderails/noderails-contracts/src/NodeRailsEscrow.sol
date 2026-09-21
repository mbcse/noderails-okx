// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./NodeRailsEscrowBase.sol";
import "./NodeRailsEscrowLogic.sol";

/**
 * @title NodeRailsEscrow
 * @notice Holds payer funds from capture until refund, dispute, or settlement.
 *
 * Timeline after capture (packed in `Payment.timelocks`):
 *   captured → [optional wait] → DisputeStart → Settlement
 * - Refund: status Captured, before Settlement.
 * - Dispute: status Captured, after DisputeStart and before Settlement.
 * - Settle (this chain): status Captured, after Settlement.
 * Convert capture stores the settlement token as `Payment.token`. Dest-chain
 * credit functions have no payment row here, so they do not use those timelocks.
 *
 * Fund-moving calls run in immutable NodeRailsEscrowLogic via DELEGATECALL
 * (same storage, same msg.sender). SuperAdmin / halt stay here. Logic cannot change.
 */
contract NodeRailsEscrow is NodeRailsEscrowBase {
    using TimelocksLib for Timelocks;

    /// @notice Immutable payment/settlement implementation. Not upgradeable.
    address public immutable logic;

    constructor(
        address[5] memory _superAdminSigners,
        address[] memory _admins,
        address[] memory _transactionKeys,
        address _feeRecipient,
        address[] memory _swapRouters,
        address[] memory _bridgeRouters,
        address[] memory _settlementTokens
    ) NodeRailsEscrowBase() {
        logic = address(new NodeRailsEscrowLogic());

        require(_admins.length > 0, "At least one admin required");
        require(_feeRecipient != address(0), "Invalid fee recipient");

        _initSuperAdminSigners(_superAdminSigners);

        for (uint256 i = 0; i < _admins.length; i++) {
            _grantInitialKey(_admins[i], KeyRole.Admin);
        }
        for (uint256 i = 0; i < _transactionKeys.length; i++) {
            _grantInitialKey(_transactionKeys[i], KeyRole.TransactionKey);
        }
        for (uint256 i = 0; i < _swapRouters.length; i++) {
            _requireRouter(_swapRouters[i]);
            allowedSwapRouters[_swapRouters[i]] = true;
            emit SwapRouterUpdated(_swapRouters[i], true);
        }
        for (uint256 i = 0; i < _bridgeRouters.length; i++) {
            _requireRouter(_bridgeRouters[i]);
            allowedBridgeRouters[_bridgeRouters[i]] = true;
            emit BridgeRouterUpdated(_bridgeRouters[i], true);
        }
        for (uint256 i = 0; i < _settlementTokens.length; i++) {
            _requireToken(_settlementTokens[i]);
            allowedSettlementTokens[_settlementTokens[i]] = true;
            emit AllowedSettlementTokenUpdated(_settlementTokens[i], true);
        }

        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function _grantInitialKey(address key, KeyRole role) private {
        require(key != address(0), "Invalid key");
        require(!isSuperAdminSigner(key), "Key cannot be super admin signer");
        require(keyRoles[key] == KeyRole.None, "Duplicate initial key");
        keyRoles[key] = role;
        emit KeyRoleUpdated(key, role);
    }

    /// @dev Forward original calldata. Do not `return` in assembly so modifiers still complete.
    ///      Copy calldata at the free-memory pointer so scratch/0x40/0x60 stay valid for the epilogue.
    function _delegateToLogic() private {
        address impl = logic;
        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize())
            let ok := delegatecall(gas(), impl, ptr, calldatasize(), 0, 0)
            if iszero(ok) {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
    }

    modifier onlyAdmin() {
        require(keyRoles[msg.sender] == KeyRole.Admin, "Not admin");
        _;
    }

    modifier onlyTransactionKey() {
        require(
            keyRoles[msg.sender] == KeyRole.TransactionKey ||
            keyRoles[msg.sender] == KeyRole.Admin,
            "Not authorized"
        );
        _;
    }

    modifier onlyTransactionKeyOrMerchant(bytes32 paymentIntentId) {
        require(
            keyRoles[msg.sender] == KeyRole.TransactionKey ||
            keyRoles[msg.sender] == KeyRole.Admin ||
            msg.sender == payments[paymentIntentId].merchant,
            "Not authorized"
        );
        _;
    }

    modifier whenNotFullStop() {
        require(!fullStopped, "Contract is full stopped");
        _;
    }

    modifier onlyFullStop() {
        require(fullStopped, "Contract is not full stopped");
        _;
    }

    modifier onlyBefore(bytes32 paymentIntentId, TimelocksLib.Stage stage) {
        require(block.timestamp < payments[paymentIntentId].timelocks.get(stage), "Too late");
        _;
    }

    modifier onlyAfter(bytes32 paymentIntentId, TimelocksLib.Stage stage) {
        require(block.timestamp >= payments[paymentIntentId].timelocks.get(stage), "Too early");
        _;
    }

    modifier onlyStatus(bytes32 paymentIntentId, PaymentStatus expectedStatus) {
        require(payments[paymentIntentId].status == expectedStatus, "Invalid status");
        _;
    }

    function captureNativePayment(
        bytes32 paymentIntentId,
        address merchant,
        uint16 feeBps,
        Timelocks timelocks,
        bytes calldata noderailsSignature
    ) external payable nonReentrant whenNotFullStop whenNotPaused {
        _delegateToLogic();
    }

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
    ) external nonReentrant whenNotFullStop whenNotPaused onlyTransactionKey {
        _delegateToLogic();
    }

    function settlePayment(bytes32 paymentIntentId)
        external
        nonReentrant
        whenNotFullStop
        whenNotPaused
        onlyTransactionKeyOrMerchant(paymentIntentId)
        onlyStatus(paymentIntentId, PaymentStatus.Captured)
        onlyAfter(paymentIntentId, TimelocksLib.Stage.Settlement)
    {
        _delegateToLogic();
    }

    function initiateDispute(bytes32 paymentIntentId)
        external
        nonReentrant
        whenNotFullStop
        whenNotPaused
        onlyTransactionKey
        onlyStatus(paymentIntentId, PaymentStatus.Captured)
        onlyAfter(paymentIntentId, TimelocksLib.Stage.DisputeStart)
        onlyBefore(paymentIntentId, TimelocksLib.Stage.Settlement)
    {
        _delegateToLogic();
    }

    function resolveDispute(bytes32 paymentIntentId, address winner)
        external
        nonReentrant
        whenNotFullStop
        whenNotPaused
        onlyTransactionKey
        onlyStatus(paymentIntentId, PaymentStatus.Disputed)
    {
        _delegateToLogic();
    }

    function refundPayment(bytes32 paymentIntentId)
        external
        nonReentrant
        whenNotFullStop
        whenNotPaused
        onlyTransactionKey
        onlyStatus(paymentIntentId, PaymentStatus.Captured)
        onlyBefore(paymentIntentId, TimelocksLib.Stage.Settlement)
    {
        _delegateToLogic();
    }

    function refundPaymentAmount(bytes32 paymentIntentId, uint256 amt)
        external
        nonReentrant
        whenNotFullStop
        whenNotPaused
        onlyTransactionKey
        onlyStatus(paymentIntentId, PaymentStatus.Captured)
        onlyBefore(paymentIntentId, TimelocksLib.Stage.Settlement)
    {
        _delegateToLogic();
    }

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
    ) external nonReentrant whenNotFullStop whenNotPaused onlyTransactionKey {
        _delegateToLogic();
    }

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
    ) external payable nonReentrant whenNotFullStop whenNotPaused {
        _delegateToLogic();
    }

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
    )
        external
        nonReentrant
        whenNotFullStop
        whenNotPaused
        onlyTransactionKeyOrMerchant(paymentIntentId)
        onlyStatus(paymentIntentId, PaymentStatus.Captured)
        onlyAfter(paymentIntentId, TimelocksLib.Stage.Settlement)
    {
        _delegateToLogic();
    }

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
    )
        external
        nonReentrant
        whenNotFullStop
        whenNotPaused
        onlyTransactionKey
        onlyStatus(paymentIntentId, PaymentStatus.Settled)
    {
        _delegateToLogic();
    }

    function creditMerchantBalance(
        bytes32 paymentIntentId,
        address merchant,
        address token,
        uint256 minAmount,
        address destination,
        bytes calldata noderailsSignature
    ) external nonReentrant whenNotFullStop whenNotPaused {
        _delegateToLogic();
    }

    function settleStuckMerchantBalance(
        bytes32 paymentIntentId,
        address merchant,
        address token,
        uint256 minAmount,
        address destination,
        bytes calldata noderailsSignature
    ) external nonReentrant whenNotFullStop whenNotPaused onlyTransactionKey {
        _delegateToLogic();
    }

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
    ) external nonReentrant whenNotFullStop whenNotPaused onlyTransactionKey {
        _delegateToLogic();
    }

    function withdrawSettlementBalance(
        address merchant,
        address token,
        uint256 amount,
        address destination,
        bytes32 withdrawId,
        uint256 authValidUntil,
        bytes calldata merchantSignature,
        bytes calldata noderailsSignature
    ) external nonReentrant whenNotFullStop whenNotPaused onlyTransactionKey {
        _delegateToLogic();
    }

    function setSwapRouter(address router, bool allowed, SuperAdminProof calldata proof) external whenNotFullStop {
        _setRouter(allowedSwapRouters, ACTION_SET_SWAP_ROUTER, router, allowed, proof);
        emit SwapRouterUpdated(router, allowed);
    }

    function setBridgeRouter(address router, bool allowed, SuperAdminProof calldata proof) external whenNotFullStop {
        _setRouter(allowedBridgeRouters, ACTION_SET_BRIDGE_ROUTER, router, allowed, proof);
        emit BridgeRouterUpdated(router, allowed);
    }

    function setAllowedSettlementToken(address token, bool allowed) external whenNotFullStop onlyAdmin {
        _requireToken(token);
        allowedSettlementTokens[token] = allowed;
        emit AllowedSettlementTokenUpdated(token, allowed);
    }

    function setFeeOnTransferEnabled(bool enabled) external whenNotFullStop onlyAdmin {
        feeOnTransferEnabled = enabled;
        emit FeeOnTransferEnabledUpdated(enabled);
    }

    function setKeyRole(address key, KeyRole role) external {
        require(key != address(0), "Invalid key");
        require(keyRoles[msg.sender] == KeyRole.Admin, "Not admin");
        require(role == KeyRole.None, "Admin can only revoke");
        require(keyRoles[key] == KeyRole.TransactionKey, "Admin can only revoke TX keys");
        require(!isSuperAdminSigner(key), "Cannot modify super admin signer");
        keyRoles[key] = KeyRole.None;
        emit KeyRoleUpdated(key, KeyRole.None);
    }

    function setKeyRole(address key, KeyRole role, SuperAdminProof calldata proof) external whenNotFullStop {
        require(key != address(0), "Invalid key");
        require(role != KeyRole.SuperAdmin, "Cannot assign super admin role");
        require(!isSuperAdminSigner(key), "Cannot modify super admin signer");
        _consumeSuperAdmin(ACTION_SET_KEY_ROLE, keccak256(abi.encode(key, role)), proof);
        keyRoles[key] = role;
        emit KeyRoleUpdated(key, role);
    }

    function setFeeRecipient(address _feeRecipient, SuperAdminProof calldata proof) external whenNotFullStop {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        _consumeSuperAdmin(ACTION_SET_FEE_RECIPIENT, keccak256(abi.encode(_feeRecipient)), proof);
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function pause() external onlyAdminOrSuperAdminSigner { _pause(); }

    function unpause(SuperAdminProof calldata proof) external {
        _consumeSuperAdmin(ACTION_UNPAUSE, bytes32(0), proof);
        _unpause();
    }

    function fullStop() external onlyAdminOrSuperAdminSigner {
        require(!fullStopped, "Already full stopped");
        fullStopped = true;
        emit FullStopped();
    }

    function liftFullStop(SuperAdminProof calldata proof) external {
        require(fullStopped, "Not full stopped");
        _consumeSuperAdmin(ACTION_LIFT_FULL_STOP, bytes32(0), proof);
        _clearEmergencyWithdraw();
        fullStopped = false;
        emit FullStopLifted();
    }

    function rotateSuperAdmin(uint8 index, address next, SuperAdminProof calldata proof) external {
        _consumeSuperAdmin(ACTION_ROTATE_SUPER_ADMIN, keccak256(abi.encode(index, next)), proof);
        _rotateSuperAdminSigner(index, next);
    }

    function initiateEmergencyWithdraw(address[] calldata tokens, address to, SuperAdminProof calldata proof)
        external
        onlyFullStop
    {
        require(to != address(0), "Invalid recipient");
        _consumeSuperAdmin(ACTION_INITIATE_EMERGENCY_WITHDRAW, keccak256(abi.encode(tokens, to)), proof);
        _initiateEmergencyWithdraw(to, tokens);
    }

    function executeEmergencyWithdrawAll(SuperAdminProof calldata proof) external onlyFullStop nonReentrant {
        _requireEmergencyExecutable();
        _consumeSuperAdmin(ACTION_EXECUTE_EMERGENCY_WITHDRAW, bytes32(0), proof);
        address to = emergencyWithdrawTo;
        address[] memory tokens = emergencyWithdrawTokens;
        uint256 nativeAmount = address(this).balance;
        _resetEmergencyWithdrawState();
        if (nativeAmount > 0) {
            _transferOut(address(0), to, nativeAmount);
        }
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) continue;
            uint256 bal = IERC20(tokens[i]).balanceOf(address(this));
            if (bal > 0) {
                _transferOut(tokens[i], to, bal);
            }
        }
        emit EmergencyWithdrawExecuted(to, nativeAmount);
    }

    function cancelEmergencyWithdraw(SuperAdminProof calldata proof) external {
        require(emergencyWithdrawInitiatedAt != 0, "Emergency withdraw not initiated");
        _consumeSuperAdmin(ACTION_CANCEL_EMERGENCY_WITHDRAW, bytes32(0), proof);
        _clearEmergencyWithdraw();
    }

    function getPayment(bytes32 paymentIntentId) external view returns (Payment memory) {
        return payments[paymentIntentId];
    }

    function getKeyRole(address key) external view returns (KeyRole) {
        return keyRoles[key];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function isFullStopped() external view returns (bool) {
        return fullStopped;
    }

    receive() external payable {}
}
