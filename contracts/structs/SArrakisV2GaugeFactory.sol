// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

struct InitializeGauge {
    address stakingToken;
    address rewardToken;
    address rewardDistributor;
    address rewardVE;
    address rewardVEBoost;
}
