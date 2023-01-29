// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.13;

import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";

import {IArrakisV2RouterExecutor} from "./IArrakisV2RouterExecutor.sol";

import {
    AddLiquidityData,
    RemoveLiquidityData,
    SwapAndAddData
} from "../structs/SArrakisV2Router.sol";

interface IArrakisV2Router {
    function addLiquidity(AddLiquidityData memory _addData)
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

    function swapAndAddLiquidity(SwapAndAddData memory _swapData)
        external
        payable
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount,
            uint256 amount0Diff,
            uint256 amount1Diff
        );

    function updateRouterExecutor(IArrakisV2RouterExecutor router_) external;
}
