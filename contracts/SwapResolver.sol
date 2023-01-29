// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import {ISwapResolver} from "./interfaces/ISwapResolver.sol";

import {
    IArrakisV2Resolver
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Resolver.sol";
import {
    IArrakisV2Helper
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Helper.sol";
import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";

import {
    IERC20Metadata
} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {FullMath} from "@arrakisfi/v3-lib-0.8/contracts/FullMath.sol";
import {TickMath} from "@arrakisfi/v3-lib-0.8/contracts/TickMath.sol";

contract SwapResolver is ISwapResolver {
    using TickMath for int24;

    IArrakisV2Helper public immutable helper;
    IArrakisV2Resolver public immutable resolver;

    constructor(IArrakisV2Helper helper_, IArrakisV2Resolver resolver_) {
        helper = helper_;
        resolver = resolver_;
    }

    // solhint-disable-next-line function-max-lines, code-complexity
    function calculateSwapAmount(
        IArrakisV2 vault,
        uint256 amount0In,
        uint256 amount1In,
        uint256 price18Decimals
    ) external view override returns (bool zeroForOne, uint256 swapAmount) {
        (uint256 gross0, uint256 gross1) = _getUnderlyingOrLiquidity(vault);
        if (gross1 == 0) {
            return (false, amount1In);
        }
        if (gross0 == 0) {
            return (true, amount0In);
        }

        uint256 amount0Left;
        uint256 amount1Left;
        if (amount0In > 0 && amount1In > 0) {
            (uint256 amount0, uint256 amount1, ) = resolver.getMintAmounts(
                vault,
                amount0In,
                amount1In
            );
            amount0Left = amount0In - amount0;
            amount1Left = amount1In - amount1;
        } else {
            amount0Left = amount0In;
            amount1Left = amount1In;
        }

        uint256 factor0 = 10 **
            (18 - IERC20Metadata(address(vault.token0())).decimals());
        uint256 factor1 = 10 **
            (18 - IERC20Metadata(address(vault.token1())).decimals());
        uint256 weightX18 = FullMath.mulDiv(
            gross0 * factor0,
            1 ether,
            gross1 * factor1
        );
        uint256 proportionX18 = FullMath.mulDiv(
            weightX18,
            price18Decimals,
            1 ether
        );
        uint256 factorX18 = FullMath.mulDiv(
            proportionX18,
            1 ether,
            proportionX18 + 1 ether
        );

        if (amount0Left > amount1Left) {
            zeroForOne = true;
            swapAmount = FullMath.mulDiv(
                amount0Left,
                1 ether - factorX18,
                1 ether
            );
        } else if (amount1Left > amount0Left) {
            swapAmount = FullMath.mulDiv(amount1Left, factorX18, 1 ether);
        }
    }

    // #region view internal functions.

    function _getUnderlyingOrLiquidity(IArrakisV2 vault)
        internal
        view
        returns (uint256 gross0, uint256 gross1)
    {
        (gross0, gross1) = helper.totalUnderlying(vault);
        if (gross0 == 0 && gross1 == 0) {
            gross0 = vault.init0();
            gross1 = vault.init1();
        }
    }

    // #endregion view internal functions.
}
