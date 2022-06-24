// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IVaultV2} from "./IVaultV2.sol";
import {RangeWeight, Rebalance, BurnLiquidity} from "../structs/SVaultV2.sol";

interface IArrakisV2Resolver {
    function getRebalanceParams(
        IVaultV2 vault,
        uint256 amount0In,
        uint256 amount1In,
        uint256 price18Decimals
    ) external view returns (bool zeroForOne, uint256 swapAmount);
    
    function standardRebalance(
        RangeWeight[] memory rangeWeights_,
        IVaultV2 vaultV2_
    ) external view returns (Rebalance memory rebalanceParams);

    function standardBurnParams(uint256 amountToBurn_, IVaultV2 vaultV2_)
        external
        view
        returns (BurnLiquidity[] memory burns);

    function getMintAmounts(
        IVaultV2 vaultV2_,
        uint256 amount0Max_,
        uint256 amount1Max_
    )
        external
        view
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        );

    function getAmountsForLiquidity(
        int24 currentTick_,
        int24 lowerTick_,
        int24 upperTick_,
        uint128 liquidity_
    ) external pure returns (uint256 amount0, uint256 amount1);
}
