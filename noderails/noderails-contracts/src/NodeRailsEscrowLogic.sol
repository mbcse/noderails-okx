// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./NodeRailsEscrowBase.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Payment / convert / dest-settle / bank / withdraw bodies. Called only via Escrow DELEGATECALL.
/// @dev No modifiers here — Escrow wrappers enforce pause, fullStop, reentrancy, and roles.
contract NodeRailsEscrowLogic is NodeRailsEscrowBase {
    constructor() NodeRailsEscrowBase() {}

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
    ) external {
        _requireToken(sourceToken);
        require(amountIn > 0, "Invalid amount");
        _requirePayer(payer);
        _validateConvertCapture(
            paymentIntentId, merchant, settlementToken, minAmountOut, router, swapCalldataHash, feeBps, timelocks, swapCalldata
        );

        bytes32 nonce = _useNonce(paymentIntentId, false);
        _verifyCaptureAndConvert(
            paymentIntentId, merchant, sourceToken, amountIn, settlementToken, minAmountOut,
            router, swapCalldataHash, feeBps, timelocks, nonce, noderailsSignature
        );

        _executePermit(sourceToken, payer, permitData);
        uint256 received = _transferInMeasured(sourceToken, payer, amountIn);

        uint256 amountOut = _executeSwap(sourceToken, received, settlementToken, minAmountOut, router, swapCalldata);
        _storeConvertedPayment(paymentIntentId, merchant, payer, settlementToken, amountOut, feeBps, timelocks);
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
    ) external payable {
        require(msg.value > 0, "No ETH sent");
        _validateConvertCapture(
            paymentIntentId, merchant, settlementToken, minAmountOut, router, swapCalldataHash, feeBps, timelocks, swapCalldata
        );

        bytes32 nonce = _useNonce(paymentIntentId, true);
        _verifyCaptureAndConvert(
            paymentIntentId, merchant, address(0), msg.value, settlementToken, minAmountOut,
            router, swapCalldataHash, feeBps, timelocks, nonce, noderailsSignature
        );

        uint256 amountOut = _executeSwap(address(0), msg.value, settlementToken, minAmountOut, router, swapCalldata);
        _storeConvertedPayment(paymentIntentId, merchant, msg.sender, settlementToken, amountOut, feeBps, timelocks);
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
    ) external {
        Payment storage payment = payments[paymentIntentId];
        uint256 leftover = settleAmount[paymentIntentId];
        _requireDestSettle(paymentIntentId, payment, token, minDestinationAmount, destination);

        _verifyNoderailsSignature(
            keccak256(abi.encode(
                SETTLE_TO_MERCHANT_BALANCE_TYPEHASH,
                paymentIntentId,
                leftover,
                token,
                settlementChainId,
                settlementEscrow,
                router,
                bridgeCalldataHash,
                minDestinationAmount,
                destination
            )),
            noderailsSignature
        );

        payment.status = PaymentStatus.Settled;

        if (settlementChainId != block.chainid) {
            settleBridgeLastAttemptAt[paymentIntentId] = block.timestamp;
            _bridgeToRouter(payment.token, leftover, router, bridgeCalldataHash, bridgeCalldata);
            emit SettledToMerchantBalance(paymentIntentId, payment.merchant, leftover, 0, true);
            emit PaymentSettled(paymentIntentId, payment.merchant, leftover, 0);
        } else {
            require(settlementEscrow == address(this), "Invalid escrow");
            require(!settlementCreditConsumed[paymentIntentId], "Credit already consumed");
            settlementCreditConsumed[paymentIntentId] = true;
            settleAmount[paymentIntentId] = 0;
            uint256 feeLeftover = _applyDestCredit(
                payment.merchant, payment.token, minDestinationAmount, leftover, destination
            );
            emit SettledToMerchantBalance(paymentIntentId, payment.merchant, minDestinationAmount, feeLeftover, false);
            emit PaymentSettled(paymentIntentId, payment.merchant, minDestinationAmount, feeLeftover);
        }
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
    ) external {
        Payment storage payment = payments[paymentIntentId];
        uint256 leftover = settleAmount[paymentIntentId];
        _requireDestSettle(paymentIntentId, payment, token, minDestinationAmount, destination);
        require(settlementChainId != block.chainid, "Retry is bridge-only");
        uint256 retryNonce = settleBridgeRetryCount[paymentIntentId];
        require(retryNonce < MAX_SETTLE_BRIDGE_RETRIES, "Retry limit reached");
        uint256 lastAttempt = settleBridgeLastAttemptAt[paymentIntentId];
        require(lastAttempt != 0 && block.timestamp >= lastAttempt + SETTLE_BRIDGE_RETRY_DELAY, "Retry delay");
        require(IERC20(payment.token).balanceOf(address(this)) >= leftover, "Insufficient token balance");

        _verifyNoderailsSignature(
            keccak256(abi.encode(
                RETRY_SETTLE_TO_MERCHANT_BALANCE_TYPEHASH,
                paymentIntentId,
                leftover,
                token,
                settlementChainId,
                settlementEscrow,
                router,
                bridgeCalldataHash,
                minDestinationAmount,
                destination,
                retryNonce
            )),
            noderailsSignature
        );

        settleBridgeRetryCount[paymentIntentId] = retryNonce + 1;
        settleBridgeLastAttemptAt[paymentIntentId] = block.timestamp;
        _bridgeToRouter(payment.token, leftover, router, bridgeCalldataHash, bridgeCalldata);
        emit SettlementBridgeRetried(
            paymentIntentId, payment.merchant, leftover, settleBridgeRetryCount[paymentIntentId]
        );
    }

    function creditMerchantBalance(
        bytes32 paymentIntentId,
        address merchant,
        address token,
        uint256 minAmount,
        address destination,
        bytes calldata noderailsSignature
    ) external {
        _consumeSettlementCredit(paymentIntentId, merchant, token, minAmount, destination, noderailsSignature);
        uint256 received = _pullOrMeasureToken(token, minAmount);
        uint256 leftover = _applyDestCredit(merchant, token, minAmount, received, destination);
        emit MerchantBalanceCredited(paymentIntentId, merchant, token, minAmount);
        emit DestFeeTaken(paymentIntentId, leftover);
    }

    function settleStuckMerchantBalance(
        bytes32 paymentIntentId,
        address merchant,
        address token,
        uint256 minAmount,
        address destination,
        bytes calldata noderailsSignature
    ) external {
        _consumeSettlementCredit(paymentIntentId, merchant, token, minAmount, destination, noderailsSignature);
        require(IERC20(token).balanceOf(address(this)) >= minAmount, "Insufficient token balance");
        _applyDestCredit(merchant, token, minAmount, minAmount, destination);
        emit StuckMerchantBalanceSettled(paymentIntentId, merchant, token, minAmount, destination);
        emit MerchantBalanceCredited(paymentIntentId, merchant, token, minAmount);
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
    ) external {
        require(paymentIntentId != bytes32(0), "Invalid payment intent");
        require(depositAddress != address(0), "Invalid deposit address");
        require(!bankSettlementConsumed[bankSettlementId], "Bank settlement already executed");
        _requireSettlementSendAuth(merchant, token, amount, authValidUntil, merchantSignature);
        _verifyNoderailsSignature(
            keccak256(abi.encode(
                SETTLE_TO_BANK_TYPEHASH,
                paymentIntentId,
                merchant,
                token,
                amount,
                depositAddress,
                bankSettlementId
            )),
            noderailsSignature
        );
        bankSettlementConsumed[bankSettlementId] = true;
        _debitAndTransferSettlement(merchant, token, amount, depositAddress);
        emit SettledToBank(paymentIntentId, bankSettlementId, merchant, depositAddress, token, amount);
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
    ) external {
        require(destination != address(0), "Invalid destination");
        require(!withdrawSettlementConsumed[withdrawId], "Withdraw already executed");
        _requireSettlementSendAuth(merchant, token, amount, authValidUntil, merchantSignature);
        _verifyNoderailsSignature(
            keccak256(abi.encode(
                WITHDRAW_SETTLEMENT_BALANCE_TYPEHASH,
                merchant,
                token,
                amount,
                destination,
                withdrawId
            )),
            noderailsSignature
        );
        withdrawSettlementConsumed[withdrawId] = true;
        _debitAndTransferSettlement(merchant, token, amount, destination);
        emit SettlementBalanceWithdrawn(withdrawId, merchant, destination, token, amount);
    }

    function captureNativePayment(
        bytes32 paymentIntentId,
        address merchant,
        uint16 feeBps,
        Timelocks timelocks,
        bytes calldata noderailsSignature
    ) external payable {
        require(msg.value > 0, "No ETH sent");
        _requireNewCapture(paymentIntentId, merchant, feeBps, timelocks);

        bytes32 nonce = _useNonce(paymentIntentId, true);
        _verifyNoderailsSignature(
            keccak256(abi.encode(
                CAPTURE_NATIVE_TYPEHASH,
                paymentIntentId,
                merchant,
                msg.value,
                feeBps,
                Timelocks.unwrap(timelocks),
                nonce
            )),
            noderailsSignature
        );

        _storeCaptured(paymentIntentId, merchant, msg.sender, address(0), msg.value, feeBps, timelocks);
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
    ) external {
        require(amount > 0, "Invalid amount");
        _requireToken(token);
        _requirePayer(payer);
        _requireNewCapture(paymentIntentId, merchant, feeBps, timelocks);

        bytes32 nonce = _useNonce(paymentIntentId, false);
        _verifyNoderailsSignature(
            keccak256(abi.encode(
                CAPTURE_ERC20_TYPEHASH,
                paymentIntentId,
                merchant,
                token,
                amount,
                payer,
                feeBps,
                Timelocks.unwrap(timelocks),
                nonce
            )),
            noderailsSignature
        );

        _executePermit(token, payer, permitData);
        uint256 received = _transferInMeasured(token, payer, amount);
        _storeCaptured(paymentIntentId, merchant, payer, token, received, feeBps, timelocks);
    }

    function settlePayment(bytes32 paymentIntentId) external {
        Payment storage payment = payments[paymentIntentId];
        uint256 leftover = settleAmount[paymentIntentId];
        require(leftover > 0, "Nothing to settle");
        payment.status = PaymentStatus.Settled;
        settleAmount[paymentIntentId] = 0;

        (uint256 merchantAmount, uint256 fee) = _payFeeSplit(
            payment.token, payment.merchant, leftover, payment.feeBps
        );

        emit PaymentSettled(paymentIntentId, payment.merchant, merchantAmount, fee);
    }

    function initiateDispute(bytes32 paymentIntentId) external {
        Payment storage payment = payments[paymentIntentId];
        payment.status = PaymentStatus.Disputed;
        emit DisputeInitiated(paymentIntentId, payment.merchant, payment.payer);
    }

    function resolveDispute(bytes32 paymentIntentId, address winner) external {
        Payment storage payment = payments[paymentIntentId];
        require(winner == payment.merchant || winner == payment.payer, "Invalid winner");
        uint256 leftover = settleAmount[paymentIntentId];

        if (winner == payment.merchant) {
            payment.status = PaymentStatus.Settled;
            settleAmount[paymentIntentId] = 0;
            (uint256 merchantAmount, uint256 fee) = _payFeeSplit(
                payment.token, payment.merchant, leftover, payment.feeBps
            );
            emit DisputeResolved(paymentIntentId, winner, merchantAmount, fee);
        } else {
            payment.status = PaymentStatus.Refunded;
            settleAmount[paymentIntentId] = 0;
            _transferOut(payment.token, payment.payer, leftover);
            emit DisputeResolved(paymentIntentId, winner, leftover, 0);
        }
    }

    function refundPayment(bytes32 paymentIntentId) external {
        _refundSettleAmount(paymentIntentId, settleAmount[paymentIntentId]);
    }

    function refundPaymentAmount(bytes32 paymentIntentId, uint256 amt) external {
        _refundSettleAmount(paymentIntentId, amt);
    }

    function _refundSettleAmount(bytes32 paymentIntentId, uint256 amt) internal {
        Payment storage payment = payments[paymentIntentId];
        uint256 leftover = settleAmount[paymentIntentId];
        require(amt > 0 && amt <= leftover, "Invalid refund amount");
        leftover -= amt;
        settleAmount[paymentIntentId] = leftover;
        if (leftover == 0) {
            payment.status = PaymentStatus.Refunded;
        }
        _transferOut(payment.token, payment.payer, amt);
        emit PaymentRefunded(paymentIntentId, payment.payer, amt, leftover);
    }

    function getPayment(bytes32 paymentIntentId) external view returns (Payment memory) {
        return payments[paymentIntentId];
    }

    function getKeyRole(address key) external view returns (KeyRole) {
        return keyRoles[key];
    }

    function fullStop() external {
        revert("Not escrow");
    }

    function isFullStopped() external view returns (bool) {
        return fullStopped;
    }
}
