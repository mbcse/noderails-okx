// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

abstract contract LibEnvParse is Script {
    function _parseAddresses(string memory envKey, string memory zeroMessage) internal view returns (address[] memory) {
        string memory raw = vm.envString(envKey);
        bytes memory b = bytes(raw);
        require(b.length > 0, string.concat(envKey, " not set"));

        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ",") count++;
        }

        string[] memory parts = new string[](count);
        uint256 start = 0;
        uint256 idx = 0;
        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ",") {
                bytes memory part = new bytes(i - start);
                for (uint256 j = start; j < i; j++) {
                    part[j - start] = b[j];
                }
                parts[idx] = string(part);
                idx++;
                start = i + 1;
            }
        }

        address[] memory addrs = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            addrs[i] = vm.parseAddress(parts[i]);
            require(addrs[i] != address(0), zeroMessage);
        }
        return addrs;
    }

    function _parseAddressesOptional(string memory envKey, string memory zeroMessage) internal view returns (address[] memory) {
        string memory raw;
        try vm.envString(envKey) returns (string memory value) {
            raw = value;
        } catch {
            return new address[](0);
        }
        if (bytes(raw).length == 0) return new address[](0);
        return _parseAddresses(envKey, zeroMessage);
    }

    function _parseSuperAdminSigners() internal view returns (address[5] memory signers) {
        address[] memory addrs = _parseAddresses("SUPER_ADMIN_ADDRESSES", "Invalid address in SUPER_ADMIN_ADDRESSES");
        require(addrs.length == 5, "SUPER_ADMIN_ADDRESSES must have exactly 5 addresses");
        for (uint256 i = 0; i < 5; i++) {
            signers[i] = addrs[i];
        }
    }

    function _requireNotSigners(address[] memory keys, address[5] memory signers, string memory message) internal pure {
        for (uint256 i = 0; i < keys.length; i++) {
            for (uint256 j = 0; j < 5; j++) {
                require(keys[i] != signers[j], message);
            }
        }
    }

    function _requireAdminsNotSigners(address[] memory admins, address[5] memory signers) internal pure {
        _requireNotSigners(admins, signers, "Admin cannot be super admin signer");
    }

    function _requireNoOverlap(address[] memory left, address[] memory right, string memory message) internal pure {
        for (uint256 i = 0; i < left.length; i++) {
            for (uint256 j = 0; j < right.length; j++) {
                require(left[i] != right[j], message);
            }
        }
    }
}
