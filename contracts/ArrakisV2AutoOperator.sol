// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import {
    ReentrancyGuard
} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import {RangeWeight, Rebalance} from "./structs/SVaultV2.sol";

import {IArrakisV2AutoOperator} from "./interfaces/IArrakisV2AutoOperator.sol";
import {IVaultV2} from "./interfaces/IVaultV2.sol";
import {IArrakisV2Resolver} from "./interfaces/IArrakisV2Resolver.sol";

contract ArrakisV2AutoOperator is IArrakisV2AutoOperator, ReentrancyGuard {
    IArrakisV2Resolver public immutable resolver;

    constructor(IArrakisV2Resolver _resolver) {
        resolver = _resolver;
    }

    function rebalance(IVaultV2 vault) external override nonReentrant {
        RangeWeight[] memory rangeWeights =
            resolver.getEqualWeightsForRanges(vault);
        Rebalance memory rebalanceParams =
            resolver.standardRebalance(rangeWeights, vault);
        IVaultV2(vault).rebalance(rebalanceParams);
    }
}
