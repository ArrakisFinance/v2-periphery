// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    IUniswapV3Factory
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {
    IArrakisV2Factory
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Factory.sol";
import {IArrakisV2GaugeFactory} from "../interfaces/IArrakisV2GaugeFactory.sol";
import {IStaticManager} from "../interfaces/IStaticManager.sol";

abstract contract ArrakisV2StaticDeployerStorage is
    OwnableUpgradeable,
    PausableUpgradeable
{
    IUniswapV3Factory public immutable uniswapFactory;
    IArrakisV2Factory public immutable arrakisFactory;
    IArrakisV2GaugeFactory public immutable gaugeFactory;
    IStaticManager public immutable staticManager;

    event CreateStaticVault(
        address vault,
        address gauge,
        address caller,
        uint256 amount0,
        uint256 amount1
    );

    constructor(
        address uniswapFactory_,
        address arrakisFactory_,
        address gaugeFactory_,
        address staticManager_
    ) {
        uniswapFactory = IUniswapV3Factory(uniswapFactory_);
        arrakisFactory = IArrakisV2Factory(arrakisFactory_);
        gaugeFactory = IArrakisV2GaugeFactory(gaugeFactory_);
        staticManager = IStaticManager(staticManager_);
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
