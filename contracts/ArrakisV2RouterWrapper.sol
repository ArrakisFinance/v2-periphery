// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.13;

import {
    IGauge,
    IArrakisV2Router,
    AddLiquidityData,
    MintData,
    RemoveLiquidityData,
    SwapData
} from "./interfaces/IArrakisV2Router.sol";
import {IVaultV2} from "./interfaces/IVaultV2.sol";
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
import {
    IArrakisV2RouterWrapper
} from "./interfaces/IArrakisV2RouterWrapper.sol";
import {IVaultV2Resolver} from "./interfaces/IVaultV2Resolver.sol";

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
    IVaultV2Resolver public immutable resolver;
    IArrakisV2Router public router;

    constructor(IWETH _weth, IVaultV2Resolver _resolver) {
        weth = _weth;
        resolver = _resolver;
    }

    function initialize() external initializer {
        __Pausable_init();
        __Ownable_init();
        __ReentrancyGuard_init();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice addLiquidity adds liquidity to ArrakisVaultV1 pool of interest (mints LP tokens)
    /// @param pool address of ArrakisVaultV1 pool to add liquidity to
    /// @param _addData AddLiquidityData struct containing data for adding liquidity
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return mintAmount amount of ArrakisVaultV1 tokens minted and transferred to `receiver`
    // solhint-disable-next-line code-complexity, function-max-lines
    function addLiquidity(
        IVaultV2 pool,
        AddLiquidityData memory _addData
    )
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
        require(
            _addData.amount0Max > 0 || _addData.amount1Max > 0,
            "Empty max amounts"
        );
        (uint256 amount0In, uint256 amount1In, uint256 _mintAmount) =
            resolver.getMintAmounts(
                pool,
                _addData.amount0Max,
                _addData.amount1Max
            );
        require(
            amount0In >= _addData.amount0Min &&
                amount1In >= _addData.amount1Min,
            "below min amounts"
        );
        require(_mintAmount > 0, "nothing to mint");

        if (_addData.gaugeAddress != address(0)) {
            require(
                address(pool) == IGauge(_addData.gaugeAddress).staking_token(),
                "Incorrect gauge!"
            );
        }

        bool isToken0Weth;
        if (_addData.useETH) {
            isToken0Weth = _wrapAndTransferETH(pool, amount0In, amount1In);
        }

        if (
            amount0In > 0 &&
            (!_addData.useETH || (_addData.useETH && !isToken0Weth))
        ) {
            IERC20(pool.token0()).safeTransferFrom(
                msg.sender,
                address(router),
                amount0In
            );
        }
        if (
            amount1In > 0 &&
            (!_addData.useETH || (_addData.useETH && isToken0Weth))
        ) {
            IERC20(pool.token1()).safeTransferFrom(
                msg.sender,
                address(router),
                amount1In
            );
        }

        MintData memory _mintData = MintData(amount0In, amount1In, _mintAmount);
        (amount0, amount1, mintAmount) = router.addLiquidity(
            pool,
            _addData,
            _mintData
        );

        if (_addData.useETH) {
            if (isToken0Weth && _addData.amount0Max > amount0) {
                payable(msg.sender).sendValue(_addData.amount0Max - amount0);
            } else if (!isToken0Weth && _addData.amount1Max > amount1) {
                payable(msg.sender).sendValue(_addData.amount1Max - amount1);
            }
        }
    }

    /// @notice removeLiquidity removes liquidity from vault and burns LP tokens
    /// @param pool address of ArrakisVaultV1 pool to remove liquidity from
    /// @param _removeData RemoveLiquidityData struct containing data for withdrawals
    /// @return amount0 actual amount of token0 transferred to receiver for burning `burnAmount`
    /// @return amount1 actual amount of token1 transferred to receiver for burning `burnAmount`
    // solhint-disable-next-line code-complexity, function-max-lines
    function removeLiquidity(
        IVaultV2 pool,
        RemoveLiquidityData memory _removeData
    )
        external
        override
        whenNotPaused
        nonReentrant
        returns (
            uint256 amount0,
            uint256 amount1
        )
    {
        require(_removeData.burnAmount > 0, "nothing to burn");
        if (_removeData.gaugeAddress != address(0)) {
            require(
                address(pool) ==
                    IGauge(_removeData.gaugeAddress).staking_token(),
                "Incorrect gauge!"
            );
            IGauge(_removeData.gaugeAddress).claim_rewards(msg.sender);
            IERC20(_removeData.gaugeAddress).safeTransferFrom(
                msg.sender,
                address(this),
                _removeData.burnAmount
            );

            IGauge(_removeData.gaugeAddress).withdraw(_removeData.burnAmount);
            IERC20(address(pool)).safeTransfer(
                address(router),
                _removeData.burnAmount
            );
        } else {
            IERC20(address(pool)).safeTransferFrom(
                msg.sender,
                address(router),
                _removeData.burnAmount
            );
        }
        (amount0, amount1) = router.removeLiquidity(
            pool,
            _removeData
        );
    }

    /// @notice swapAndAddLiquidity transfer tokens to and calls ArrakisV1Router
    /// @param pool The ArrakisVaultV1 pool
    /// @param _addData AddLiquidityData struct containing data for adding liquidity
    /// @param _swapData SwapData struct containing data for swap
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return mintAmount amount of ArrakisVaultV1 tokens minted and transferred to `receiver`
    /// @return amount0Diff token0 balance difference post swap
    /// @return amount1Diff token1 balance difference post swap
    // solhint-disable-next-line code-complexity, function-max-lines
    function swapAndAddLiquidity(
        IVaultV2 pool,
        AddLiquidityData memory _addData,
        SwapData memory _swapData
    )
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
            _addData.amount0Max > 0 || _addData.amount1Max > 0,
            "Empty max amounts"
        );
        if (_addData.gaugeAddress != address(0)) {
            require(
                address(pool) == IGauge(_addData.gaugeAddress).staking_token(),
                "Incorrect gauge!"
            );
        }
        bool isToken0Weth;
        if (_addData.useETH) {
            isToken0Weth = _wrapAndTransferETH(
                pool,
                _addData.amount0Max,
                _addData.amount1Max
            );
        }

        if (
            _addData.amount0Max > 0 &&
            (!_addData.useETH || (_addData.useETH && !isToken0Weth))
        ) {
            IERC20(pool.token0()).safeTransferFrom(
                msg.sender,
                address(router),
                _addData.amount0Max
            );
        }
        if (
            _addData.amount1Max > 0 &&
            (!_addData.useETH || (_addData.useETH && isToken0Weth))
        ) {
            IERC20(pool.token1()).safeTransferFrom(
                msg.sender,
                address(router),
                _addData.amount1Max
            );
        }

        (amount0, amount1, mintAmount, amount0Diff, amount1Diff) = router
            .swapAndAddLiquidity(
            pool,
            _addData,
            _swapData,
            payable(msg.sender)
        );
    }

    /// @notice updates address of ArrakisV1Router used by this wrapper
    /// @param _router the router address
    function updateRouter(IArrakisV2Router _router) external onlyOwner {
        router = _router;
    }

    /// @notice _wrapAndTransferETH wrap ETH into WETH and transfers to router
    /// @param pool The ArrakisVaultV1 pool
    /// @param amount0In amount of token1 to be wrapped and transfered (if isToken0Weth)
    /// @param amount1In amount of token1 to be wrapped and transfered (if !isToken0Weth)
    /// @return isToken0Weth bool indicating which token is WETH
    function _wrapAndTransferETH(
        IVaultV2 pool,
        uint256 amount0In,
        uint256 amount1In
    ) internal returns (bool isToken0Weth) {
        isToken0Weth = _isToken0Weth(
            address(pool.token0()),
            address(pool.token1())
        );
        require(
            (isToken0Weth && amount0In <= msg.value) ||
                (!isToken0Weth && amount1In <= msg.value),
            "Not enough ETH forwarded"
        );
        if (isToken0Weth && amount0In > 0) {
            weth.deposit{value: amount0In}();
            IERC20(address(weth)).safeTransfer(address(router), amount0In);
        }
        if (!isToken0Weth && amount1In > 0) {
            weth.deposit{value: amount1In}();
            IERC20(address(weth)).safeTransfer(address(router), amount1In);
        }
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
