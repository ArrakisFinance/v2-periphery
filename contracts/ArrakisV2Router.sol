// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.13;

import {
    IGauge,
    IArrakisV2Router,
    AddLiquidityData,
    MintData,
    RemoveLiquidityData,
    AddAndSwapData
} from "./interfaces/IArrakisV2Router.sol";
import {IVaultV2} from "./interfaces/IVaultV2.sol";
import {IArrakisV2Resolver} from "./interfaces/IArrakisV2Resolver.sol";
import {IWETH} from "./interfaces/IWETH.sol";

import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {GelatoBytes} from "./vendor/gelato/GelatoBytes.sol";

// @notice External functions of this contract can only be called by ArrakisV2RouterWrapper
// @notice do not give approvals to this contract's address
contract ArrakisV2Router is IArrakisV2Router {
    using Address for address payable;
    using SafeERC20 for IERC20;

    IWETH public immutable weth;
    IArrakisV2Resolver public immutable resolver;
    address public immutable routerWrapperAddress;

    event Swapped(
        bool zeroForOne,
        uint256 amount0Diff,
        uint256 amount1Diff,
        uint256 amountOutSwap
    );

    modifier onlyRouterWrapper() {
        require(msg.sender == routerWrapperAddress, "onlyRouterWrapper");
        _;
    }

    constructor(
        IWETH _weth,
        address _routerWrapperAddress,
        IArrakisV2Resolver _resolver
    ) {
        weth = _weth;
        routerWrapperAddress = _routerWrapperAddress;
        resolver = _resolver;
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    /// @notice addLiquidity adds liquidity to ArrakisVaultV2 vault of interest (mints LP tokens)
    /// @param _mintData MintData struct containing data for minting
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return mintAmount amount of ArrakisVaultV2 tokens minted and transferred to `receiver`
    // solhint-disable-next-line code-complexity, function-max-lines
    function addLiquidity(MintData memory _mintData)
        external
        payable
        override
        onlyRouterWrapper
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        )
    {
        if (_mintData.gaugeAddress != address(0)) {
            _deposit(
                _mintData.vault,
                _mintData.amount0In,
                _mintData.amount1In,
                _mintData.mintAmount,
                address(this)
            );

            IERC20(address(_mintData.vault)).safeIncreaseAllowance(
                _mintData.gaugeAddress,
                mintAmount
            );

            IGauge(_mintData.gaugeAddress).deposit(
                mintAmount,
                _mintData.receiver
            );
        } else {
            _deposit(
                _mintData.vault,
                _mintData.amount0In,
                _mintData.amount1In,
                _mintData.mintAmount,
                _mintData.receiver
            );
        }
        amount0 = _mintData.amount0In;
        amount1 = _mintData.amount1In;
        mintAmount = _mintData.mintAmount;
    }

    /// @param _removeData RemoveLiquidityData struct containing data for removing liquidity
    /// @return amount0 amount of token0 received when burning `burnAmount`
    /// @return amount1 amount of token1 received when burning `burnAmount`
    // solhint-disable-next-line function-max-lines
    function removeLiquidity(RemoveLiquidityData memory _removeData)
        external
        override
        onlyRouterWrapper
        returns (uint256 amount0, uint256 amount1)
    {
        if (_removeData.receiveETH) {
            (amount0, amount1) = _removeData.vault.burn(
                _removeData.burns,
                _removeData.burnAmount,
                address(this)
            );
        } else {
            (amount0, amount1) = _removeData.vault.burn(
                _removeData.burns,
                _removeData.burnAmount,
                _removeData.receiver
            );
        }

        require(
            amount0 >= _removeData.amount0Min &&
                amount1 >= _removeData.amount1Min,
            "received below minimum"
        );

        if (_removeData.receiveETH) {
            _receiveETH(
                _removeData.vault,
                amount0,
                amount1,
                _removeData.receiver
            );
        }
    }

    // solhint-disable-next-line max-line-length
    /// @notice swapAndAddLiquidity makes a swap and deposits to an ArrakisVaultV2 vault and mints LP tokens
    /// @param _swapData struct AddAndSwapData containing data for swap
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return mintAmount amount of ArrakisVaultV2 tokens minted and transferred to `receiver`
    /// @return amount0Diff token0 balance difference post swap
    /// @return amount1Diff token1 balance difference post swap
    // solhint-disable-next-line code-complexity, function-max-lines
    function swapAndAddLiquidity(AddAndSwapData memory _swapData)
        external
        payable
        override
        onlyRouterWrapper
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount,
            uint256 amount0Diff,
            uint256 amount1Diff
        )
    {
        (amount0Diff, amount1Diff) = _swap(_swapData);

        uint256 amount0Use =
            (_swapData.zeroForOne)
                ? _swapData.amount0Max - amount0Diff
                : _swapData.amount0Max + amount0Diff;
        uint256 amount1Use =
            (_swapData.zeroForOne)
                ? _swapData.amount1Max + amount1Diff
                : _swapData.amount1Max - amount1Diff;

        (amount0, amount1, mintAmount) = resolver.getMintAmounts(
            _swapData.vault,
            amount0Use,
            amount1Use
        );

        require(
            amount0 >= _swapData.amount0Min && amount1 >= _swapData.amount1Min,
            "below min amounts"
        );

        if (_swapData.gaugeAddress != address(0)) {
            _deposit(
                _swapData.vault,
                amount0,
                amount1,
                mintAmount,
                address(this)
            );

            IERC20(address(_swapData.vault)).safeIncreaseAllowance(
                _swapData.gaugeAddress,
                mintAmount
            );
            IGauge(_swapData.gaugeAddress).deposit(
                mintAmount,
                _swapData.receiver
            );
        } else {
            _deposit(
                _swapData.vault,
                amount0,
                amount1,
                mintAmount,
                _swapData.receiver
            );
        }

        // now we send leftovers to user.
        // if we can send leftovers in WETH, this logic would be much simpler
        bool isToken0Weth;
        if (_swapData.useETH) {
            isToken0Weth = _isToken0Weth(
                address(_swapData.vault.token0()),
                address(_swapData.vault.token1())
            );
            if (isToken0Weth && amount0Use > amount0) {
                _refundETH(_swapData.userToRefund, amount0Use - amount0);
            } else if (!isToken0Weth && amount1Use > amount1) {
                _refundETH(_swapData.userToRefund, amount1Use - amount1);
            }
        }

        if (
            amount0Use > amount0 &&
            (!_swapData.useETH || (_swapData.useETH && !isToken0Weth))
        ) {
            IERC20(_swapData.vault.token0()).safeTransfer(
                _swapData.userToRefund,
                amount0Use - amount0
            );
        }
        if (
            amount1Use > amount1 &&
            (!_swapData.useETH || (_swapData.useETH && isToken0Weth))
        ) {
            IERC20(_swapData.vault.token1()).safeTransfer(
                _swapData.userToRefund,
                amount1Use - amount1
            );
        }
    }

    function _deposit(
        IVaultV2 vault,
        uint256 amount0In,
        uint256 amount1In,
        uint256 mintAmount,
        address receiver
    ) internal {
        if (amount0In > 0) {
            vault.token0().safeIncreaseAllowance(address(vault), amount0In);
        }
        if (amount1In > 0) {
            vault.token1().safeIncreaseAllowance(address(vault), amount1In);
        }

        (uint256 amount0, uint256 amount1) = vault.mint(mintAmount, receiver);
        require(
            amount0 == amount0In && amount1 == amount1In,
            "unexpected amounts deposited"
        );
    }

    // solhint-disable-next-line code-complexity
    function _receiveETH(
        IVaultV2 vault,
        uint256 amount0,
        uint256 amount1,
        address payable receiver
    ) internal {
        IERC20 token0 = vault.token0();
        IERC20 token1 = vault.token1();
        bool wethToken0 = _isToken0Weth(address(token0), address(token1));
        if (wethToken0) {
            if (amount0 > 0) {
                weth.withdraw(amount0);
                receiver.sendValue(amount0);
            }
            if (amount1 > 0) {
                token1.safeTransfer(receiver, amount1);
            }
        } else {
            if (amount1 > 0) {
                weth.withdraw(amount1);
                receiver.sendValue(amount1);
            }
            if (amount0 > 0) {
                token0.safeTransfer(receiver, amount0);
            }
        }
    }

    // solhint-disable-next-line function-max-lines
    function _swap(AddAndSwapData memory _swapData)
        internal
        returns (uint256 amount0Diff, uint256 amount1Diff)
    {
        IERC20 token0 = _swapData.vault.token0();
        IERC20 token1 = _swapData.vault.token1();
        uint256 balance0Before = token0.balanceOf(address(this));
        uint256 balance1Before = token1.balanceOf(address(this));

        if (_swapData.zeroForOne) {
            token0.safeIncreaseAllowance(
                _swapData.swapRouter,
                _swapData.amountInSwap
            );
        } else {
            token1.safeIncreaseAllowance(
                _swapData.swapRouter,
                _swapData.amountInSwap
            );
        }
        (bool success, bytes memory returnsData) =
            _swapData.swapRouter.call(_swapData.swapPayload);
        if (!success) GelatoBytes.revertWithError(returnsData, "swap: ");

        // setting allowance to 0
        if (_swapData.zeroForOne) {
            token0.safeApprove(_swapData.swapRouter, 0);
        } else {
            token1.safeApprove(_swapData.swapRouter, 0);
        }

        uint256 balance0 = token0.balanceOf(address(this));
        uint256 balance1 = token1.balanceOf(address(this));
        if (_swapData.zeroForOne) {
            amount0Diff = balance0Before - balance0;
            amount1Diff = balance1 - balance1Before;
            require(
                (amount0Diff == _swapData.amountInSwap) &&
                    (amount1Diff >= _swapData.amountOutSwap),
                "Token0 swap failed!"
            );
        } else {
            amount0Diff = balance0 - balance0Before;
            amount1Diff = balance1Before - balance1;
            require(
                (amount0Diff >= _swapData.amountOutSwap) &&
                    (amount1Diff == _swapData.amountInSwap),
                "Token1 swap failed!"
            );
        }

        emit Swapped(
            _swapData.zeroForOne,
            amount0Diff,
            amount1Diff,
            _swapData.amountOutSwap
        );
    }

    function _refundETH(address userToRefund, uint256 refundAmount) internal {
        weth.withdraw(refundAmount);
        payable(userToRefund).sendValue(refundAmount);
    }

    function _isToken0Weth(address token0, address token1)
        internal
        view
        returns (bool wethToken0)
    {
        if (token0 == address(weth)) {
            wethToken0 = true;
        } else if (token1 == address(weth)) {
            wethToken0 = false;
        } else {
            revert("one vault token must be WETH");
        }
    }
}
