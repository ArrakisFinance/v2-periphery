// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.13;

import {
    IUniswapV3Factory
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InitializeParams} from "../structs/SVaultV2.sol";
import {Range, Burn} from "../structs/SVaultV2.sol";

interface IVaultV2 {
    function initialize(
        string calldata name_,
        string calldata symbol_,
        InitializeParams calldata params_
    ) external;
    
    function mint(uint256 mintAmount_, address receiver_)
        external
        returns (uint256 amount0, uint256 amount1);
    
    function burn(
        Burn[] calldata burns,
        uint256 burnAmount_,
        address receiver_
    ) external returns (uint256 amount0, uint256 amount1);

    function totalSupply() external view returns (uint256);

    function factory() external view returns (IUniswapV3Factory);

    function token0() external view returns (IERC20);

    function token1() external view returns (IERC20);

    function init0() external view returns (uint256);

    function init1() external view returns (uint256);

    function rangesLength() external view returns (uint256);

    function rangesArray() external view returns (Range[] memory);

    function managerFeeBPS() external view returns (uint16);

    function arrakisFeeBPS() external view returns (uint16);

    function getUnderlyingBalances()
        external
        view
        returns (uint256 amount0Current, uint256 amount1Current);
}
