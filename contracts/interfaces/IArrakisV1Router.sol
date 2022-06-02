// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.4;

import {
    IArrakisVaultV1,
    IArrakisV1RouterBase
} from "./IArrakisV1RouterBase.sol";

interface IArrakisV1Router is IArrakisV1RouterBase {
    function rebalanceAndAddLiquidity(
        IArrakisVaultV1 pool,
        uint256 amount0In,
        uint256 amount1In,
        bool zeroForOne,
        uint256 swapAmount,
        uint160 swapThreshold,
        uint256 amount0Min,
        uint256 amount1Min,
        address receiver
    )
        external
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        );

    function rebalanceAndAddLiquidityETH(
        IArrakisVaultV1 pool,
        uint256 amount0In,
        uint256 amount1In,
        bool zeroForOne,
        uint256 swapAmount,
        uint160 swapThreshold,
        uint256 amount0Min,
        uint256 amount1Min,
        address receiver
    )
        external
        payable
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        );
}
