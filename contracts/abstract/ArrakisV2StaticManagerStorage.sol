// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    IArrakisV2Helper
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Helper.sol";
import {StaticVaultInfo} from "../structs/SStaticManager.sol";

abstract contract ArrakisV2StaticManagerStorage is
    OwnableUpgradeable,
    PausableUpgradeable
{
    IArrakisV2Helper public immutable helper;
    uint16 public immutable managerFeeBPS;

    mapping(address => StaticVaultInfo) public vaults;

    event Compound(address vault, address caller, uint256 growthBPS);

    constructor(address helper_, uint16 managerFeeBPS_) {
        helper = IArrakisV2Helper(helper_);
        managerFeeBPS = managerFeeBPS_;
    }

    function initialize(address owner_) external initializer {
        __Pausable_init();
        _transferOwnership(owner_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
