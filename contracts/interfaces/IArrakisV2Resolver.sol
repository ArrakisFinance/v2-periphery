// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IArrakisV2} from "./IArrakisV2.sol";
import {RangeWeight, Rebalance, BurnLiquidity} from "../structs/SArrakisV2.sol";

interface IArrakisV2Resolver {
    function calculateSwapAmount(
        IArrakisV2 vault,
        uint256 amount0In,
        uint256 amount1In,
        uint256 price18Decimals
    ) external view returns (bool zeroForOne, uint256 swapAmount);

    function getEqualWeightsForRanges(IArrakisV2 vault)
        external
        view
        returns (RangeWeight[] memory rangeWeights);

    function standardRebalance(
        RangeWeight[] memory rangeWeights_,
        IArrakisV2 vaultV2_
    ) external view returns (Rebalance memory rebalanceParams);

    function standardBurnParams(uint256 amountToBurn_, IArrakisV2 vaultV2_)
        external
        view
        returns (BurnLiquidity[] memory burns);

    function getMintAmounts(
        IArrakisV2 vaultV2_,
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
