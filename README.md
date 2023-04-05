# Vault V2 Router Spec

TODO: refactor spec to latest. Leaving here as is for now.

## Router & Swap Executor

**ArrakisV2Router** (aka router contract) receives the approval from the users, validate input data, stake/unstake, wrap eth into weth and transfer funds from user to RouterSwapExecutor.

**RouterSwapExecutor** (aka executor contract) is responsible for executing swap payloads (prepared off-chain) and interacting with vaults (ArrakisV2Vault).

External functions in the executor contract can only be called by the generic contract. For this, the generic contract has a function `updateRouter` to set the executor address to be used. The executor contract receives the generic address to validate on deployment (constructor).

## Parameter structs

- AddLiquidityData is used by `addLiquidity` function on both generic and executor contracts.

```
struct AddLiquidityData {
    // Arrakis vault
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
    // address of gauge to stake tokens in
    address gauge;
}
```

- RemoveLiquidityData is used `removeLiquidity` function on both generic and executor contracts.

```
struct RemoveLiquidityData {
    // Arrakis vault
    IVaultV2 vault;
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
    bytes swapPayload;
}
```

- SwapAndAddData struct contains all data needed for Swap and AddLiquidity

```
struct SwapAndAddData {
    SwapData swapData;
    AddLiquidityData addData;
}
```

## ArrakisV2Router

### addLiquidity

```
function addLiquidity(
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

- if msg.value is greater than 0, this function will wrap ETH into WETH and send non-used ether back to the user.
- if AddLiquidityData.gauge is filled, this function will validate if the gauge's `staking_token()` matches the vault address.

## removeLiquidity

```
function removeLiquidity(
    RemoveLiquidityData memory _removeData
)
    external
    returns (
        uint256 amount0,
        uint256 amount1,
        uint128 liquidityBurned
    );
```

- if RemoveLiquidityData.gauge is filled, this function will validate if the gauge's `staking_token()` matches the vault address, claim rewards for the user and unstake.

## swapAndAddLiquidity

```
function swapAndAddLiquidity(
    SwapAndAddData memory _swapData
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

- if msg.value is larger than 0, this function will wrap ETH into WETH and send non-used ether back to the user.
- if AddLiquidityData.gauge is filled, this function will validate if the gauge's `staking_token()` matches the vault address.
- if the user is depositing 2 tokens and doing a swap => if token0 is being swapped for token1, AddLiquidityData.amount0Max should be the amount of token0 being deposited "normally" plus the amount to be swapped (SwapData.amountInSwap). (same applies for amount1Max on the inverse swap scenario)

### RouterSwapExecutor

**Important:** Functions below can only be called by ArrakisV2Router.

## addLiquidity

```
function addLiquidity(
    MintData memory _mintData,
)
    external
    payable
    returns (
        uint256 amount0,
        uint256 amount1,
        uint256 mintAmount
    )
```

- if AddLiquidityData.gauge is filled, this function will stake the LP tokens in the gauge after depositing to the vault.

## removeLiquidity

```
function removeLiquidity(
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
    SwapAndAddData memory _swapData,
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

- if AddLiquidityData.gauge is filled, this function will stake LP tokens in the gauge after deposit.
- if msg.value is greater than 0, this function will send unused ETH back to the user.

### Updates for additional security on swaps:

- on `RouterSwapExecutor.swapAndAddLiquidity` only 1 swap action is allowed. The executor will increase the allowance of the `swapRouter` for the amount being swapped.

- Validate amount post-swap. Added parameter `_amountOutSwap` to `swapAndAddLiquidity` for validating the amount received after a swap. This parameter should consider price impact/slippage when being passed and the transaction should revert if balance difference pre/post swap is less than `_amountOutSwap`.
