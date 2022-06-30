// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IVaultV2} from "./IVaultV2.sol";

interface IArrakisV2AutoOperator {
    function rebalance(IVaultV2 vault) external;
}
