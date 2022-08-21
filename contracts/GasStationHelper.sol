// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IGasStation} from "./interfaces/IGasStation.sol";
import {VaultInfo} from "./structs/SGasStation.sol";

contract GasStationHelper {
    IGasStation public immutable gasStation;

    constructor(IGasStation gasStation_) {
        gasStation = gasStation_;
    }

    function getVaultsByStrat(
        address[] calldata vaults_,
        string calldata strat_
    ) external view returns (VaultInfo[] memory result) {
        VaultInfo[] memory vaultsInfo = new VaultInfo[](vaults_.length);
        uint256 nbOfVaultUsingStrat;
        bytes32 hashedStrat = keccak256(abi.encodePacked(strat_));
        for (uint256 i; i < vaults_.length; i++) {
            vaultsInfo[i] = gasStation.getVaultInfo(vaults_[i]);
            if (vaultsInfo[i].strat == hashedStrat) {
                nbOfVaultUsingStrat++;
            }
        }

        result = new VaultInfo[](nbOfVaultUsingStrat);
        uint256 index;
        for (uint256 i; i < vaultsInfo.length; i++) {
            if (vaultsInfo[i].strat == hashedStrat) {
                result[index] = vaultsInfo[i];
                index++;
            }
        }
    }
}
