// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
import {InitializeGauge} from "../structs/SArrakisV2GaugeFactory.sol";

interface IArrakisV2GaugeFactory {
    function deployGauge(InitializeGauge calldata params)
        external
        returns (address);
}
