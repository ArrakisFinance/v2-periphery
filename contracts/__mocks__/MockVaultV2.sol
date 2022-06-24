// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    EnumerableSet
} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {FullMath} from "../vendor/uniswap/LiquidityAmounts.sol";
import {
    BurnLiquidity
} from "../structs/SVaultV2.sol";

import {
    ERC20
} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockVaultV2 is ERC20 {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    IERC20 public token0;
    IERC20 public token1;

    uint256 public reserves0;
    uint256 public reserves1;

    event Minted(
        address receiver,
        uint256 mintAmount,
        uint256 amount0In,
        uint256 amount1In
    );

    event Burned(
        address receiver,
        uint256 burnAmount,
        uint256 amount0Out,
        uint256 amount1Out
    );

    // solhint-disable-next-line no-empty-blocks
    constructor(
        uint256 reserves0_,
        uint256 reserves1_,
        uint256 totalSupply_,
        address token0_,
        address token1_
    ) ERC20("Rakis", "RAKIS") {
        token0 = IERC20(token0_);
        token1 = IERC20(token1_);
        
        reserves0 = reserves0_;
        reserves1 = reserves1_;
        _mint(msg.sender, totalSupply_);
    }

    function mint(uint256 mintAmount_, address receiver_)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        require(mintAmount_ > 0, "mint amount");
        uint256 totalSupply = totalSupply();
        uint256 denominator = totalSupply > 0 ? totalSupply : 1 ether;
        amount0 = FullMath.mulDivRoundingUp(mintAmount_, reserves0, denominator);
        amount1 = FullMath.mulDivRoundingUp(mintAmount_, reserves1, denominator);

        _mint(receiver_, mintAmount_);

        // transfer amounts owed to contract
        if (amount0 > 0) {
            token0.safeTransferFrom(msg.sender, address(this), amount0);
            reserves0 += amount0;
        }
        if (amount1 > 0) {
            token1.safeTransferFrom(msg.sender, address(this), amount1);
            reserves1 += amount1;
        }

        emit Minted(receiver_, mintAmount_, amount0, amount1);
    }

    // solhint-disable-next-line function-max-lines, code-complexity
    function burn(
        BurnLiquidity[] calldata burns,
        uint256 burnAmount_,
        address receiver_
    ) external returns (uint256 amount0, uint256 amount1) {
        uint256 totalSupply = totalSupply();
        require(totalSupply > 0, "total supply");
        require(burns.length == 0, "burns[] should be empty on mock contract");

        amount0 = FullMath.mulDiv(
            reserves0,
            burnAmount_,
            totalSupply
        );
        amount1 = FullMath.mulDiv(
            reserves1,
            burnAmount_,
            totalSupply
        );

        _burn(msg.sender, burnAmount_);
        
        if (amount0 > 0) {
            token0.safeTransfer(receiver_, amount0);
            reserves0 -= amount0;
        }

        if (amount1 > 0) {
            token1.safeTransfer(receiver_, amount1);
            reserves1 -= amount1;
        }

        emit Burned(receiver_, burnAmount_, amount0, amount1);
    }
}
