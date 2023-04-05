// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

import {PermitTransferFrom, PermitBatchTransferFrom} from "./SPermit2.sol";

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
    // address of gauge to stake tokens in
    address gauge;
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
    address gauge;
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
}

struct SwapAndAddData {
    SwapData swapData;
    AddLiquidityData addData;
}

struct AddLiquidityPermit2Data {
    AddLiquidityData addData;
    PermitBatchTransferFrom permit;
    bytes signature;
}

struct RemoveLiquidityPermit2Data {
    RemoveLiquidityData removeData;
    PermitTransferFrom permit;
    bytes signature;
}

struct SwapAndAddPermit2Data {
    SwapAndAddData swapAndAddData;
    PermitBatchTransferFrom permit;
    bytes signature;
}
