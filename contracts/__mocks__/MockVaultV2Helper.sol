// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IMockVaultV2} from "./interfaces/IMockVaultV2.sol";

contract MockVaultV2Helper {
    function totalUnderlying(IMockVaultV2 vault_)
        external
        view
        returns (uint256 amount0, uint256 amount1)
    {
        amount0 = vault_.reserves0();
        amount1 = vault_.reserves1();
    }
}
