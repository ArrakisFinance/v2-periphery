// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {IRouterSwapExecutor} from "./interfaces/IRouterSwapExecutor.sol";
import {SwapAndAddData} from "./structs/SArrakisV2Router.sol";
import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice External function of this contract can only be called by ArrakisV2Router
/// @notice do not give approvals to this contract's address
contract RouterSwapExecutor is IRouterSwapExecutor {
    using SafeERC20 for IERC20;

    address public immutable router;

    modifier onlyRouter() {
        require(msg.sender == router, "R");
        _;
    }

    constructor(address _router) {
        router = _router;
    }

    // solhint-disable-next-line function-max-lines
    function swap(SwapAndAddData memory swapAndAddData_)
        external
        onlyRouter
        returns (uint256 amount0Diff, uint256 amount1Diff)
    {
        IERC20 token0 = IArrakisV2(swapAndAddData_.addData.vault).token0();
        IERC20 token1 = IArrakisV2(swapAndAddData_.addData.vault).token1();

        if (swapAndAddData_.swapData.zeroForOne) {
            token0.safeApprove(
                swapAndAddData_.swapData.swapRouter,
                swapAndAddData_.swapData.amountInSwap
            );
        } else {
            token1.safeApprove(
                swapAndAddData_.swapData.swapRouter,
                swapAndAddData_.swapData.amountInSwap
            );
        }
        (bool success, ) = swapAndAddData_.swapData.swapRouter.call(
            swapAndAddData_.swapData.swapPayload
        );
        require(success, "swap: low-level call failed");

        // setting allowance to 0
        if (swapAndAddData_.swapData.zeroForOne) {
            token0.safeApprove(swapAndAddData_.swapData.swapRouter, 0);
        } else {
            token1.safeApprove(swapAndAddData_.swapData.swapRouter, 0);
        }

        uint256 balance0 = token0.balanceOf(address(this));
        uint256 balance1 = token1.balanceOf(address(this));
        if (swapAndAddData_.swapData.zeroForOne) {
            amount0Diff = swapAndAddData_.swapData.amountInSwap - balance0;
            amount1Diff = balance1;
            require(
                amount1Diff >= swapAndAddData_.swapData.amountOutSwap,
                "swap: received below minimum"
            );
        } else {
            amount0Diff = balance0;
            amount1Diff = swapAndAddData_.swapData.amountInSwap - balance1;
            require(
                amount0Diff >= swapAndAddData_.swapData.amountOutSwap,
                "swap: received below minimum"
            );
        }

        token0.safeTransfer(router, balance0);
        token1.safeTransfer(router, balance1);
    }
}
