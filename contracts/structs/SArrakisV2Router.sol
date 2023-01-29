// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.13;

import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
import {IGauge} from "../interfaces/IGauge.sol";

struct AddLiquidityData {
    // address of ArrakisV2 vault
    address vault;
    // maximum amount of token0 to forward on mint
    uint256 amount0Max;
    // maximum amount of token1 to forward on mint
    uint256 amount1Max;
    // the minimum amount of token0 actually deposited (slippage protection)
    uint256 amount0Min;
    // the minimum amount of token1 actually deposited (slippage protection)
    uint256 amount1Min;
    // the minimum amount of shares actually minted (slippage protection)
    uint256 amountSharesMin;
    // account to receive minted tokens
    address receiver;
    // bool indicating to use native ETH
    bool useETH;
    // address of gauge to stake tokens in
    address gaugeAddress;
}

struct RemoveLiquidityData {
    // address of ArrakisV2 vault
    address vault;
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

struct SwapData {
    // max amount being swapped
    uint256 amountInSwap;
    // min amount received on swap
    uint256 amountOutSwap;
    // bool indicating swap direction
    bool zeroForOne;
    // address for swap call
    address swapRouter;
    // payload for swap call
    bytes swapPayload;
    // address of the user to be refunded
    address payable userToRefund;
}

struct SwapAndAddData {
    SwapData swapData;
    AddLiquidityData addData;
}
