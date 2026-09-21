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
import "./interfaces/INodeRailsMerchantManager.sol";
import "./SuperAdmin3of5.sol";

contract NodeRailsMerchantManager is INodeRailsMerchantManager, EIP712, ReentrancyGuard, Pausable, SuperAdmin3of5 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ============ Constants ============

    string private constant SIGNING_DOMAIN = "NodeRailsMerchantManager";
    string private constant SIGNATURE_VERSION = "1";

    uint16 public constant MAX_FEE_BPS = 1000; // 10% max
    uint256 public constant MAX_BULK_SIZE = 200;

    /// @notice Wallet-visible purpose baked into merchant payout authorization.
    string public constant PAYOUT_AUTH_PURPOSE = "I authorize NodeRails to execute payouts from this wallet";

    /// @notice Chain-agnostic EIP-712 domain so one merchant approval works on every MM.
    bytes32 private constant PAYOUT_AUTH_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant PAYOUT_AUTH_DOMAIN_SEPARATOR = keccak256(
        abi.encode(
            PAYOUT_AUTH_DOMAIN_TYPEHASH,
            keccak256(bytes("NodeRailsPayouts")),
            keccak256(bytes("1")),
            uint256(0),
            address(0)
        )
    );

    bytes32 public constant AUTHORIZE_PAYOUTS_TYPEHASH = keccak256(
        "NodeRailsAuthorizePayouts(address merchantWallet,string purpose,uint256 validUntil)"
    );

    // Payout authorizations: EIP-712 with domain (chain-specific, payoutIntentId prevents replay)
    bytes32 public constant PAYOUT_TYPEHASH = keccak256(
        "Payout(bytes32 payoutIntentId,address merchantWallet,address recipient,address token,uint256 amount,uint16 feeBps)"
    );

    bytes32 public constant NATIVE_PAYOUT_TYPEHASH = keccak256(
        "NativePayout(bytes32 payoutIntentId,address merchantWallet,address recipient,uint256 amount,uint16 feeBps)"
    );

    bytes32 public constant BULK_PAYOUT_TYPEHASH = keccak256(
        "BulkPayout(bytes32 payoutIntentId,address merchantWallet,address token,bytes32 recipientsHash,bytes32 amountsHash,uint16 feeBps)"
    );

    bytes32 public constant BULK_NATIVE_PAYOUT_TYPEHASH = keccak256(
        "BulkNativePayout(bytes32 payoutIntentId,address merchantWallet,bytes32 recipientsHash,bytes32 amountsHash,uint16 feeBps)"
    );

    // ============ Storage ============

    address public feeRecipient;
    bool public fullStopped;

    mapping(bytes32 => PayoutRecord) private _payoutRecords;
    mapping(address => KeyRole) private _keyRoles;
    mapping(address => uint256) private _merchantETHBalances;

    // ============ Modifiers ============

    modifier onlyAdmin() {
        require(_keyRoles[msg.sender] == KeyRole.Admin, "Not admin");
        _;
    }

    /// @dev TransactionKey or Admin — the hot wallet keys that execute payouts
    modifier onlyTransactionKey() {
        require(_isAuthorizedKey(msg.sender), "Not transaction key");
        _;
    }

    /// @dev TransactionKey/Admin/SuperAdmin OR the merchant themselves — for withdrawETH
    modifier onlyTransactionKeyOrMerchant(address merchantWallet) {
        require(
            msg.sender == merchantWallet || _isAuthorizedKey(msg.sender),
            "Not authorized"
        );
        _;
    }

    modifier whenNotFullStop() {
        require(!fullStopped, "Full stop active");
        _;
    }

    modifier onlyFullStop() {
        require(fullStopped, "Not full stopped");
        _;
    }

    // ============ Constructor ============

    constructor(
        address[5] memory _superAdminSigners,
        address[] memory _admins,
        address[] memory _transactionKeys,
        address _feeRecipient
    ) EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) {
        require(_admins.length > 0, "At least one admin required");
        require(_feeRecipient != address(0), "Zero address");

        _initSuperAdminSigners(_superAdminSigners);

        for (uint256 i = 0; i < _admins.length; i++) {
            _grantInitialKey(_admins[i], KeyRole.Admin);
        }
        for (uint256 i = 0; i < _transactionKeys.length; i++) {
            _grantInitialKey(_transactionKeys[i], KeyRole.TransactionKey);
        }

        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function _grantInitialKey(address key, KeyRole role) private {
        require(key != address(0), "Zero address");
        require(!isSuperAdminSigner(key), "Key cannot be super admin signer");
        require(_keyRoles[key] == KeyRole.None, "Duplicate initial key");
        _keyRoles[key] = role;
        emit KeyRoleUpdated(key, role);
    }

    // ============ ETH Deposit / Withdraw ============

    function depositETH(address merchantWallet) external payable whenNotPaused whenNotFullStop {
        require(merchantWallet != address(0), "Zero address");
        require(msg.value > 0, "Zero deposit");
        _merchantETHBalances[merchantWallet] += msg.value;
        emit ETHDeposited(merchantWallet, msg.value);
    }

    function withdrawETH(address merchantWallet, uint256 amount) external nonReentrant whenNotPaused whenNotFullStop onlyTransactionKeyOrMerchant(merchantWallet) {
        require(amount > 0, "Zero amount");
        require(_merchantETHBalances[merchantWallet] >= amount, "Insufficient balance");
        _merchantETHBalances[merchantWallet] -= amount;
        _transferETH(merchantWallet, amount);
        emit ETHWithdrawn(merchantWallet, amount);
    }

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
    ) external nonReentrant whenNotPaused whenNotFullStop onlyTransactionKey {
        require(recipient != address(0), "Zero recipient");
        require(token != address(0), "Zero token");
        require(amount > 0, "Zero amount");
        require(feeBps <= MAX_FEE_BPS, "Fee too high");

        _markPayoutExecuted(payoutIntentId, merchantWallet, amount);
        _verifySession(merchantWallet, sessionExpiry, merchantSignature);
        _verifyNoderailsSignature(
            keccak256(abi.encode(PAYOUT_TYPEHASH, payoutIntentId, merchantWallet, recipient, token, amount, feeBps)),
            noderailsSignature
        );

        _executePermit(token, merchantWallet, permitData);

        uint256 fee = _computeFee(amount, feeBps);

        IERC20(token).safeTransferFrom(merchantWallet, recipient, amount);
        if (fee > 0) {
            IERC20(token).safeTransferFrom(merchantWallet, feeRecipient, fee);
        }

        emit PayoutExecuted(payoutIntentId, merchantWallet, recipient, token, amount, fee);
    }

    function executeNativePayout(
        bytes32 payoutIntentId,
        address merchantWallet,
        address recipient,
        uint256 amount,
        uint16 feeBps,
        uint256 sessionExpiry,
        bytes calldata merchantSignature,
        bytes calldata noderailsSignature
    ) external nonReentrant whenNotPaused whenNotFullStop onlyTransactionKey {
        require(recipient != address(0), "Zero recipient");
        require(amount > 0, "Zero amount");
        require(feeBps <= MAX_FEE_BPS, "Fee too high");

        uint256 fee = _computeFee(amount, feeBps);
        uint256 totalRequired = amount + fee;
        require(_merchantETHBalances[merchantWallet] >= totalRequired, "Insufficient ETH balance");

        _markPayoutExecuted(payoutIntentId, merchantWallet, amount);
        _verifySession(merchantWallet, sessionExpiry, merchantSignature);
        _verifyNoderailsSignature(
            keccak256(abi.encode(NATIVE_PAYOUT_TYPEHASH, payoutIntentId, merchantWallet, recipient, amount, feeBps)),
            noderailsSignature
        );

        _merchantETHBalances[merchantWallet] -= totalRequired;

        _transferETH(recipient, amount);
        if (fee > 0) {
            _transferETH(feeRecipient, fee);
        }

        emit NativePayoutExecuted(payoutIntentId, merchantWallet, recipient, amount, fee);
    }

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
    ) external nonReentrant whenNotPaused whenNotFullStop onlyTransactionKey {
        require(recipients.length == amounts.length, "Length mismatch");
        require(recipients.length > 0, "Empty arrays");
        require(recipients.length <= MAX_BULK_SIZE, "Too many recipients");
        require(token != address(0), "Zero token");
        require(feeBps <= MAX_FEE_BPS, "Fee too high");

        // Pre-validate and compute total
        uint256 totalAmount;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Zero recipient");
            require(amounts[i] > 0, "Zero amount");
            totalAmount += amounts[i];
        }

        _markPayoutExecuted(payoutIntentId, merchantWallet, totalAmount);
        _verifySession(merchantWallet, sessionExpiry, merchantSignature);
        _verifyNoderailsSignature(
            keccak256(abi.encode(
                BULK_PAYOUT_TYPEHASH,
                payoutIntentId,
                merchantWallet,
                token,
                keccak256(abi.encodePacked(recipients)),
                keccak256(abi.encodePacked(amounts)),
                feeBps
            )),
            noderailsSignature
        );

        _executePermit(token, merchantWallet, permitData);

        IERC20 erc20 = IERC20(token);
        uint256 totalFee;

        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 fee = _computeFee(amounts[i], feeBps);
            totalFee += fee;

            erc20.safeTransferFrom(merchantWallet, recipients[i], amounts[i]);

            emit PayoutExecuted(payoutIntentId, merchantWallet, recipients[i], token, amounts[i], fee);
        }

        if (totalFee > 0) {
            erc20.safeTransferFrom(merchantWallet, feeRecipient, totalFee);
        }

        emit BulkPayoutCompleted(payoutIntentId, merchantWallet, token, totalAmount, totalFee, recipients.length);
    }

    function executeBulkNativePayout(
        bytes32 payoutIntentId,
        address merchantWallet,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint16 feeBps,
        uint256 sessionExpiry,
        bytes calldata merchantSignature,
        bytes calldata noderailsSignature
    ) external nonReentrant whenNotPaused whenNotFullStop onlyTransactionKey {
        require(recipients.length == amounts.length, "Length mismatch");
        require(recipients.length > 0, "Empty arrays");
        require(recipients.length <= MAX_BULK_SIZE, "Too many recipients");
        require(feeBps <= MAX_FEE_BPS, "Fee too high");

        uint256 totalAmount;
        uint256 totalFee;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "Zero amount");
            require(recipients[i] != address(0), "Zero recipient");
            totalAmount += amounts[i];
            totalFee += _computeFee(amounts[i], feeBps);
        }
        uint256 totalRequired = totalAmount + totalFee;
        require(_merchantETHBalances[merchantWallet] >= totalRequired, "Insufficient ETH balance");

        _markPayoutExecuted(payoutIntentId, merchantWallet, totalAmount);
        _verifySession(merchantWallet, sessionExpiry, merchantSignature);
        _verifyNoderailsSignature(
            keccak256(abi.encode(
                BULK_NATIVE_PAYOUT_TYPEHASH,
                payoutIntentId,
                merchantWallet,
                keccak256(abi.encodePacked(recipients)),
                keccak256(abi.encodePacked(amounts)),
                feeBps
            )),
            noderailsSignature
        );

        _merchantETHBalances[merchantWallet] -= totalRequired;

        for (uint256 i = 0; i < recipients.length; i++) {
            _transferETH(recipients[i], amounts[i]);

            emit NativePayoutExecuted(payoutIntentId, merchantWallet, recipients[i], amounts[i], _computeFee(amounts[i], feeBps));
        }

        if (totalFee > 0) {
            _transferETH(feeRecipient, totalFee);
        }

        emit BulkNativePayoutCompleted(payoutIntentId, merchantWallet, totalAmount, totalFee, recipients.length);
    }

    // ============ Admin Functions ============

    function setKeyRole(address key, KeyRole role) external {
        require(key != address(0), "Zero address");
        require(_keyRoles[msg.sender] == KeyRole.Admin, "Not admin");
        require(role == KeyRole.None, "Admin can only revoke");
        require(_keyRoles[key] == KeyRole.TransactionKey, "Admin can only revoke TX keys");
        require(!isSuperAdminSigner(key), "Cannot modify super admin signer");
        _keyRoles[key] = KeyRole.None;
        emit KeyRoleUpdated(key, KeyRole.None);
    }

    function setKeyRole(address key, KeyRole role, SuperAdminProof calldata proof) external whenNotFullStop {
        require(key != address(0), "Zero address");
        require(role != KeyRole.SuperAdmin, "Cannot assign super admin role");
        require(!isSuperAdminSigner(key), "Cannot modify super admin signer");
        _consumeSuperAdmin(ACTION_SET_KEY_ROLE, keccak256(abi.encode(key, role)), proof);
        _keyRoles[key] = role;
        emit KeyRoleUpdated(key, role);
    }

    function setFeeRecipient(address _feeRecipient, SuperAdminProof calldata proof) external whenNotFullStop {
        require(_feeRecipient != address(0), "Zero address");
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
        require(!fullStopped, "Full stop active");
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
            _transferETH(to, nativeAmount);
        }
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) continue;
            uint256 bal = IERC20(tokens[i]).balanceOf(address(this));
            if (bal > 0) {
                IERC20(tokens[i]).safeTransfer(to, bal);
            }
        }
        emit EmergencyWithdrawExecuted(to, nativeAmount);
    }

    function cancelEmergencyWithdraw(SuperAdminProof calldata proof) external {
        require(emergencyWithdrawInitiatedAt != 0, "Emergency withdraw not initiated");
        _consumeSuperAdmin(ACTION_CANCEL_EMERGENCY_WITHDRAW, bytes32(0), proof);
        _clearEmergencyWithdraw();
    }

    function _isAdminOrSuperAdminSigner(address account) internal view override returns (bool) {
        return _keyRoles[account] == KeyRole.Admin || isSuperAdminSigner(account);
    }

    // ============ View Functions ============

    function merchantETHBalance(address merchantWallet) external view returns (uint256) {
        return _merchantETHBalances[merchantWallet];
    }

    function isPayoutExecuted(bytes32 payoutIntentId) external view returns (bool) {
        return _payoutRecords[payoutIntentId].executed;
    }

    function getPayoutRecord(bytes32 payoutIntentId) external view returns (PayoutRecord memory) {
        return _payoutRecords[payoutIntentId];
    }

    function getKeyRole(address key) external view returns (KeyRole) {
        return _keyRoles[key];
    }

    function isFullStopped() external view returns (bool) {
        return fullStopped;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ============ Internal Functions ============

    function _markPayoutExecuted(bytes32 payoutIntentId, address _merchantWallet, uint256 _totalAmount) internal {
        require(!_payoutRecords[payoutIntentId].executed, "Payout already executed");
        _payoutRecords[payoutIntentId] = PayoutRecord({
            executed: true,
            merchantWallet: _merchantWallet,
            totalAmount: _totalAmount,
            executedAt: block.timestamp
        });
    }

    function payoutAuthDomainSeparator() public pure returns (bytes32) {
        return PAYOUT_AUTH_DOMAIN_SEPARATOR;
    }

    function _verifySession(
        address merchantWallet,
        uint256 sessionExpiry,
        bytes calldata signature
    ) internal view {
        require(sessionExpiry > block.timestamp, "Session expired");
        bytes32 structHash = keccak256(
            abi.encode(
                AUTHORIZE_PAYOUTS_TYPEHASH,
                merchantWallet,
                keccak256(bytes(PAYOUT_AUTH_PURPOSE)),
                sessionExpiry
            )
        );
        bytes32 digest = MessageHashUtils.toTypedDataHash(PAYOUT_AUTH_DOMAIN_SEPARATOR, structHash);
        address recovered = ECDSA.recover(digest, signature);
        require(recovered == merchantWallet, "Invalid merchant signature");
    }

    function _verifyNoderailsSignature(bytes32 structHash, bytes calldata signature) internal view {
        address signer = _hashTypedDataV4(structHash).recover(signature);
        require(_keyRoles[signer] == KeyRole.TransactionKey, "Invalid platform signature");
    }

    function _isAuthorizedKey(address key) internal view returns (bool) {
        KeyRole role = _keyRoles[key];
        return role == KeyRole.TransactionKey || role == KeyRole.Admin;
    }

    function _executePermit(
        address token,
        address owner,
        PermitData calldata permitData
    ) internal {
        if (permitData.deadline > 0) {
            try IERC20Permit(token).permit(
                owner, address(this), permitData.amount, permitData.deadline, permitData.v, permitData.r, permitData.s
            ) {} catch {}
        }
    }

    function _computeFee(uint256 amount, uint16 feeBps) internal pure returns (uint256 fee) {
        fee = (amount * feeBps) / 10000;
    }

    function _transferETH(address to, uint256 amount) internal {
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    receive() external payable {
        revert("Use depositETH");
    }
}
