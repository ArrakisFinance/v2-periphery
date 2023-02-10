// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

import {
    PositionLiquidity
} from "@arrakisfi/v2-core/contracts/structs/SArrakisV2.sol";

struct InitializeStatic {
    PositionLiquidity[] positions;
    uint24[] feeTiers;
    address token0;
    address token1;
    address receiver;
    uint256 minDeposit0;
    uint256 minDeposit1;
    int24 twapDeviation;
    uint24 twapDuration;
    bool compoundEnabled;
    bool hasGauge;
    address rewardToken;
    address rewardDistributor;
    address rewardVE;
    address rewardVEBoost;
}
