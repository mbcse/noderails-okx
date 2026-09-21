// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @dev Timelocks for NodeRails payment escrow.
 * Timelocks store the number of seconds from the time the payment is captured to the start of a specific period.
 * 
 * struct PaymentTimelocks {
 *     uint256 disputeStart;   // Period when dispute window opens
 *     uint256 settlement;     // Period when settlement is allowed (dispute window closes)
 * }
 * 
 * Timeline:
 * |---Captured---|---DisputeStart---|---Settlement---|
 *                ^                  ^
 *            dispute opens     dispute closes, settlement allowed
 * 
 * - Dispute can be raised: after DisputeStart, before Settlement
 * - Settlement can happen: after Settlement
 */
type Timelocks is uint256;

/**
 * @title TimelocksLib
 * @notice Library for compact storage of timelocks in a uint256 for NodeRails payments
 * @dev Layout (from high bits to low bits):
 *      [224-255] capturedAt (32 bits) - timestamp when captured
 *      [64-95]   settlement (32 bits) - seconds until settlement allowed
 *      [32-63]   disputeStart (32 bits) - seconds until dispute window opens
 */
library TimelocksLib {
    
    enum Stage {
        DisputeStart,   // When dispute window opens
        Settlement      // When settlement allowed / dispute window closes
    }

    uint256 private constant _CAPTURED_AT_MASK = 0xffffffff00000000000000000000000000000000000000000000000000000000;
    uint256 private constant _CAPTURED_AT_OFFSET = 224;

    /**
     * @notice Sets the captured timestamp
     * @param timelocks The timelocks to set the timestamp on
     * @param value The capture timestamp
     * @return The timelocks with the timestamp set
     */
    function setCapturedAt(Timelocks timelocks, uint256 value) internal pure returns (Timelocks) {
        return Timelocks.wrap(
            (Timelocks.unwrap(timelocks) & ~_CAPTURED_AT_MASK) | (value << _CAPTURED_AT_OFFSET)
        );
    }

    /**
     * @notice Returns the captured timestamp
     * @param timelocks The timelocks to get the timestamp from
     * @return The captured timestamp
     */
    function getCapturedAt(Timelocks timelocks) internal pure returns (uint256) {
        return Timelocks.unwrap(timelocks) >> _CAPTURED_AT_OFFSET;
    }

    /**
     * @notice Returns the absolute timestamp for the given stage
     * @param timelocks The timelocks to get the value from
     * @param stage The stage to get the value for
     * @return The absolute timestamp when the stage is reached
     */
    function get(Timelocks timelocks, Stage stage) internal pure returns (uint256) {
        uint256 data = Timelocks.unwrap(timelocks);
        uint256 capturedAt = data >> _CAPTURED_AT_OFFSET;
        uint256 bitShift = (uint256(stage) + 1) * 32; // +1 because slot 0 is reserved
        return capturedAt + uint32(data >> bitShift);
    }

    /**
     * @notice Creates timelocks with the given durations
     * @param capturedAt Timestamp when payment was captured
     * @param disputeStart Seconds until dispute window opens (usually 0)
     * @param settlement Seconds until settlement allowed
     * @return The packed timelocks value
     */
    function init(
        uint256 capturedAt,
        uint256 disputeStart,
        uint256 settlement
    ) internal pure returns (Timelocks) {
        return Timelocks.wrap(
            (capturedAt << _CAPTURED_AT_OFFSET) |
            (settlement << 64) |
            (disputeStart << 32)
        );
    }

    /**
     * @notice Creates timelocks with default configuration (dispute starts immediately)
     * @param capturedAt Timestamp when payment was captured
     * @param timelockDuration Duration until settlement (and dispute window closes)
     * @return The packed timelocks value
     */
    function initWithDuration(
        uint256 capturedAt,
        uint256 timelockDuration
    ) internal pure returns (Timelocks) {
        return init(
            capturedAt,
            0,                    // disputeStart: immediately
            timelockDuration      // settlement: after timelock duration
        );
    }
}
