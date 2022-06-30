// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.13;

import {
    MintData,
    RemoveLiquidityData,
    AddAndSwapData
} from "../structs/SArrakisV2Router.sol";

interface IArrakisV2Router {
    function addLiquidity(MintData memory _mintData)
        external
        payable
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        );

    function removeLiquidity(RemoveLiquidityData memory _removeData)
        external
        returns (uint256 amount0, uint256 amount1);

    function swapAndAddLiquidity(AddAndSwapData memory _swapData)
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
