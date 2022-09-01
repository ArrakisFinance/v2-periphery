// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IGasStation} from "./interfaces/IGasStation.sol";
import {VaultInfo, VaultData} from "./structs/SGasStation.sol";

contract GasStationHelper {
    IGasStation public immutable gasStation;

    constructor(IGasStation gasStation_) {
        gasStation = gasStation_;
    }

    function getVaultsByStrat(
        address[] calldata vaults_,
        string calldata strat_
    ) external view returns (VaultData[] memory result) {
        VaultInfo[] memory vaultsInfos = new VaultInfo[](vaults_.length);
        uint256 nbOfVaultUsingStrat;
        bytes32 hashedStrat = keccak256(abi.encodePacked(strat_));
        for (uint256 i; i < vaults_.length; i++) {
            vaultsInfos[i] = gasStation.getVaultInfo(vaults_[i]);
            if (vaultsInfos[i].strat == hashedStrat) {
                nbOfVaultUsingStrat++;
            }
        }

        result = new VaultData[](nbOfVaultUsingStrat);
        uint256 index;
        for (uint256 i; i < vaultsInfos.length; i++) {
            if (vaultsInfos[i].strat == hashedStrat) {
                result[index] = VaultData({
                    vault: vaults_[i],
                    vaultInfo: vaultsInfos[i]
                });
                index++;
            }
        }
    }

    function getVaultsStrat(address[] calldata vaults_)
        external
        view
        returns (VaultInfo[] memory result)
    {
        result = new VaultInfo[](vaults_.length);
        for (uint256 i; i < vaults_.length; i++) {
            result[i] = gasStation.getVaultInfo(vaults_[i]);
        }
    }
}
