// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.13;

import {IVaultV2} from "./IVaultV2.sol";

interface IArrakisV2Resolver {
    function getRebalanceParams(
        IVaultV2 pool,
        uint256 amount0In,
        uint256 amount1In,
        uint256 price18Decimals
    ) external view returns (bool zeroForOne, uint256 swapAmount);
}
