// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {IArrakisV2SwapExecutor} from "../interfaces/IArrakisV2SwapExecutor.sol";
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
    uint16 public immutable depositFeeBPS;

    IArrakisV2SwapExecutor public swapper;
    address public feeCollector;

    event Swapped(
        bool zeroForOne,
        uint256 amount0Diff,
        uint256 amount1Diff,
        uint256 amountOutSwap
    );

    constructor(
        address weth_,
        address resolver_,
        uint16 depositFeeBPS_,
        address feeCollector_
    ) {
        weth = IWETH(weth_);
        resolver = IArrakisV2Resolver(resolver_);
        depositFeeBPS = depositFeeBPS_;
        feeCollector = feeCollector_;
    }

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
    /// @param swapper_ the ArrakisV2SwapExecutor address
    function updateSwapExecutor(address swapper_) external onlyOwner {
        swapper = IArrakisV2SwapExecutor(swapper_);
    }

    /// @notice updates address of feeCollector, which collects deposit fees from this contract
    /// @param feeCollector_ the new feeCollector address
    function updateFeeCollector(address feeCollector_) external onlyOwner {
        feeCollector = feeCollector_;
    }
}
