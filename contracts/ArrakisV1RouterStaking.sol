// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.4;

import {
    IGauge,
    IArrakisV1RouterStaking,
    AddLiquidityData,
    MintData,
    RemoveLiquidityData,
    SwapData
} from "./interfaces/IArrakisV1RouterStaking.sol";
import {IArrakisVaultV1} from "./interfaces/IArrakisVaultV1.sol";
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
import {GelatoBytes} from "./vendor/gelato/GelatoBytes.sol";

contract ArrakisV1RouterStaking is
    IArrakisV1RouterStaking,
    Initializable,
    PausableUpgradeable,
    OwnableUpgradeable
{
    using Address for address payable;
    using SafeERC20 for IERC20;

    IWETH public immutable weth;
    address public immutable routerWrapperAddress;

    event Swapped(bool zeroForOne, uint256 amount0Diff, uint256 amount1Diff);

    modifier onlyRouterWrapper() {
        require(msg.sender == routerWrapperAddress, "onlyRouterWrapper");
        _;
    }

    constructor(IWETH _weth, address _routerWrapperAddress) {
        weth = _weth;
        routerWrapperAddress = _routerWrapperAddress;
    }

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

    /// @notice addLiquidity adds liquidity to ArrakisVaultV1 pool of interest (mints LP tokens)
    /// @param pool ArrakisVaultV1 pool to add liquidity to
    /// @param _addData AddLiquidityData struct containing data for adding liquidity
    /// @param _mintData MintData struct containing exact amounts for minting
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return mintAmount amount of ArrakisVaultV1 tokens minted and transferred to `receiver`
    // solhint-disable-next-line code-complexity, function-max-lines
    function addLiquidity(
        IArrakisVaultV1 pool,
        AddLiquidityData memory _addData,
        MintData memory _mintData
    )
        external
        payable
        override
        whenNotPaused
        onlyRouterWrapper
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        )
    {
        if (_addData.gaugeAddress != address(0)) {
            (amount0, amount1, mintAmount) = _deposit(
                pool,
                _mintData.amount0In,
                _mintData.amount1In,
                _mintData.mintAmount,
                address(this)
            );

            IERC20(address(pool)).safeIncreaseAllowance(
                _addData.gaugeAddress,
                mintAmount
            );
            IGauge(_addData.gaugeAddress).deposit(
                mintAmount,
                _addData.receiver
            );
        } else {
            (amount0, amount1, mintAmount) = _deposit(
                pool,
                _mintData.amount0In,
                _mintData.amount1In,
                _mintData.mintAmount,
                _addData.receiver
            );
        }
    }

    /// @param pool ArrakisVaultV1 pool to remove liquidity from
    /// @param _removeData RemoveLiquidityData struct containing data for removing liquidity
    /// @return amount0 amount of token0 received when burning `burnAmount`
    /// @return amount1 amount of token1 received when burning `burnAmount`
    /// @return liquidityBurned liquidityBurned
    // solhint-disable-next-line function-max-lines
    function removeLiquidity(
        IArrakisVaultV1 pool,
        RemoveLiquidityData memory _removeData
    )
        external
        override
        onlyRouterWrapper
        returns (
            uint256 amount0,
            uint256 amount1,
            uint128 liquidityBurned
        )
    {
        if (_removeData.receiveETH) {
            (amount0, amount1, liquidityBurned) = pool.burn(
                _removeData.burnAmount,
                address(this)
            );
        } else {
            (amount0, amount1, liquidityBurned) = pool.burn(
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
            _receiveETH(pool, amount0, amount1, _removeData.receiver);
        }
    }

    // solhint-disable-next-line max-line-length
    /// @notice swapAndAddLiquidity makes a swap and deposits to an ArrakisVaultV1 pool and mints LP tokens
    /// @param pool The ArrakisVaultV1 pool
    /// @param _addData struct AddLiquidityData containing data for adding liquidity
    /// @param _swapData struct SwapData containing data for swap
    /// @param userToRefund address of user that called the wrapper
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return mintAmount amount of ArrakisVaultV1 tokens minted and transferred to `receiver`
    /// @return amount0Diff token0 balance difference post swap
    /// @return amount1Diff token1 balance difference post swap
    // solhint-disable-next-line code-complexity, function-max-lines
    function swapAndAddLiquidity(
        IArrakisVaultV1 pool,
        AddLiquidityData memory _addData,
        SwapData memory _swapData,
        address payable userToRefund
    )
        external
        payable
        override
        whenNotPaused
        onlyRouterWrapper
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount,
            uint256 amount0Diff,
            uint256 amount1Diff
        )
    {
        (amount0Diff, amount1Diff) = _swap(pool, _swapData);

        uint256 _mintAmount;
        uint256 amount0Use =
            (_swapData.zeroForOne)
                ? _addData.amount0Max - amount0Diff
                : _addData.amount0Max + amount0Diff;
        uint256 amount1Use =
            (_swapData.zeroForOne)
                ? _addData.amount1Max + amount1Diff
                : _addData.amount1Max - amount1Diff;

        (amount0, amount1, _mintAmount) = pool.getMintAmounts(
            amount0Use,
            amount1Use
        );

        require(
            amount0 >= _addData.amount0Min && amount1 >= _addData.amount1Min,
            "below min amounts"
        );

        if (_addData.gaugeAddress != address(0)) {
            (amount0, amount1, mintAmount) = _deposit(
                pool,
                amount0,
                amount1,
                _mintAmount,
                address(this)
            );

            IERC20(address(pool)).safeIncreaseAllowance(
                _addData.gaugeAddress,
                mintAmount
            );
            IGauge(_addData.gaugeAddress).deposit(
                mintAmount,
                _addData.receiver
            );
        } else {
            (amount0, amount1, mintAmount) = _deposit(
                pool,
                amount0,
                amount1,
                _mintAmount,
                _addData.receiver
            );
        }

        // now we send leftovers to user.
        // if we can send leftovers in WETH, this logic would be much simpler
        bool isToken0Weth;
        if (_addData.useETH) {
            isToken0Weth = _isToken0Weth(
                address(pool.token0()),
                address(pool.token1())
            );
            if (isToken0Weth && amount0Use > amount0) {
                _refundETH(userToRefund, amount0Use - amount0);
            } else if (!isToken0Weth && amount1Use > amount1) {
                _refundETH(userToRefund, amount1Use - amount1);
            }
        }

        if (
            amount0Use > amount0 &&
            (!_addData.useETH || (_addData.useETH && !isToken0Weth))
        ) {
            IERC20(pool.token0()).safeTransfer(
                userToRefund,
                amount0Use - amount0
            );
        }
        if (
            amount1Use > amount1 &&
            (!_addData.useETH || (_addData.useETH && isToken0Weth))
        ) {
            IERC20(pool.token1()).safeTransfer(
                userToRefund,
                amount1Use - amount1
            );
        }
    }

    function _deposit(
        IArrakisVaultV1 pool,
        uint256 amount0In,
        uint256 amount1In,
        uint256 _mintAmount,
        address receiver
    )
        internal
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        )
    {
        if (amount0In > 0) {
            pool.token0().safeIncreaseAllowance(address(pool), amount0In);
        }
        if (amount1In > 0) {
            pool.token1().safeIncreaseAllowance(address(pool), amount1In);
        }

        (amount0, amount1, ) = pool.mint(_mintAmount, receiver);
        require(
            amount0 == amount0In && amount1 == amount1In,
            "unexpected amounts deposited"
        );
        mintAmount = _mintAmount;
    }

    // solhint-disable-next-line code-complexity
    function _receiveETH(
        IArrakisVaultV1 pool,
        uint256 amount0,
        uint256 amount1,
        address payable receiver
    ) internal {
        IERC20 token0 = pool.token0();
        IERC20 token1 = pool.token1();
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
    function _swap(IArrakisVaultV1 _pool, SwapData memory _swapData)
        internal
        returns (uint256 amount0Diff, uint256 amount1Diff)
    {
        uint256 balance0Before = _pool.token0().balanceOf(address(this));
        uint256 balance1Before = _pool.token1().balanceOf(address(this));

        if (_swapData.zeroForOne) {
            IERC20(_pool.token0()).safeIncreaseAllowance(
                _swapData.swapRouter,
                _swapData.amountInSwap
            );
        } else {
            IERC20(_pool.token1()).safeIncreaseAllowance(
                _swapData.swapRouter,
                _swapData.amountInSwap
            );
        }

        (bool success, bytes memory returnsData) =
            _swapData.swapRouter.call(_swapData.swapPayload);
        if (!success) GelatoBytes.revertWithError(returnsData, "swap: ");

        // setting allowance to 0
        if (_swapData.zeroForOne) {
            IERC20(_pool.token0()).safeDecreaseAllowance(
                _swapData.swapRouter,
                IERC20(_pool.token0()).allowance(
                    address(this),
                    _swapData.swapRouter
                )
            );
        } else {
            IERC20(_pool.token1()).safeDecreaseAllowance(
                _swapData.swapRouter,
                IERC20(_pool.token1()).allowance(
                    address(this),
                    _swapData.swapRouter
                )
            );
        }

        uint256 balance0 = _pool.token0().balanceOf(address(this));
        uint256 balance1 = _pool.token1().balanceOf(address(this));
        if (_swapData.zeroForOne) {
            amount0Diff = balance0Before - balance0;
            amount1Diff = balance1 - balance1Before;
            require(
                balance0Before > balance0 && balance1 > balance1Before,
                "Token0 swap failed!"
            );
            require(
                _swapData.amountOutSwap < amount1Diff,
                "Minimum amount of token1 not retrieved on swap!"
            );
        } else {
            amount0Diff = balance0 - balance0Before;
            amount1Diff = balance1Before - balance1;
            require(
                balance0 > balance0Before && balance1Before > balance1,
                "Token1 swap failed!"
            );
            require(
                _swapData.amountOutSwap < amount0Diff,
                "Minimum amount of token1 not retrieved on swap!"
            );
        }

        emit Swapped(_swapData.zeroForOne, amount0Diff, amount1Diff);
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
            revert("one pool token must be WETH");
        }
    }
}
