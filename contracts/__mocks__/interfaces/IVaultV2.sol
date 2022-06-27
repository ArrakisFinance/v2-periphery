// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BurnLiquidity} from "../../structs/SVaultV2.sol";

interface IVaultV2 {
    function mint(uint256 mintAmount_, address receiver_)
        external
        returns (uint256 amount0, uint256 amount1);

    function burn(
        BurnLiquidity[] calldata burns,
        uint256 burnAmount_,
        address receiver_
    ) external returns (uint256 amount0, uint256 amount1);

    function totalSupply() external view returns (uint256);

    function token0() external view returns (IERC20);

    function token1() external view returns (IERC20);

    function reserves0() external view returns (uint256);

    function reserves1() external view returns (uint256);

    function init0() external view returns (uint256);

    function init1() external view returns (uint256);
}
