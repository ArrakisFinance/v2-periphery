// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.13;

import {IVaultV2} from "./IVaultV2.sol";
import {
    AddLiquidityData,
    MintData,
    RemoveLiquidityData,
    SwapData
} from "./IArrakisV2Router.sol";

interface IArrakisV2RouterWrapper {
    function addLiquidity(IVaultV2 pool, AddLiquidityData memory _addData)
        external
        payable
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        );

    function removeLiquidity(
        IVaultV2 pool,
        RemoveLiquidityData memory _removeData
    ) external returns (uint256 amount0, uint256 amount1);

    function swapAndAddLiquidity(
        IVaultV2 pool,
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
