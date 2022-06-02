# Vault V2 Router Spec

## Wrapper & Router

The functionalities of the old GUniRouter are now gonna be separated into 2 different contracts "**ArrakisV1RouterWrapper**" and "**ArrakisV1Router**" for security purposes explained in detail [here](https://dydx.exchange/blog/deposit-proxy-post-mortem).

**ArrakisV1RouterWrapper** (aka wrapper contract) receives the approval from the users, validate input data, stake/unstake, wrap eth into weth and transfer funds from user to ArrakisV1Router.

**ArrakisV1Router** (aka router contract) is responsible for executing swap payloads (prepared off-chain) and interacting with vaults (ArrakisV1Vault).

External functions in the router contract can only be called by the wrapper contract. For this, the wrapper has a function `updateRouter` to set the router address to be used. The router contract receives the wrapper address to validate on deployment (constructor).

While doing this separation, some refactoring/optimizations were done on the functions previously available on GUniRouter:

- Params were replaced by structs. Each defined struct serves a particular feature/purpose.

- `addLiquidity` and `removeLiquidity` functions now can work with native ETH transfers (deprecating `addLiquidityETH` and `removeLiquidityETH`.

- `addLiquidity` and `removeLiquidity` functions now can stake/unstake to a gauge (deprecating `addLiquidityAndStake` and `removeLiquidityAndStake`).
  -- When `gaugeAddress` is 0 => don't stake (or unstake)
  -- When `gaugeAddress` is passed, we get the gauge on that address and retrieve its `staking_token()` to compare with the `IArrakisVaultV1 pool` address

- `rebalanceAnd` functions of GUniV1Router were also updated the same way as mentioned above and renamed to `swapAndAddLiquidity`.

## Parameter structs

- AddLiquidityData is used by `addLiquidity` function on both wrapper and router contracts.

```
struct AddLiquidityData {
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
}
```

- MintData is created by `ArrakisV1RouterWrapper.addLiquidity` and passed as parameter to `ArrakisV1Router.addLiquidity`.

```
struct MintData {
    // amount of token0 to deposit
    uint256 amount0In;
    // amount of token1 to deposit
    uint256 amount1In;
    // amount of LP tokens to mint
    uint256 mintAmount;
}
```

- RemoveLiquidityData is used `removeLiquidity` function on both wrapper and router contracts.

```
struct RemoveLiquidityData {
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
```

- SwapData is used by `swapAndAddLiquidity` function

```
struct SwapData {
    // max amount being swapped
    uint256 amountInSwap;
    // min amount received on swap
    uint256 amountOutSwap;
    // bool indicating swap direction
    bool zeroForOne;
    // address for swap calls
    address swapRouter;
    // payload for swap call
    bytes[] swapPayload;
}
```

## ArrakisV1RouterWrapper

### addLiquidity

```
function addLiquidity(
    IArrakisVaultV1 pool,
    AddLiquidityData memory _addData
)
    external
    payable
    returns (
        uint256 amount0,
        uint256 amount1,
        uint256 mintAmount
    );
```

- if AddLiquidityData.useETH is true, this function will wrap ETH into WETH and send non-used ether back to the user.
- if AddLiquidityData.gaugeAddress is filled, this function will validate if the gauge's `staking_token()` matches the pool address.

## removeLiquidity

```
function removeLiquidity(
    IArrakisVaultV1 pool,
    RemoveLiquidityData memory _removeData
)
    external
    returns (
        uint256 amount0,
        uint256 amount1,
        uint128 liquidityBurned
    );
```

- if RemoveLiquidityData.gaugeAddress is filled, this function will validate if the gauge's `staking_token()` matches the pool address, claim rewards for the user and unstake.

## swapAndAddLiquidity

```
function swapAndAddLiquidity(
    IArrakisVaultV1 pool,
    AddLiquidityData memory _addData,
    SwapData memory _swapData
)
    external
    payable
    returns (
        uint256 amount0,
        uint256 amount1,
        uint256 mintAmount,
        uint256 amount0Diff,
        uint256 amount1Diff
    );
```

- if AddLiquidityData.useETH is true, this function will wrap ETH into WETH and send non-used ether back to the user.
- if AddLiquidityData.gaugeAddress is filled, this function will validate if the gauge's `staking_token()` matches the pool address.
- if the user is depositing 2 tokens and doing a swap => if token0 is being swapped for token1, AddLiquidityData.amount0Max should be the amount of token0 being deposited "normally" plus the amount to be swapped (SwapData.amountInSwap). (same applies for amount1Max on the inverse swap scenario)

### ArrakisV1Router

**Important:** Functions below can only be called by ArrakisV1RouterWrapper.

## addLiquidity

```
function addLiquidity(
    IArrakisVaultV1 pool,
    AddLiquidityData memory _addData,
    MintData memory _mintData
)
    external
    payable
    returns (
        uint256 amount0,
        uint256 amount1,
        uint256 mintAmount
    )
```

- if AddLiquidityData.gaugeAddress is filled, this function will stake the LP tokens in the gauge after depositing to the vault.

## removeLiquidity

```
function removeLiquidity(
    IArrakisVaultV1 pool,
    RemoveLiquidityData memory _removeData
)
    external
    returns (
        uint256 amount0,
        uint256 amount1,
        uint128 liquidityBurned
    )
```

- if RemoveLiquidityData.receiveETH is true, this function will unwrap WETH into ETH before transfering to the user.

## swapAndAddLiquidity

```
function swapAndAddLiquidity(
    IArrakisVaultV1 pool,
    AddLiquidityData memory _addData,
    SwapData memory _swapData,
    address payable userToRefund
)
    external
    payable
    returns (
        uint256 amount0,
        uint256 amount1,
        uint256 mintAmount,
        uint256 amount0Diff,
        uint256 amount1Diff
    )
```

- if AddLiquidityData.gaugeAddress is filled, this function will stake LP tokens in the gauge after deposit.
- if AddLiquidityData.useETH is true, this function will send unused ETH back to the user.

### Updates for additional security on swaps:

- on `ArrakisV1Router.swapAndAddLiquidity` only 1 swap action is allowed. The router will increase the allowance of the `swapRouter` for the amount being swapped.

- Implement router whitelist, so swaps are only allowed for whitelisted `_swapActions` addresses. This whitelist should be the same for all vaults, in a contract controlled by Arrakis core multisig. The whitelist's address is defined on ArrakisV1RouterWrapper to validate the address of any incoming swap.

- Validate amount post-swap. Added parameter `_amountOutSwap` to `swapAndAddLiquidity` for validating the amount received after a swap. This parameter should consider price impact/slippage when being passed and the transaction should revert if balance difference pre/post swap is less than `_amountOutSwap`.
