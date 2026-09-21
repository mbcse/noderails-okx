// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title SuperAdmin3of5
 * @notice Inherited 3-of-5 SuperAdmin verification. Not a separately deployed contract.
 *         EIP-712 domain is NodeRailsWarRoom v1 with chainId 0 and verifyingContract 0
 *         so one signature set can cover many chains when `targets` lists each pair.
 */
abstract contract SuperAdmin3of5 {
    using ECDSA for bytes32;

    uint256 public constant SUPER_ADMIN_SIGNER_COUNT = 5;
    uint256 public constant SUPER_ADMIN_THRESHOLD = 3;
    uint256 public constant EMERGENCY_WITHDRAW_DELAY = 24 hours;
    uint256 public constant SIG_LENGTH = 65;
    uint256 public constant PACKED_SIGS_LENGTH = 195;

    struct ChainTarget {
        uint256 chainId;
        address contractAddress;
    }

    struct SuperAdminProof {
        uint256 nonce;
        uint256 deadline;
        ChainTarget[] targets;
        bytes signatures;
    }

    bytes32 private constant WAR_ROOM_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant WAR_ROOM_DOMAIN_SEPARATOR = keccak256(
        abi.encode(
            WAR_ROOM_DOMAIN_TYPEHASH,
            keccak256(bytes("NodeRailsWarRoom")),
            keccak256(bytes("1")),
            uint256(0),
            address(0)
        )
    );

    bytes32 private constant CHAIN_TARGET_TYPEHASH =
        keccak256("ChainTarget(uint256 chainId,address contract)");

    bytes32 public constant SUPER_ADMIN_ACTION_TYPEHASH = keccak256(
        "SuperAdminAction(bytes32 action,bytes32 argsHash,uint256 nonce,uint256 deadline,ChainTarget[] targets)ChainTarget(uint256 chainId,address contract)"
    );

    bytes32 public constant ACTION_SET_SWAP_ROUTER = keccak256("setSwapRouter");
    bytes32 public constant ACTION_SET_BRIDGE_ROUTER = keccak256("setBridgeRouter");
    bytes32 public constant ACTION_SET_FEE_RECIPIENT = keccak256("setFeeRecipient");
    bytes32 public constant ACTION_SET_KEY_ROLE = keccak256("setKeyRole");
    bytes32 public constant ACTION_UNPAUSE = keccak256("unpause");
    bytes32 public constant ACTION_LIFT_FULL_STOP = keccak256("liftFullStop");
    bytes32 public constant ACTION_ROTATE_SUPER_ADMIN = keccak256("rotateSuperAdmin");
    bytes32 public constant ACTION_INITIATE_EMERGENCY_WITHDRAW = keccak256("initiateEmergencyWithdraw");
    bytes32 public constant ACTION_EXECUTE_EMERGENCY_WITHDRAW = keccak256("executeEmergencyWithdrawAll");
    bytes32 public constant ACTION_CANCEL_EMERGENCY_WITHDRAW = keccak256("cancelEmergencyWithdraw");

    address[5] private _superAdminSigners;
    mapping(uint256 => bool) public usedSuperAdminNonces;

    address public emergencyWithdrawTo;
    address[] public emergencyWithdrawTokens;
    uint256 public emergencyWithdrawInitiatedAt;

    event SuperAdminSignerUpdated(uint8 indexed index, address indexed previous, address indexed next);
    event EmergencyWithdrawInitiated(address indexed to, address[] tokens, uint256 executableAt);
    event EmergencyWithdrawExecuted(address indexed to, uint256 nativeAmount);
    event EmergencyWithdrawCancelled();

    function warRoomDomainSeparator() public pure returns (bytes32) {
        return WAR_ROOM_DOMAIN_SEPARATOR;
    }

    function superAdminSigner(uint256 index) public view returns (address) {
        require(index < SUPER_ADMIN_SIGNER_COUNT, "Invalid signer index");
        return _superAdminSigners[index];
    }

    function isSuperAdminSigner(address account) public view returns (bool) {
        if (account == address(0)) return false;
        for (uint256 i = 0; i < SUPER_ADMIN_SIGNER_COUNT; i++) {
            if (_superAdminSigners[i] == account) return true;
        }
        return false;
    }

    function hashSuperAdminAction(
        bytes32 action,
        bytes32 argsHash,
        uint256 nonce,
        uint256 deadline,
        ChainTarget[] memory targets
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                SUPER_ADMIN_ACTION_TYPEHASH,
                action,
                argsHash,
                nonce,
                deadline,
                _hashTargets(targets)
            )
        );
    }

    function _initSuperAdminSigners(address[5] memory signers) internal {
        for (uint256 i = 0; i < SUPER_ADMIN_SIGNER_COUNT; i++) {
            require(signers[i] != address(0), "Invalid super admin signer");
            for (uint256 j = 0; j < i; j++) {
                require(signers[i] != signers[j], "Duplicate super admin signer");
            }
            _superAdminSigners[i] = signers[i];
            emit SuperAdminSignerUpdated(uint8(i), address(0), signers[i]);
        }
    }

    modifier onlyAdminOrSuperAdminSigner() {
        require(_isAdminOrSuperAdminSigner(msg.sender), "Not admin or super admin signer");
        _;
    }

    function _isAdminOrSuperAdminSigner(address account) internal view virtual returns (bool);

    function _consumeSuperAdmin(bytes32 action, bytes32 argsHash, SuperAdminProof calldata proof) internal {
        _consumeSuperAdmin(action, argsHash, proof.nonce, proof.deadline, proof.targets, proof.signatures);
    }

    function _consumeSuperAdmin(
        bytes32 action,
        bytes32 argsHash,
        uint256 nonce,
        uint256 deadline,
        ChainTarget[] calldata targets,
        bytes calldata signatures
    ) internal {
        require(deadline >= block.timestamp, "Signature expired");
        require(!usedSuperAdminNonces[nonce], "Nonce already used");
        require(signatures.length == PACKED_SIGS_LENGTH, "Need 3 signatures");
        require(_targetsIncludeThis(targets), "This contract not in targets");

        bytes32 digest = MessageHashUtils.toTypedDataHash(
            WAR_ROOM_DOMAIN_SEPARATOR,
            hashSuperAdminAction(action, argsHash, nonce, deadline, _copyTargets(targets))
        );

        address[3] memory recovered;
        for (uint256 i = 0; i < SUPER_ADMIN_THRESHOLD; i++) {
            bytes memory sig = signatures[i * SIG_LENGTH:(i + 1) * SIG_LENGTH];
            address signer = digest.recover(sig);
            require(isSuperAdminSigner(signer), "Not a super admin signer");
            for (uint256 j = 0; j < i; j++) {
                require(recovered[j] != signer, "Duplicate signer");
            }
            recovered[i] = signer;
        }

        usedSuperAdminNonces[nonce] = true;
    }

    function _rotateSuperAdminSigner(uint8 index, address next) internal {
        require(index < SUPER_ADMIN_SIGNER_COUNT, "Invalid signer index");
        require(next != address(0), "Invalid super admin signer");
        require(!isSuperAdminSigner(next), "Signer already set");
        address previous = _superAdminSigners[index];
        _superAdminSigners[index] = next;
        emit SuperAdminSignerUpdated(index, previous, next);
    }

    function _initiateEmergencyWithdraw(address to, address[] calldata tokens) internal {
        require(to != address(0), "Invalid recipient");
        emergencyWithdrawTo = to;
        delete emergencyWithdrawTokens;
        for (uint256 i = 0; i < tokens.length; i++) {
            emergencyWithdrawTokens.push(tokens[i]);
        }
        emergencyWithdrawInitiatedAt = block.timestamp;
        emit EmergencyWithdrawInitiated(to, tokens, block.timestamp + EMERGENCY_WITHDRAW_DELAY);
    }

    function _requireEmergencyExecutable() internal view {
        require(emergencyWithdrawInitiatedAt != 0, "Emergency withdraw not initiated");
        require(
            block.timestamp >= emergencyWithdrawInitiatedAt + EMERGENCY_WITHDRAW_DELAY,
            "Emergency withdraw delay"
        );
        require(emergencyWithdrawTo != address(0), "Invalid recipient");
    }

    function _resetEmergencyWithdrawState() internal {
        delete emergencyWithdrawTo;
        delete emergencyWithdrawTokens;
        emergencyWithdrawInitiatedAt = 0;
    }

    function _clearEmergencyWithdraw() internal {
        bool had = emergencyWithdrawInitiatedAt != 0;
        _resetEmergencyWithdrawState();
        if (had) emit EmergencyWithdrawCancelled();
    }

    function emergencyWithdrawTokenCount() external view returns (uint256) {
        return emergencyWithdrawTokens.length;
    }

    function _targetsIncludeThis(ChainTarget[] calldata targets) private view returns (bool) {
        for (uint256 i = 0; i < targets.length; i++) {
            if (targets[i].chainId == block.chainid && targets[i].contractAddress == address(this)) {
                return true;
            }
        }
        return false;
    }

    function _copyTargets(ChainTarget[] calldata targets) private pure returns (ChainTarget[] memory copy) {
        copy = new ChainTarget[](targets.length);
        for (uint256 i = 0; i < targets.length; i++) {
            copy[i] = targets[i];
        }
    }

    function _hashTargets(ChainTarget[] memory targets) private pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](targets.length);
        for (uint256 i = 0; i < targets.length; i++) {
            hashes[i] = keccak256(
                abi.encode(CHAIN_TARGET_TYPEHASH, targets[i].chainId, targets[i].contractAddress)
            );
        }
        return keccak256(abi.encodePacked(hashes));
    }
}
