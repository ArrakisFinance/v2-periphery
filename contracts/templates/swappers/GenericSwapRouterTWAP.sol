// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    IUniswapV3Factory
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
import {
    hundredPercent
} from "@arrakisfi/v2-core/contracts/constants/CArrakisV2.sol";
import {FullMath, IUniswapV3Pool, Twap} from "../../libraries/Twap.sol";

/// @notice IMPORTANT - THIS SWAP ROUTER TEMPLATE IS ONLY "SAFE" GIVEN THE UNISWAP V3 TWAP
/// ORACLE IS DIFFICULT TO MANIPULATE - NOT TRUE FOR MANY POOLS. MANY UNISWAP POOL TWAPS
/// ARE TRIVIAL TO MANIPULATE - OR COULD BECOME SO IF/WHEN LIQUIDITY EXITS THE POOL.

contract GenericSwapRouterTWAP {
    using SafeERC20 for IERC20;

    IUniswapV3Factory public immutable factory;
    uint24 public immutable feeTier;
    uint24 public immutable twapDuration;
    uint24 public immutable maxSlippage;

    constructor(
        IUniswapV3Factory factory_,
        uint24 feeTier_,
        uint24 twapDuration_,
        uint24 maxSlippage_
    ) {
        factory = factory_;
        feeTier = feeTier_;
        twapDuration = twapDuration_;
        maxSlippage = maxSlippage_;
    }

    function swap(
        bool zeroForOne_,
        uint256 amountIn_,
        address swapTarget_,
        bytes calldata swapPayload_
    ) external returns (uint256 amountOut) {
        // get tokens
        address inToken = zeroForOne_
            ? address(IArrakisV2(msg.sender).token0())
            : address(IArrakisV2(msg.sender).token1());
        address outToken = zeroForOne_
            ? address(IArrakisV2(msg.sender).token1())
            : address(IArrakisV2(msg.sender).token0());

        // take swap amount from msg.sender
        IERC20(inToken).safeTransferFrom(msg.sender, address(this), amountIn_);

        // generic low-level call that swaps
        (bool success, ) = swapTarget_.call(swapPayload_);
        require(success, "swap: low-level call failed");

        uint256 amountLeftover = IERC20(inToken).balanceOf(address(this));
        amountOut = IERC20(outToken).balanceOf(address(this));

        // check return against twap
        IUniswapV3Pool pool = IUniswapV3Pool(
            factory.getPool(inToken, outToken, feeTier)
        );
        uint256 twapPrice = zeroForOne_
            ? Twap.getPrice0(pool, twapDuration)
            : Twap.getPrice1(pool, twapDuration);
        uint256 minPrice = FullMath.mulDiv(
            twapPrice,
            hundredPercent - maxSlippage,
            hundredPercent
        );
        require(
            (amountIn_ - amountLeftover) * minPrice < amountOut,
            "swap: below min return"
        );

        // remit return amount
        IERC20(outToken).safeTransfer(msg.sender, amountOut);
        if (amountLeftover > 0) {
            IERC20(inToken).safeTransfer(msg.sender, amountLeftover);
        }
    }
}
