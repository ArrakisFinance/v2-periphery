// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {IRouterSwapExecutor} from "../interfaces/IRouterSwapExecutor.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {IPermit2} from "../interfaces/IPermit2.sol";
import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
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
import {
    EnumerableSet
} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {MintRules} from "../structs/SArrakisV2Router.sol";

abstract contract ArrakisV2RouterStorage is
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using EnumerableSet for EnumerableSet.AddressSet;

    IWETH public immutable weth;
    IArrakisV2Resolver public immutable resolver;
    IPermit2 public immutable permit2;

    mapping(address => EnumerableSet.AddressSet) internal _mintWhitelist;
    mapping(address => MintRules) public mintRestrictedVaults;
    IRouterSwapExecutor public swapper;

    event LogWhitelist(address vault, address[] whitelisted);
    event LogBlacklist(address vault, address[] blacklisted);
    event LogSetVault(address vault, uint256 supplyCap, bool hasWhitelist);

    event Swapped(
        bool zeroForOne,
        uint256 amount0Diff,
        uint256 amount1Diff,
        uint256 amountOutSwap
    );

    constructor(
        address weth_,
        address resolver_,
        address permit2_
    ) {
        weth = IWETH(weth_);
        resolver = IArrakisV2Resolver(resolver_);
        permit2 = IPermit2(permit2_);
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

    function setMintRules(
        address vault_,
        uint256 supplyCap_,
        bool hasWhitelist_
    ) external onlyOwner {
        require(supplyCap_ > 0, "zero");
        address minter = IArrakisV2(vault_).restrictedMint();
        require(minter == address(this), "must be minter");
        mintRestrictedVaults[vault_] = MintRules({
            supplyCap: supplyCap_,
            hasWhitelist: hasWhitelist_
        });

        emit LogSetVault(vault_, supplyCap_, hasWhitelist_);
    }

    function whitelist(address vault_, address[] memory toWhitelist_)
        external
        onlyOwner
    {
        require(mintRestrictedVaults[vault_].supplyCap > 0, "vault not set");
        for (uint256 i; i < toWhitelist_.length; i++) {
            _mintWhitelist[vault_].add(toWhitelist_[i]);
        }

        emit LogWhitelist(vault_, toWhitelist_);
    }

    function blacklist(address vault_, address[] memory toBlacklist_)
        external
        onlyOwner
    {
        require(mintRestrictedVaults[vault_].supplyCap > 0, "vault not set");
        for (uint256 i; i < toBlacklist_.length; i++) {
            _mintWhitelist[vault_].remove(toBlacklist_[i]);
        }

        emit LogBlacklist(vault_, toBlacklist_);
    }

    function getWhitelist(address vault_)
        external
        view
        returns (address[] memory)
    {
        uint256 len = _mintWhitelist[vault_].length();
        address[] memory output = new address[](len);
        for (uint256 i; i < len; i++) {
            output[i] = _mintWhitelist[vault_].at(i);
        }

        return output;
    }
}
