// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.13;

import {SwapAndAddData} from "../structs/SArrakisV2Router.sol";

interface IArrakisV2SwapExecutor {
    function swap(SwapAndAddData memory _swapData)
        external
        returns (uint256 amount0Diff, uint256 amount1Diff);
}
