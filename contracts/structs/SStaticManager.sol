// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

struct StaticVaultInfo {
    int24 twapDeviation;
    uint24 twapDuration;
    bool compoundEnabled;
    bool isVault;
}

struct SetStaticVault {
    address vault;
    int24 twapDeviation;
    uint24 twapDuration;
    bool compoundEnabled;
}
