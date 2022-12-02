// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {
    IArrakisV2
} from "@arrakisfi/vault-v2-core/contracts/interfaces/IArrakisV2.sol";

interface ISwapResolver {
    function calculateSwapAmount(
        IArrakisV2 vault,
        uint256 amount0In,
        uint256 amount1In,
        uint256 price18Decimals
    ) external view returns (bool zeroForOne, uint256 swapAmount);
}
