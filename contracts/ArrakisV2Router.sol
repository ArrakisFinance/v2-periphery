// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {IGauge} from "./interfaces/IGauge.sol";
import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
import {
    AddLiquidityData,
    RemoveLiquidityData,
    SwapAndAddData
} from "./structs/SArrakisV2Router.sol";
import {
    hundredPercent
} from "@arrakisfi/v2-core/contracts/constants/CArrakisV2.sol";
import {FullMath} from "@arrakisfi/v3-lib-0.8/contracts/FullMath.sol";
import {ArrakisV2RouterStorage} from "./abstract/ArrakisV2RouterStorage.sol";

/// @title ArrakisV2 Public Vault Router
/// @notice Smart contract for adding and removing liquidity from Public ArrakisV2 vaults
/// @author Arrakis Finance
/// @dev DO NOT ADD STATE VARIABLES - APPEND THEM TO ArrakisV2RouterStorage
contract ArrakisV2Router is ArrakisV2RouterStorage {
    using Address for address payable;
    using SafeERC20 for IERC20;

    constructor(
        address weth_,
        address resolver_,
        uint16 depositFeeBPS_,
        address feeCollector_
    ) ArrakisV2RouterStorage(weth_, resolver_, depositFeeBPS_, feeCollector_) {} // solhint-disable-line

    /// @notice addLiquidity adds liquidity to ArrakisV2 vault of interest (mints LP tokens)
    /// @param addData_ AddLiquidityData struct containing data for adding liquidity
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return sharesReceived amount of ArrakisV2 tokens transferred to `receiver`
    // solhint-disable-next-line code-complexity, function-max-lines
    function addLiquidity(AddLiquidityData memory addData_)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 sharesReceived
        )
    {
        require(
            addData_.amount0Max > 0 || addData_.amount1Max > 0,
            "Empty max amounts"
        );
        if (addData_.gauge != address(0)) {
            require(
                addData_.vault == IGauge(addData_.gauge).staking_token(),
                "Incorrect gauge!"
            );
        }

        (amount0, amount1, sharesReceived) = resolver.getMintAmounts(
            IArrakisV2(addData_.vault),
            addData_.amount0Max,
            addData_.amount1Max
        );

        require(sharesReceived > 0, "nothing to mint");
        require(
            amount0 >= addData_.amount0Min &&
                amount1 >= addData_.amount1Min &&
                sharesReceived >= addData_.amountSharesMin,
            "below min amounts"
        );

        bool isToken0Weth;
        if (addData_.useETH) {
            isToken0Weth = _wrapETH(
                IArrakisV2(addData_.vault),
                amount0,
                amount1,
                false
            );
        }

        if (
            amount0 > 0 &&
            (!addData_.useETH || (addData_.useETH && !isToken0Weth))
        ) {
            IERC20(IArrakisV2(addData_.vault).token0()).safeTransferFrom(
                msg.sender,
                address(this),
                amount0
            );
        }
        if (
            amount1 > 0 &&
            (!addData_.useETH || (addData_.useETH && isToken0Weth))
        ) {
            IERC20(IArrakisV2(addData_.vault).token1()).safeTransferFrom(
                msg.sender,
                address(this),
                amount1
            );
        }

        (amount0, amount1, sharesReceived) = _addLiquidity(
            addData_.vault,
            amount0,
            amount1,
            sharesReceived,
            addData_.gauge,
            addData_.receiver
        );

        if (addData_.useETH) {
            if (isToken0Weth && msg.value > amount0) {
                payable(msg.sender).sendValue(msg.value - amount0);
            } else if (!isToken0Weth && msg.value > amount1) {
                payable(msg.sender).sendValue(msg.value - amount1);
            }
        }
    }

    /// @notice swapAndAddLiquidity transfer tokens to and calls ArrakisV2Router
    /// @param swapAndAddData_ SwapAndAddData struct containing data for swap
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return sharesReceived amount of ArrakisV2 tokens transferred to `receiver`
    /// @return amount0Diff token0 balance difference post swap
    /// @return amount1Diff token1 balance difference post swap
    // solhint-disable-next-line code-complexity, function-max-lines
    function swapAndAddLiquidity(SwapAndAddData memory swapAndAddData_)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 sharesReceived,
            uint256 amount0Diff,
            uint256 amount1Diff
        )
    {
        require(
            swapAndAddData_.addData.amount0Max > 0 ||
                swapAndAddData_.addData.amount1Max > 0,
            "Empty max amounts"
        );
        if (swapAndAddData_.addData.gauge != address(0)) {
            require(
                swapAndAddData_.addData.vault ==
                    IGauge(swapAndAddData_.addData.gauge).staking_token(),
                "Incorrect gauge!"
            );
        }
        bool isToken0Weth;
        if (swapAndAddData_.addData.useETH) {
            isToken0Weth = _wrapETH(
                IArrakisV2(swapAndAddData_.addData.vault),
                swapAndAddData_.addData.amount0Max,
                swapAndAddData_.addData.amount1Max,
                true
            );
        }

        if (
            swapAndAddData_.addData.amount0Max > 0 &&
            (!swapAndAddData_.addData.useETH || !isToken0Weth)
        ) {
            IERC20(IArrakisV2(swapAndAddData_.addData.vault).token0())
                .safeTransferFrom(
                    msg.sender,
                    address(this),
                    swapAndAddData_.addData.amount0Max
                );
        }
        if (
            swapAndAddData_.addData.amount1Max > 0 &&
            (!swapAndAddData_.addData.useETH || isToken0Weth)
        ) {
            IERC20(IArrakisV2(swapAndAddData_.addData.vault).token1())
                .safeTransferFrom(
                    msg.sender,
                    address(this),
                    swapAndAddData_.addData.amount1Max
                );
        }

        (
            amount0,
            amount1,
            sharesReceived,
            amount0Diff,
            amount1Diff
        ) = _swapAndAddLiquidity(swapAndAddData_);
    }

    /// @notice removeLiquidity removes liquidity from vault and burns LP tokens
    /// @param removeData_ RemoveLiquidityData struct containing data for withdrawals
    /// @return amount0 actual amount of token0 transferred to receiver for burning `burnAmount`
    /// @return amount1 actual amount of token1 transferred to receiver for burning `burnAmount`
    // solhint-disable-next-line code-complexity, function-max-lines
    function removeLiquidity(RemoveLiquidityData memory removeData_)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        require(removeData_.burnAmount > 0, "nothing to burn");
        if (removeData_.gauge != address(0)) {
            require(
                removeData_.vault == IGauge(removeData_.gauge).staking_token(),
                "Incorrect gauge!"
            );
            IGauge(removeData_.gauge).claim_rewards(msg.sender);
            IERC20(removeData_.gauge).safeTransferFrom(
                msg.sender,
                address(this),
                removeData_.burnAmount
            );

            IGauge(removeData_.gauge).withdraw(removeData_.burnAmount);
            IERC20(removeData_.vault).safeTransfer(
                address(this),
                removeData_.burnAmount
            );
        } else {
            IERC20(removeData_.vault).safeTransferFrom(
                msg.sender,
                address(this),
                removeData_.burnAmount
            );
        }

        (amount0, amount1) = _removeLiquidity(removeData_);
    }

    // solhint-disable-next-line function-max-lines
    function _addLiquidity(
        address vault_,
        uint256 amount0In_,
        uint256 amount1In_,
        uint256 mintAmount_,
        address gauge_,
        address receiver_
    )
        internal
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 sharesReceived
        )
    {
        (amount0, amount1) = IArrakisV2(vault_).mint(
            mintAmount_,
            address(this)
        );

        require(
            amount0 == amount0In_ && amount1 == amount1In_,
            "unexpected amounts deposited"
        );

        IERC20 token = IERC20(vault_);
        if (gauge_ != address(0)) {
            token.safeIncreaseAllowance(gauge_, mintAmount_);

            IGauge(gauge_).deposit(mintAmount_, address(this));
            token = IERC20(gauge_);
        }

        uint256 emolument = FullMath.mulDiv(
            mintAmount_,
            depositFeeBPS,
            hundredPercent
        );
        sharesReceived = mintAmount_ - emolument;

        token.safeTransfer(receiver_, sharesReceived);
        token.safeTransfer(feeCollector, emolument);
    }

    // solhint-disable-next-line function-max-lines, code-complexity
    function _swapAndAddLiquidity(SwapAndAddData memory swapAndAddData_)
        internal
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 sharesReceived,
            uint256 amount0Diff,
            uint256 amount1Diff
        )
    {
        if (swapAndAddData_.swapData.zeroForOne) {
            IArrakisV2(swapAndAddData_.addData.vault).token0().safeTransfer(
                address(swapper),
                swapAndAddData_.swapData.amountInSwap
            );
        } else {
            IArrakisV2(swapAndAddData_.addData.vault).token1().safeTransfer(
                address(swapper),
                swapAndAddData_.swapData.amountInSwap
            );
        }

        (amount0Diff, amount1Diff) = swapper.swap(swapAndAddData_);

        emit Swapped(
            swapAndAddData_.swapData.zeroForOne,
            amount0Diff,
            amount1Diff,
            swapAndAddData_.swapData.amountOutSwap
        );

        uint256 amount0Use = (swapAndAddData_.swapData.zeroForOne)
            ? swapAndAddData_.addData.amount0Max - amount0Diff
            : swapAndAddData_.addData.amount0Max + amount0Diff;
        uint256 amount1Use = (swapAndAddData_.swapData.zeroForOne)
            ? swapAndAddData_.addData.amount1Max + amount1Diff
            : swapAndAddData_.addData.amount1Max - amount1Diff;

        (amount0, amount1, sharesReceived) = resolver.getMintAmounts(
            IArrakisV2(swapAndAddData_.addData.vault),
            amount0Use,
            amount1Use
        );

        require(
            amount0 >= swapAndAddData_.addData.amount0Min &&
                amount1 >= swapAndAddData_.addData.amount1Min &&
                sharesReceived >= swapAndAddData_.addData.amountSharesMin,
            "below min amounts"
        );

        (amount0, amount1, sharesReceived) = _addLiquidity(
            swapAndAddData_.addData.vault,
            amount0,
            amount1,
            sharesReceived,
            swapAndAddData_.addData.gauge,
            swapAndAddData_.addData.receiver
        );

        bool isToken0Weth;
        if (swapAndAddData_.addData.useETH) {
            isToken0Weth = _isToken0Weth(
                address(IArrakisV2(swapAndAddData_.addData.vault).token0()),
                address(IArrakisV2(swapAndAddData_.addData.vault).token1())
            );
            if (isToken0Weth && amount0Use > amount0) {
                _unwrapRefundETH(msg.sender, amount0Use - amount0);
            } else if (!isToken0Weth && amount1Use > amount1) {
                _unwrapRefundETH(msg.sender, amount1Use - amount1);
            }
        }

        if (
            amount0Use > amount0 &&
            (!swapAndAddData_.addData.useETH ||
                (swapAndAddData_.addData.useETH && !isToken0Weth))
        ) {
            IERC20(IArrakisV2(swapAndAddData_.addData.vault).token0())
                .safeTransfer(msg.sender, amount0Use - amount0);
        }
        if (
            amount1Use > amount1 &&
            (!swapAndAddData_.addData.useETH ||
                (swapAndAddData_.addData.useETH && isToken0Weth))
        ) {
            IERC20(IArrakisV2(swapAndAddData_.addData.vault).token1())
                .safeTransfer(msg.sender, amount1Use - amount1);
        }
    }

    function _removeLiquidity(RemoveLiquidityData memory removeData_)
        internal
        returns (uint256 amount0, uint256 amount1)
    {
        if (removeData_.receiveETH) {
            (amount0, amount1) = IArrakisV2(removeData_.vault).burn(
                removeData_.burnAmount,
                address(this)
            );
        } else {
            (amount0, amount1) = IArrakisV2(removeData_.vault).burn(
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

    /// @notice _wrapETH wrap ETH into WETH
    /// @param vault_ The ArrakisV2 vault
    /// @param amount0In_ amount of token1 to be wrapped (if isToken0Weth)
    /// @param amount1In_ amount of token1 to be wrapped (if !isToken0Weth)
    /// @param matchAmount_ bool indicating if msg.value should match amount in
    /// @return isToken0Weth bool indicating which token is WETH
    function _wrapETH(
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
    }

    function _unwrapRefundETH(address refund_, uint256 refundAmount_) internal {
        weth.withdraw(refundAmount_);
        payable(refund_).sendValue(refundAmount_);
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
