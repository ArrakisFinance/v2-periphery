// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.13;

import {ArrakisV2} from "@arrakisfi/v2-core/contracts/ArrakisV2.sol";

// mock contract just to import ArrakisV2 so typechain builds its type so we can use on tests
abstract contract ArrakisMock is ArrakisV2 {
    uint16 private _contractNotEmpty = 1;
}
