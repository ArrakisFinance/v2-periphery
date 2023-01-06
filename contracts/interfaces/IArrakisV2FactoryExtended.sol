// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.13;

import {
    IArrakisV2Factory
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Factory.sol";

interface IArrakisV2FactoryExtended is IArrakisV2Factory {
    function owner() external view returns (address);
}
