// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";

import {IArrakisV2SwapExecutor} from "./IArrakisV2SwapExecutor.sol";

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
            uint256 sharesReceived
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
            uint256 sharesReceived,
            uint256 amount0Diff,
            uint256 amount1Diff
        );

    function updateSwapExecutor(IArrakisV2SwapExecutor router_) external;

    function updateFeeCollector(address feeCollector_) external;
}
