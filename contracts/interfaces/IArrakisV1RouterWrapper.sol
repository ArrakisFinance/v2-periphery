// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.4;

import {IArrakisVaultV1} from "./IArrakisVaultV1.sol";
import {
    AddLiquidityData,
    MintData,
    RemoveLiquidityData,
    SwapData
} from "./IArrakisV1RouterStaking.sol";

interface IArrakisV1RouterWrapper {
    function addLiquidity(
        IArrakisVaultV1 pool,
        AddLiquidityData memory _addData
    )
        external
        payable
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        );

    function removeLiquidity(
        IArrakisVaultV1 pool,
        RemoveLiquidityData memory _removeData
    )
        external
        returns (
            uint256 amount0,
            uint256 amount1,
            uint128 liquidityBurned
        );

    function swapAndAddLiquidity(
        IArrakisVaultV1 pool,
        AddLiquidityData memory _addData,
        SwapData memory _swapData
    )
        external
        payable
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount,
            uint256 amount0Diff,
            uint256 amount1Diff
        );
}
