// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IVaultV2} from "./interfaces/IVaultV2.sol";

contract VaultV2Helper {
    function totalUnderlying(IVaultV2 vault_)
        external
        view
        returns (uint256 amount0, uint256 amount1)
    {
        amount0 = vault_.reserves0();
        amount1 = vault_.reserves1();
    }
}
