// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.13;

import {IVaultV2} from "./IVaultV2.sol";

interface IVaultV2Resolver {
    function getMintAmounts(
        IVaultV2 vaultV2_,
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
}
