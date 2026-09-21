// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SuperAdmin3of5.sol";
import "../src/NodeRailsEscrow.sol";
import "../src/NodeRailsMerchantManager.sol";
import "../src/interfaces/INodeRailsEscrow.sol";
import "../src/interfaces/INodeRailsMerchantManager.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

abstract contract SuperAdminTestBase is Test {
    address[5] internal sa;
    uint256[5] internal saKey;
    uint256 internal nextSaNonce = 1;

    function _initSuperAdminSigners() internal {
        for (uint256 i = 0; i < 5; i++) {
            (sa[i], saKey[i]) = makeAddrAndKey(string.concat("sa", vm.toString(i)));
        }
    }

    function _saSigners() internal view returns (address[5] memory) {
        return sa;
    }

    function _empty() internal pure returns (address[] memory addrs) {
        addrs = new address[](0);
    }

    function _one(address account) internal pure returns (address[] memory addrs) {
        addrs = new address[](1);
        addrs[0] = account;
    }

    function _newEscrow(address[] memory admins, address[] memory txKeys, address fee)
        internal
        returns (NodeRailsEscrow)
    {
        return new NodeRailsEscrow(_saSigners(), admins, txKeys, fee, _empty(), _empty(), _empty());
    }

    function _newEscrow(
        address[] memory admins,
        address[] memory txKeys,
        address fee,
        address[] memory swapRouters,
        address[] memory bridgeRouters,
        address[] memory settlementTokens
    ) internal returns (NodeRailsEscrow) {
        return new NodeRailsEscrow(_saSigners(), admins, txKeys, fee, swapRouters, bridgeRouters, settlementTokens);
    }

    function _newMM(address[] memory admins, address[] memory txKeys, address fee)
        internal
        returns (NodeRailsMerchantManager)
    {
        return new NodeRailsMerchantManager(_saSigners(), admins, txKeys, fee);
    }

    function _thisTargets(address target) internal view returns (SuperAdmin3of5.ChainTarget[] memory targets) {
        targets = new SuperAdmin3of5.ChainTarget[](1);
        targets[0] = SuperAdmin3of5.ChainTarget({chainId: block.chainid, contractAddress: target});
    }

    function _pack3(bytes32 digest) internal view returns (bytes memory) {
        (uint8 v0, bytes32 r0, bytes32 s0) = vm.sign(saKey[0], digest);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(saKey[1], digest);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(saKey[2], digest);
        return abi.encodePacked(r0, s0, v0, r1, s1, v1, r2, s2, v2);
    }

    bytes32 private constant TEST_CHAIN_TARGET_TYPEHASH =
        keccak256("ChainTarget(uint256 chainId,address contract)");
    bytes32 private constant TEST_SUPER_ADMIN_ACTION_TYPEHASH = keccak256(
        "SuperAdminAction(bytes32 action,bytes32 argsHash,uint256 nonce,uint256 deadline,ChainTarget[] targets)ChainTarget(uint256 chainId,address contract)"
    );
    bytes32 private constant TEST_WAR_ROOM_DOMAIN_SEPARATOR = keccak256(
        abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("NodeRailsWarRoom")),
            keccak256(bytes("1")),
            uint256(0),
            address(0)
        )
    );

    function _hashTargetsLocal(SuperAdmin3of5.ChainTarget[] memory targets) private pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](targets.length);
        for (uint256 i = 0; i < targets.length; i++) {
            hashes[i] = keccak256(
                abi.encode(TEST_CHAIN_TARGET_TYPEHASH, targets[i].chainId, targets[i].contractAddress)
            );
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function _hashActionLocal(
        bytes32 action,
        bytes32 argsHash,
        uint256 nonce,
        uint256 deadline,
        SuperAdmin3of5.ChainTarget[] memory targets
    ) private pure returns (bytes32) {
        return keccak256(
            abi.encode(TEST_SUPER_ADMIN_ACTION_TYPEHASH, action, argsHash, nonce, deadline, _hashTargetsLocal(targets))
        );
    }

    function _emptyProof() internal view returns (SuperAdmin3of5.SuperAdminProof memory proof) {
        proof.nonce = type(uint256).max;
        proof.deadline = block.timestamp + 7 days;
        proof.targets = new SuperAdmin3of5.ChainTarget[](0);
        proof.signatures = "";
    }

    function _proof(SuperAdmin3of5 c, bytes32 action, bytes32 argsHash)
        internal
        returns (SuperAdmin3of5.SuperAdminProof memory proof)
    {
        uint256 nonce = nextSaNonce++;
        uint256 deadline = block.timestamp + 7 days;
        SuperAdmin3of5.ChainTarget[] memory targets = _thisTargets(address(c));
        bytes32 digest = MessageHashUtils.toTypedDataHash(
            TEST_WAR_ROOM_DOMAIN_SEPARATOR,
            _hashActionLocal(action, argsHash, nonce, deadline, targets)
        );
        proof = SuperAdmin3of5.SuperAdminProof({
            nonce: nonce,
            deadline: deadline,
            targets: targets,
            signatures: _pack3(digest)
        });
    }

    function _saSetKeyRole(NodeRailsEscrow escrow, address key, INodeRailsEscrow.KeyRole role) internal {
        bytes32 action = keccak256("setKeyRole");
        escrow.setKeyRole(key, role, _proof(escrow, action, keccak256(abi.encode(key, role))));
    }

    function _saSetKeyRole(NodeRailsMerchantManager mm, address key, INodeRailsMerchantManager.KeyRole role) internal {
        bytes32 action = keccak256("setKeyRole");
        mm.setKeyRole(key, role, _proof(mm, action, keccak256(abi.encode(key, role))));
    }

    function _saSetSwapRouter(NodeRailsEscrow escrow, address router, bool allowed) internal {
        escrow.setSwapRouter(
            router,
            allowed,
            _proof(escrow, keccak256("setSwapRouter"), keccak256(abi.encode(router, allowed)))
        );
    }

    function _saSetBridgeRouter(NodeRailsEscrow escrow, address router, bool allowed) internal {
        escrow.setBridgeRouter(
            router,
            allowed,
            _proof(escrow, keccak256("setBridgeRouter"), keccak256(abi.encode(router, allowed)))
        );
    }

    function _adminSetSettlementToken(NodeRailsEscrow escrow, address admin, address token, bool allowed) internal {
        vm.prank(admin);
        escrow.setAllowedSettlementToken(token, allowed);
    }

    function _saSetFeeRecipient(NodeRailsEscrow escrow, address recipient) internal {
        escrow.setFeeRecipient(
            recipient,
            _proof(escrow, keccak256("setFeeRecipient"), keccak256(abi.encode(recipient)))
        );
    }

    function _saSetFeeRecipient(NodeRailsMerchantManager mm, address recipient) internal {
        mm.setFeeRecipient(
            recipient,
            _proof(mm, keccak256("setFeeRecipient"), keccak256(abi.encode(recipient)))
        );
    }

    function _saUnpause(SuperAdmin3of5 c) internal {
        NodeRailsEscrow(payable(address(c))).unpause(_proof(c, keccak256("unpause"), bytes32(0)));
    }

    function _saUnpauseMm(NodeRailsMerchantManager mm) internal {
        mm.unpause(_proof(mm, keccak256("unpause"), bytes32(0)));
    }

    function _saLift(NodeRailsEscrow escrow) internal {
        escrow.liftFullStop(_proof(escrow, keccak256("liftFullStop"), bytes32(0)));
    }

    function _saLift(NodeRailsMerchantManager mm) internal {
        mm.liftFullStop(_proof(mm, keccak256("liftFullStop"), bytes32(0)));
    }

    function _saInitiateEmergency(NodeRailsEscrow escrow, address[] memory tokens, address to) internal {
        escrow.initiateEmergencyWithdraw(
            tokens,
            to,
            _proof(escrow, keccak256("initiateEmergencyWithdraw"), keccak256(abi.encode(tokens, to)))
        );
    }

    function _saInitiateEmergency(NodeRailsMerchantManager mm, address[] memory tokens, address to) internal {
        mm.initiateEmergencyWithdraw(
            tokens,
            to,
            _proof(mm, keccak256("initiateEmergencyWithdraw"), keccak256(abi.encode(tokens, to)))
        );
    }

    function _saExecuteEmergency(NodeRailsEscrow escrow) internal {
        escrow.executeEmergencyWithdrawAll(_proof(escrow, keccak256("executeEmergencyWithdrawAll"), bytes32(0)));
    }

    function _saExecuteEmergency(NodeRailsMerchantManager mm) internal {
        mm.executeEmergencyWithdrawAll(_proof(mm, keccak256("executeEmergencyWithdrawAll"), bytes32(0)));
    }

    function _saCancelEmergency(NodeRailsEscrow escrow) internal {
        escrow.cancelEmergencyWithdraw(_proof(escrow, keccak256("cancelEmergencyWithdraw"), bytes32(0)));
    }

    function _saRotate(NodeRailsEscrow escrow, uint8 index, address next) internal {
        escrow.rotateSuperAdmin(
            index,
            next,
            _proof(escrow, keccak256("rotateSuperAdmin"), keccak256(abi.encode(index, next)))
        );
    }

    function _saRotate(NodeRailsMerchantManager mm, uint8 index, address next) internal {
        mm.rotateSuperAdmin(
            index,
            next,
            _proof(mm, keccak256("rotateSuperAdmin"), keccak256(abi.encode(index, next)))
        );
    }
}
