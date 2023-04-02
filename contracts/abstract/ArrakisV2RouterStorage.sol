// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {IRouterSwapExecutor} from "../interfaces/IRouterSwapExecutor.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {
    IArrakisV2Resolver
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Resolver.sol";
import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

abstract contract ArrakisV2RouterStorage is
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    IWETH public immutable weth;
    IArrakisV2Resolver public immutable resolver;

    IRouterSwapExecutor public swapper;

    event Swapped(
        bool zeroForOne,
        uint256 amount0Diff,
        uint256 amount1Diff,
        uint256 amountOutSwap
    );

    constructor(address weth_, address resolver_) {
        weth = IWETH(weth_);
        resolver = IArrakisV2Resolver(resolver_);
    }

    receive() external payable {} // solhint-disable-line no-empty-blocks

    function initialize(address owner_) external initializer {
        __Pausable_init();
        __ReentrancyGuard_init();
        _transferOwnership(owner_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice updates address of ArrakisV2SwaprExecutor used by this contract
    /// @param swapper_ the RouterSwapExecutor address
    function updateSwapExecutor(address swapper_) external onlyOwner {
        swapper = IRouterSwapExecutor(swapper_);
    }
}
