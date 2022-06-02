// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.4;
import {
    IArrakisSwappersWhitelist
} from "./interfaces/IArrakisSwappersWhitelist.sol";
import {
    Initializable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract ArrakisSwappersWhitelist is
    IArrakisSwappersWhitelist,
    Initializable,
    PausableUpgradeable,
    OwnableUpgradeable
{
    mapping(address => bool) public whitelist;

    function initialize() external initializer {
        __Pausable_init();
        __Ownable_init();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function addToWhitelist(address newAddress) external override onlyOwner {
        require(!whitelist[newAddress], "This address is already whitelisted!");
        whitelist[newAddress] = true;
    }

    function removeFromWhitelist(address oldAddress)
        external
        override
        onlyOwner
    {
        require(whitelist[oldAddress], "This address is not in whitelisted!");
        delete whitelist[oldAddress];
    }

    function verify(address router)
        external
        view
        override
        returns (bool whitelisted)
    {
        return (whitelist[router]);
    }
}
