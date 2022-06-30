// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.13;

import {BurnLiquidity} from "./SVaultV2.sol";

import {IVaultV2} from "../interfaces/IVaultV2.sol";
import {IGauge} from "../interfaces/IGauge.sol";

struct AddLiquidityData {
    // address of ArrakisV2 vault
    IVaultV2 vault;
    // maximum amount of token0 to forward on mint
    uint256 amount0Max;
    // maximum amount of token1 to forward on mint
    uint256 amount1Max;
    // the minimum amount of token0 actually deposited (slippage protection)
    uint256 amount0Min;
    // the minimum amount of token1 actually deposited (slippage protection)
    uint256 amount1Min;
    // account to receive minted tokens
    address receiver;
    // bool indicating to use native ETH
    bool useETH;
    // address of gauge to stake tokens in
    address gaugeAddress;
    // bool indicating whether to call AutoOperator to rebalance
    bool rebalance;
}

struct MintData {
    // address of ArrakisV2 vault
    IVaultV2 vault;
    // amount of token0 to deposit
    uint256 amount0In;
    // amount of token1 to deposit
    uint256 amount1In;
    // amount of LP tokens to mint
    uint256 mintAmount;
    // account to receive minted tokens
    address receiver;
    // address of gauge to stake tokens in
    address gaugeAddress;
}

struct RemoveLiquidityData {
    // address of ArrakisV2 vault
    IVaultV2 vault;
    // array of BurnLiquidity
    BurnLiquidity[] burns;
    // amount of LP tokens to burn
    uint256 burnAmount;
    // minimum amount of token0 to receive
    uint256 amount0Min;
    // minimum amount of token1 to receive
    uint256 amount1Min;
    // address to receive underlying tokens
    address payable receiver;
    // bool indicating if user wants to receive in native ETH
    bool receiveETH;
    // address of gauge to unstake from
    address gaugeAddress;
}

struct AddAndSwapData {
    // address of ArrakisV2 vault
    IVaultV2 vault;
    // maximum amount of token0 to forward on mint
    uint256 amount0Max;
    // maximum amount of token1 to forward on mint
    uint256 amount1Max;
    // the minimum amount of token0 actually deposited (slippage protection)
    uint256 amount0Min;
    // the minimum amount of token1 actually deposited (slippage protection)
    uint256 amount1Min;
    // account to receive minted tokens
    address receiver;
    // bool indicating to use native ETH
    bool useETH;
    // address of gauge to stake tokens in
    address gaugeAddress;
    // max amount being swapped
    uint256 amountInSwap;
    // min amount received on swap
    uint256 amountOutSwap;
    // bool indicating swap direction
    bool zeroForOne;
    // address for swap calls
    address swapRouter;
    // payload for swap call
    bytes swapPayload;
    // address of the user to be refunded
    address payable userToRefund;
    // bool indicating whether to call AutoOperator to rebalance
    bool rebalance;
}
