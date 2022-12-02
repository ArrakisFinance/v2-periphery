// SPDX-License-Identifier: MIT
pragma solidity >=0.8.13;

import {
    IArrakisV2RouterExecutor
} from "./interfaces/IArrakisV2RouterExecutor.sol";
import {IGauge} from "./interfaces/IGauge.sol";
import {IWETH} from "./interfaces/IWETH.sol";

import {
    MintData,
    RemoveLiquidityData,
    SwapAndAddData
} from "./structs/SArrakisV2Router.sol";
import {GelatoBytes} from "./vendor/gelato/GelatoBytes.sol";

import {
    IArrakisV2
} from "@arrakisfi/vault-v2-core/contracts/interfaces/IArrakisV2.sol";
import {
    IArrakisV2Resolver
} from "@arrakisfi/vault-v2-core/contracts/interfaces/IArrakisV2Resolver.sol";
import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {
    EnumerableSet
} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// @notice External functions of this contract can only be called by ArrakisV2GenericRouter
// @notice do not give approvals to this contract's address
contract ArrakisV2RouterExecutor is
    IArrakisV2RouterExecutor,
    Ownable,
    ReentrancyGuard
{
    using Address for address payable;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    IWETH public immutable weth;
    address public immutable genericRouterAddress;
    IArrakisV2Resolver public immutable resolver;
    EnumerableSet.AddressSet internal _routersWhitelist;

    event Swapped(
        bool zeroForOne,
        uint256 amount0Diff,
        uint256 amount1Diff,
        uint256 amountOutSwap
    );

    modifier onlyWhitelistedRouters() {
        require(_routersWhitelist.contains(msg.sender), "W");
        _;
    }

    constructor(
        IWETH _weth,
        address _genericRouterAddress,
        IArrakisV2Resolver _resolver
    ) {
        weth = _weth;
        genericRouterAddress = _genericRouterAddress;
        resolver = _resolver;
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    /// @notice addLiquidity adds liquidity to ArrakisV2 vault of interest (mints LP tokens)
    /// @param mintData_ MintData struct containing data for minting
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return mintAmount amount of ArrakisV2 tokens minted and transferred to `receiver`
    // solhint-disable-next-line code-complexity, function-max-lines
    function addLiquidity(MintData memory mintData_)
        external
        payable
        override
        onlyWhitelistedRouters
        nonReentrant
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        )
    {
        if (mintData_.gaugeAddress != address(0)) {
            _deposit(
                mintData_.vault,
                mintData_.amount0In,
                mintData_.amount1In,
                mintData_.mintAmount,
                address(this)
            );

            IERC20(address(mintData_.vault)).safeIncreaseAllowance(
                mintData_.gaugeAddress,
                mintData_.mintAmount
            );

            IGauge(mintData_.gaugeAddress).deposit(
                mintData_.mintAmount,
                mintData_.receiver
            );
        } else {
            _deposit(
                mintData_.vault,
                mintData_.amount0In,
                mintData_.amount1In,
                mintData_.mintAmount,
                mintData_.receiver
            );
        }

        amount0 = mintData_.amount0In;
        amount1 = mintData_.amount1In;
        mintAmount = mintData_.mintAmount;
    }

    /// @param removeData_ RemoveLiquidityData struct containing data for removing liquidity
    /// @return amount0 amount of token0 received when burning `burnAmount`
    /// @return amount1 amount of token1 received when burning `burnAmount`
    // solhint-disable-next-line function-max-lines
    function removeLiquidity(RemoveLiquidityData memory removeData_)
        external
        override
        onlyWhitelistedRouters
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        if (removeData_.receiveETH) {
            (amount0, amount1) = IArrakisV2(removeData_.vault).burn(
                removeData_.burns,
                removeData_.burnAmount,
                address(this)
            );
        } else {
            (amount0, amount1) = IArrakisV2(removeData_.vault).burn(
                removeData_.burns,
                removeData_.burnAmount,
                removeData_.receiver
            );
        }

        require(
            amount0 >= removeData_.amount0Min &&
                amount1 >= removeData_.amount1Min,
            "received below minimum"
        );

        if (removeData_.receiveETH) {
            _receiveETH(
                IArrakisV2(removeData_.vault),
                amount0,
                amount1,
                removeData_.receiver
            );
        }
    }

    // solhint-disable-next-line max-line-length
    /// @notice swapAndAddLiquidity makes a swap and deposits to an ArrakisV2 vault and mints LP tokens
    /// @param swapAndAddData_ struct SwapAndAddData containing data for swap
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return mintAmount amount of ArrakisV2 tokens minted and transferred to `receiver`
    /// @return amount0Diff token0 balance difference post swap
    /// @return amount1Diff token1 balance difference post swap
    // solhint-disable-next-line code-complexity, function-max-lines
    function swapAndAddLiquidity(SwapAndAddData memory swapAndAddData_)
        external
        payable
        override
        onlyWhitelistedRouters
        nonReentrant
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount,
            uint256 amount0Diff,
            uint256 amount1Diff
        )
    {
        (amount0Diff, amount1Diff) = _swap(swapAndAddData_);

        uint256 amount0Use =
            (swapAndAddData_.swapData.zeroForOne)
                ? swapAndAddData_.addData.amount0Max - amount0Diff
                : swapAndAddData_.addData.amount0Max + amount0Diff;
        uint256 amount1Use =
            (swapAndAddData_.swapData.zeroForOne)
                ? swapAndAddData_.addData.amount1Max + amount1Diff
                : swapAndAddData_.addData.amount1Max - amount1Diff;

        (amount0, amount1, mintAmount) = resolver.getMintAmounts(
            IArrakisV2(swapAndAddData_.addData.vault),
            amount0Use,
            amount1Use
        );

        require(
            amount0 >= swapAndAddData_.addData.amount0Min &&
                amount1 >= swapAndAddData_.addData.amount1Min,
            "below min amounts"
        );

        if (swapAndAddData_.addData.gaugeAddress != address(0)) {
            _deposit(
                swapAndAddData_.addData.vault,
                amount0,
                amount1,
                mintAmount,
                address(this)
            );

            IERC20(address(swapAndAddData_.addData.vault))
                .safeIncreaseAllowance(
                swapAndAddData_.addData.gaugeAddress,
                mintAmount
            );
            IGauge(swapAndAddData_.addData.gaugeAddress).deposit(
                mintAmount,
                swapAndAddData_.addData.receiver
            );
        } else {
            _deposit(
                swapAndAddData_.addData.vault,
                amount0,
                amount1,
                mintAmount,
                swapAndAddData_.addData.receiver
            );
        }

        // now we send leftovers to user.
        // if we can send leftovers in WETH, this logic would be much simpler
        bool isToken0Weth;
        if (swapAndAddData_.addData.useETH) {
            isToken0Weth = _isToken0Weth(
                address(IArrakisV2(swapAndAddData_.addData.vault).token0()),
                address(IArrakisV2(swapAndAddData_.addData.vault).token1())
            );
            if (isToken0Weth && amount0Use > amount0) {
                _refundETH(
                    swapAndAddData_.swapData.userToRefund,
                    amount0Use - amount0
                );
            } else if (!isToken0Weth && amount1Use > amount1) {
                _refundETH(
                    swapAndAddData_.swapData.userToRefund,
                    amount1Use - amount1
                );
            }
        }

        if (
            amount0Use > amount0 &&
            (!swapAndAddData_.addData.useETH ||
                (swapAndAddData_.addData.useETH && !isToken0Weth))
        ) {
            IERC20(IArrakisV2(swapAndAddData_.addData.vault).token0())
                .safeTransfer(
                swapAndAddData_.swapData.userToRefund,
                amount0Use - amount0
            );
        }
        if (
            amount1Use > amount1 &&
            (!swapAndAddData_.addData.useETH ||
                (swapAndAddData_.addData.useETH && isToken0Weth))
        ) {
            IERC20(IArrakisV2(swapAndAddData_.addData.vault).token1())
                .safeTransfer(
                swapAndAddData_.swapData.userToRefund,
                amount1Use - amount1
            );
        }
    }

    function whitelistRouter(address router_) external onlyOwner {
        require(!_routersWhitelist.contains(router_), "RW");
        _routersWhitelist.add(router_);
        emit WhitelistRouter(router_);
    }

    function removeRouter(address router_) external onlyOwner {
        require(_routersWhitelist.contains(router_), "RNW");
        _routersWhitelist.remove(router_);
        emit RemoveRouter(router_);
    }

    function _deposit(
        address vault_,
        uint256 amount0In_,
        uint256 amount1In_,
        uint256 mintAmount_,
        address receiver_
    ) internal {
        if (amount0In_ > 0) {
            IArrakisV2(vault_).token0().safeIncreaseAllowance(
                vault_,
                amount0In_
            );
        }
        if (amount1In_ > 0) {
            IArrakisV2(vault_).token1().safeIncreaseAllowance(
                vault_,
                amount1In_
            );
        }

        (uint256 amount0, uint256 amount1) =
            IArrakisV2(vault_).mint(mintAmount_, receiver_);

        require(
            amount0 == amount0In_ && amount1 == amount1In_,
            "unexpected amounts deposited"
        );
    }

    // solhint-disable-next-line code-complexity
    function _receiveETH(
        IArrakisV2 vault_,
        uint256 amount0_,
        uint256 amount1_,
        address payable receiver_
    ) internal {
        IERC20 token0 = vault_.token0();
        IERC20 token1 = vault_.token1();
        bool wethToken0 = _isToken0Weth(address(token0), address(token1));
        if (wethToken0) {
            if (amount0_ > 0) {
                weth.withdraw(amount0_);
                receiver_.sendValue(amount0_);
            }
            if (amount1_ > 0) {
                token1.safeTransfer(receiver_, amount1_);
            }
        } else {
            if (amount1_ > 0) {
                weth.withdraw(amount1_);
                receiver_.sendValue(amount1_);
            }
            if (amount0_ > 0) {
                token0.safeTransfer(receiver_, amount0_);
            }
        }
    }

    // solhint-disable-next-line function-max-lines
    function _swap(SwapAndAddData memory swapAndAddData_)
        internal
        returns (uint256 amount0Diff, uint256 amount1Diff)
    {
        IERC20 token0 = IArrakisV2(swapAndAddData_.addData.vault).token0();
        IERC20 token1 = IArrakisV2(swapAndAddData_.addData.vault).token1();
        uint256 balance0Before = token0.balanceOf(address(this));
        uint256 balance1Before = token1.balanceOf(address(this));

        if (swapAndAddData_.swapData.zeroForOne) {
            token0.safeIncreaseAllowance(
                swapAndAddData_.swapData.swapRouter,
                swapAndAddData_.swapData.amountInSwap
            );
        } else {
            token1.safeIncreaseAllowance(
                swapAndAddData_.swapData.swapRouter,
                swapAndAddData_.swapData.amountInSwap
            );
        }
        (bool success, bytes memory returnsData) =
            swapAndAddData_.swapData.swapRouter.call(
                swapAndAddData_.swapData.swapPayload
            );
        if (!success) GelatoBytes.revertWithError(returnsData, "swap: ");

        // setting allowance to 0
        if (swapAndAddData_.swapData.zeroForOne) {
            token0.safeApprove(swapAndAddData_.swapData.swapRouter, 0);
        } else {
            token1.safeApprove(swapAndAddData_.swapData.swapRouter, 0);
        }

        uint256 balance0 = token0.balanceOf(address(this));
        uint256 balance1 = token1.balanceOf(address(this));
        if (swapAndAddData_.swapData.zeroForOne) {
            amount0Diff = balance0Before - balance0;
            amount1Diff = balance1 - balance1Before;
            require(
                (amount0Diff <= swapAndAddData_.swapData.amountInSwap) &&
                    (amount1Diff >= swapAndAddData_.swapData.amountOutSwap),
                "Token0 swap failed!"
            );
        } else {
            amount0Diff = balance0 - balance0Before;
            amount1Diff = balance1Before - balance1;
            require(
                (amount0Diff >= swapAndAddData_.swapData.amountOutSwap) &&
                    (amount1Diff <= swapAndAddData_.swapData.amountInSwap),
                "Token1 swap failed!"
            );
        }

        emit Swapped(
            swapAndAddData_.swapData.zeroForOne,
            amount0Diff,
            amount1Diff,
            swapAndAddData_.swapData.amountOutSwap
        );
    }

    function _refundETH(address userToRefund_, uint256 refundAmount_) internal {
        weth.withdraw(refundAmount_);
        payable(userToRefund_).sendValue(refundAmount_);
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
