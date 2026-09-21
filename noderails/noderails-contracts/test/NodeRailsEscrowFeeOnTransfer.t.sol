// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/NodeRailsEscrow.sol";
import "../src/interfaces/INodeRailsEscrow.sol";
import "../src/libraries/TimelocksLib.sol";
import "./SuperAdminTestBase.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockConvertERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockTaxERC20 is ERC20 {
    uint16 public immutable taxBps;

    constructor(uint16 taxBps_) ERC20("Tax", "TAX") {
        taxBps = taxBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && taxBps > 0) {
            uint256 tax = (value * taxBps) / 10_000;
            super._update(from, to, value - tax);
            if (tax > 0) super._update(from, address(0), tax);
            return;
        }
        super._update(from, to, value);
    }
}

contract MockConvertRouter {
    function swap(address src, address dst, uint256 amountIn, uint256 amountOut) external {
        IERC20(src).transferFrom(msg.sender, address(this), amountIn);
        MockConvertERC20(dst).mint(msg.sender, amountOut);
    }
}

contract NodeRailsEscrowFeeOnTransferTest is SuperAdminTestBase {
    NodeRailsEscrow public escrow;
    MockTaxERC20 public taxToken;
    MockConvertERC20 public stablecoin;
    MockConvertRouter public swapRouter;

    address public admin;
    address public transactionKey;
    uint256 public transactionKeyPrivate;
    address public merchant;
    address public payer;
    address public treasury;

    uint256 public constant AMOUNT_IN = 100 * 10 ** 18;
    uint256 public constant AMOUNT_OUT = 90 * 10 ** 18;
    uint16 public constant FEE_BPS = 200;

    bytes32 private constant CAPTURE_AND_CONVERT_TYPEHASH = keccak256(
        "CaptureAndConvert(bytes32 paymentIntentId,address merchant,address sourceToken,uint256 amountIn,address settlementToken,uint256 minAmountOut,address router,bytes32 swapCalldataHash,uint16 feeBps,uint256 timelocks,uint256 nonce)"
    );

    function setUp() public {
        _initSuperAdminSigners();
        (admin,) = makeAddrAndKey("admin");
        (transactionKey, transactionKeyPrivate) = makeAddrAndKey("transactionKey");
        merchant = makeAddr("merchant");
        payer = makeAddr("payer");
        treasury = makeAddr("treasury");

        escrow = _newEscrow(_one(admin), _one(transactionKey), treasury);
        taxToken = new MockTaxERC20(100);
        stablecoin = new MockConvertERC20("USD Coin", "USDC");
        swapRouter = new MockConvertRouter();
        taxToken.mint(payer, AMOUNT_IN * 2);

        _saSetSwapRouter(escrow, address(swapRouter), true);
        _adminSetSettlementToken(escrow, admin, address(stablecoin), true);
    }

    function test_CaptureAndConvert_FeeOnTransferOff_RevertsOnHaircut() public {
        bytes32 paymentIntentId = keccak256("fot-convert-off");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        uint256 received = AMOUNT_IN - (AMOUNT_IN * 100) / 10_000;
        bytes memory swapCalldata = abi.encodeWithSelector(
            MockConvertRouter.swap.selector, address(taxToken), address(stablecoin), received, AMOUNT_OUT
        );
        vm.prank(payer);
        taxToken.approve(address(escrow), AMOUNT_IN);
        bytes memory sig = _signConvert(paymentIntentId, keccak256(swapCalldata), timelocks);
        vm.prank(transactionKey);
        vm.expectRevert("Transfer amount mismatch");
        escrow.captureAndConvert(
            paymentIntentId, merchant, address(taxToken), AMOUNT_IN, address(stablecoin), AMOUNT_OUT,
            address(swapRouter), keccak256(swapCalldata), FEE_BPS, timelocks, _emptyPermit(), payer, swapCalldata, sig
        );
    }

    function test_CaptureAndConvert_FeeOnTransferOn_SwapsReceived() public {
        vm.prank(admin);
        escrow.setFeeOnTransferEnabled(true);

        bytes32 paymentIntentId = keccak256("fot-convert-on");
        Timelocks timelocks = TimelocksLib.initWithDuration(block.timestamp, 7 days);
        uint256 received = AMOUNT_IN - (AMOUNT_IN * 100) / 10_000;
        bytes memory swapCalldata = abi.encodeWithSelector(
            MockConvertRouter.swap.selector, address(taxToken), address(stablecoin), received, AMOUNT_OUT
        );
        vm.prank(payer);
        taxToken.approve(address(escrow), AMOUNT_IN);
        bytes memory sig = _signConvert(paymentIntentId, keccak256(swapCalldata), timelocks);
        vm.prank(transactionKey);
        escrow.captureAndConvert(
            paymentIntentId, merchant, address(taxToken), AMOUNT_IN, address(stablecoin), AMOUNT_OUT,
            address(swapRouter), keccak256(swapCalldata), FEE_BPS, timelocks, _emptyPermit(), payer, swapCalldata, sig
        );

        INodeRailsEscrow.Payment memory payment = escrow.getPayment(paymentIntentId);
        assertEq(payment.token, address(stablecoin));
        assertEq(payment.amount, AMOUNT_OUT);
        assertEq(stablecoin.balanceOf(address(escrow)), AMOUNT_OUT);
    }

    function _emptyPermit() internal pure returns (INodeRailsEscrow.PermitData memory) {
        return INodeRailsEscrow.PermitData({amount: 0, deadline: 0, v: 0, r: bytes32(0), s: bytes32(0)});
    }

    function _signConvert(bytes32 paymentIntentId, bytes32 swapCalldataHash, Timelocks timelocks)
        internal
        view
        returns (bytes memory)
    {
        bytes32 nonce = keccak256(abi.encodePacked(paymentIntentId, "erc20"));
        bytes32 structHash = keccak256(
            abi.encode(
                CAPTURE_AND_CONVERT_TYPEHASH,
                paymentIntentId,
                merchant,
                address(taxToken),
                AMOUNT_IN,
                address(stablecoin),
                AMOUNT_OUT,
                address(swapRouter),
                swapCalldataHash,
                FEE_BPS,
                Timelocks.unwrap(timelocks),
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(transactionKeyPrivate, digest);
        return abi.encodePacked(r, s, v);
    }
}
