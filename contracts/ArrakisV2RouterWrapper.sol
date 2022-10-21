// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import {
    IArrakisV2RouterWrapper
} from "./interfaces/IArrakisV2RouterWrapper.sol";
import {IGauge} from "./interfaces/IGauge.sol";
import {IArrakisV2Router} from "./interfaces/IArrakisV2Router.sol";
import {IWETH} from "./interfaces/IWETH.sol";

import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {
    Initializable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IArrakisV2} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
import {
    IArrakisV2Resolver
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Resolver.sol";

import {
    AddLiquidityData,
    MintData,
    RemoveLiquidityData,
    AddAndSwapData
} from "./structs/SArrakisV2Router.sol";

import "hardhat/console.sol";

contract ArrakisV2RouterWrapper is
    IArrakisV2RouterWrapper,
    Initializable,
    PausableUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using Address for address payable;
    using SafeERC20 for IERC20;

    IWETH public immutable weth;
    IArrakisV2Resolver public immutable resolver;
    IArrakisV2Router public router;

    constructor(IWETH weth_, IArrakisV2Resolver resolver_) {
        weth = weth_;
        resolver = resolver_;
    }

    function initialize(address owner_) external initializer {
        __Pausable_init();
        _transferOwnership(owner_);
        __ReentrancyGuard_init();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice addLiquidity adds liquidity to ArrakisV2 vault of interest (mints LP tokens)
    /// @param addData_ AddLiquidityData struct containing data for adding liquidity
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return mintAmount amount of ArrakisV2 tokens minted and transferred to `receiver`
    // solhint-disable-next-line code-complexity, function-max-lines
    function addLiquidity(AddLiquidityData memory addData_)
        external
        payable
        override
        whenNotPaused
        nonReentrant
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        )
    {
        console.log("Wrapper - addLiquidity!");
        require(
            addData_.amount0Max > 0 || addData_.amount1Max > 0,
            "Empty max amounts"
        );
        if (addData_.gaugeAddress != address(0)) {
            require(
                addData_.vault ==
                    IGauge(addData_.gaugeAddress).staking_token(),
                "Incorrect gauge!"
            );
        }
        console.log("Wrapper - before getMintAmounts!");
        (uint256 amount0In, uint256 amount1In, uint256 _mintAmount) =
            resolver.getMintAmounts(
                IArrakisV2(addData_.vault),
                addData_.amount0Max,
                addData_.amount1Max
            );
        console.log("Wrapper - after getMintAmounts!");
        console.log("Wrapper - amount0In: %s", amount0In);
        console.log("Wrapper - amount1In: %s", amount1In);
        console.log("Wrapper - _mintAmount: %s", _mintAmount);
        require(
            amount0In >= addData_.amount0Min &&
                amount1In >= addData_.amount1Min,
            "below min amounts"
        );
        require(_mintAmount > 0, "nothing to mint");
        console.log("Wrapper - before _wrapAndTransferETH!");
        bool isToken0Weth;
        if (addData_.useETH) {
            isToken0Weth = _wrapAndTransferETH(
                IArrakisV2(addData_.vault),
                amount0In,
                amount1In,
                false
            );
        }
        console.log("Wrapper - before transfers!");
        if (
            amount0In > 0 &&
            (!addData_.useETH || (addData_.useETH && !isToken0Weth))
        ) {
            IERC20(IArrakisV2(addData_.vault).token0()).safeTransferFrom(
                msg.sender,
                address(router),
                amount0In
            );
        }
        if (
            amount1In > 0 &&
            (!addData_.useETH || (addData_.useETH && isToken0Weth))
        ) {
            IERC20(IArrakisV2(addData_.vault).token1()).safeTransferFrom(
                msg.sender,
                address(router),
                amount1In
            );
        }

        MintData memory _mintData =
            MintData(
                addData_.vault,
                amount0In,
                amount1In,
                _mintAmount,
                addData_.receiver,
                addData_.gaugeAddress
            );
        console.log("Wrapper - before calling router!");
        (amount0, amount1, mintAmount) = router.addLiquidity(_mintData);
        console.log("Wrapper - after calling router!");
        if (addData_.useETH) {
            if (isToken0Weth && msg.value > amount0) {
                payable(msg.sender).sendValue(msg.value - amount0);
            } else if (!isToken0Weth && msg.value > amount1) {
                payable(msg.sender).sendValue(msg.value - amount1);
            }
        }
    }

    /// @notice removeLiquidity removes liquidity from vault and burns LP tokens
    /// @param removeData_ RemoveLiquidityData struct containing data for withdrawals
    /// @return amount0 actual amount of token0 transferred to receiver for burning `burnAmount`
    /// @return amount1 actual amount of token1 transferred to receiver for burning `burnAmount`
    // solhint-disable-next-line code-complexity, function-max-lines
    function removeLiquidity(RemoveLiquidityData memory removeData_)
        external
        override
        whenNotPaused
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        require(removeData_.burnAmount > 0, "nothing to burn");
        if (removeData_.gaugeAddress != address(0)) {
            require(
                removeData_.vault ==
                    IGauge(removeData_.gaugeAddress).staking_token(),
                "Incorrect gauge!"
            );
            IGauge(removeData_.gaugeAddress).claim_rewards(msg.sender);
            IERC20(removeData_.gaugeAddress).safeTransferFrom(
                msg.sender,
                address(this),
                removeData_.burnAmount
            );

            IGauge(removeData_.gaugeAddress).withdraw(removeData_.burnAmount);
            IERC20(removeData_.vault).safeTransfer(
                address(router),
                removeData_.burnAmount
            );
        } else {
            IERC20(removeData_.vault).safeTransferFrom(
                msg.sender,
                address(router),
                removeData_.burnAmount
            );
        }
        (amount0, amount1) = router.removeLiquidity(removeData_);
    }

    /// @notice swapAndAddLiquidity transfer tokens to and calls ArrakisV2Router
    /// @param addAndSwapData_ SwapData struct containing data for swap
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return mintAmount amount of ArrakisV2 tokens minted and transferred to `receiver`
    /// @return amount0Diff token0 balance difference post swap
    /// @return amount1Diff token1 balance difference post swap
    // solhint-disable-next-line code-complexity, function-max-lines
    function swapAndAddLiquidity(AddAndSwapData memory addAndSwapData_)
        external
        payable
        override
        whenNotPaused
        nonReentrant
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount,
            uint256 amount0Diff,
            uint256 amount1Diff
        )
    {
        require(
            addAndSwapData_.addData.amount0Max > 0 || addAndSwapData_.addData.amount1Max > 0,
            "Empty max amounts"
        );
        if (addAndSwapData_.addData.gaugeAddress != address(0)) {
            require(
                addAndSwapData_.addData.vault ==
                    IGauge(addAndSwapData_.addData.gaugeAddress).staking_token(),
                "Incorrect gauge!"
            );
        }
        bool isToken0Weth;
        if (addAndSwapData_.addData.useETH) {
            isToken0Weth = _wrapAndTransferETH(
                IArrakisV2(addAndSwapData_.addData.vault),
                addAndSwapData_.addData.amount0Max,
                addAndSwapData_.addData.amount1Max,
                true
            );
        }

        if (
            addAndSwapData_.addData.amount0Max > 0 &&
            (!addAndSwapData_.addData.useETH || (addAndSwapData_.addData.useETH && !isToken0Weth))
        ) {
            IERC20(IArrakisV2(addAndSwapData_.addData.vault).token0()).safeTransferFrom(
                msg.sender,
                address(router),
                addAndSwapData_.addData.amount0Max
            );
        }
        if (
            addAndSwapData_.addData.amount1Max > 0 &&
            (!addAndSwapData_.addData.useETH || (addAndSwapData_.addData.useETH && isToken0Weth))
        ) {
            IERC20(IArrakisV2(addAndSwapData_.addData.vault).token1()).safeTransferFrom(
                msg.sender,
                address(router),
                addAndSwapData_.addData.amount1Max
            );
        }

        addAndSwapData_.swapData.userToRefund = payable(msg.sender);
        (amount0, amount1, mintAmount, amount0Diff, amount1Diff) = router
            .swapAndAddLiquidity(addAndSwapData_);
    }

    /// @notice updates address of ArrakisV2Router used by this wrapper
    /// @param router_ the router address
    function updateRouter(IArrakisV2Router router_) external onlyOwner {
        router = router_;
    }

    /// @notice _wrapAndTransferETH wrap ETH into WETH and transfers to router
    /// @param vault_ The ArrakisV2 vault
    /// @param amount0In_ amount of token1 to be wrapped and transfered (if isToken0Weth)
    /// @param amount1In_ amount of token1 to be wrapped and transfered (if !isToken0Weth)
    /// @param matchAmount_ bool indicating if msg.value should match amount in
    /// @return isToken0Weth bool indicating which token is WETH
    function _wrapAndTransferETH(
        IArrakisV2 vault_,
        uint256 amount0In_,
        uint256 amount1In_,
        bool matchAmount_
    ) internal returns (bool isToken0Weth) {
        isToken0Weth = _isToken0Weth(
            address(vault_.token0()),
            address(vault_.token1())
        );
        uint256 wethAmount = isToken0Weth ? amount0In_ : amount1In_;
        if (matchAmount_) {
            require(wethAmount == msg.value, "Invalid amount of ETH forwarded");
        } else {
            require(wethAmount <= msg.value, "Not enough ETH forwarded");
        }

        weth.deposit{value: wethAmount}();
        IERC20(address(weth)).safeTransfer(address(router), wethAmount);
    }

    function _isToken0Weth(address token0_, address token1_)
        internal
        view
        returns (bool wethToken0)
    {
        if (token0_ == address(weth)) {
            wethToken0 = true;
        } else if (token1_ == address(weth)) {
            wethToken0 = false;
        } else {
            revert("one vault token must be WETH");
        }
    }
}
