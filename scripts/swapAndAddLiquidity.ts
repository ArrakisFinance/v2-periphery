import hre, { ethers, getNamedAccounts } from "hardhat";
import { getAddresses } from "../src/addresses";
import { abi as SWAP_ROUTER_ABI } from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";
import { abi as ERC_20 } from "@openzeppelin/contracts/build/contracts/ERC20.json";
import * as MulticallABI from "./abis/Multicall.json";

const ARRAKIS_V2_ROUTER = "0x6aC8Bab8B775a03b8B72B2940251432442f61B94";

const vaultAddress = "0x5ee3148bfC8B449B9E565178927b1A6028adc49A";

const amountMax0 = ethers.utils.parseUnits("0.025", 18).div(2);
const amountMax1 = "25000000";

const amountToSwap = "";

// #region tokens approve.

// eslint-disable
const token0Address = "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb";
const token1Address = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607";

// #endregion tokens approve.

// #region swap on uniswap parameters.

const tokenIn = "";
const tokenOut = "";
const feeTier = 500;

// #endregion swap on uniswap parameters.

const multicallAddress = "0xeefba1e63905ef1d7acba5a8513c70307c1ce441";

async function main() {
  const addresses = getAddresses(hre.network.name);

  const { minter } = await getNamedAccounts();
  const signer = await ethers.getSigner(minter);

  const arrakisV2Resolver = await ethers.getContractAt(
    "ArrakisV2Resolver",
    addresses.ArrakisV2Resolver,
    signer
  );
  const arrakisV2Router = await ethers.getContractAt(
    "ArrakisV2Router",
    ARRAKIS_V2_ROUTER,
    signer
  );
  const swapRouter = new ethers.Contract(
    addresses.SwapRouter,
    SWAP_ROUTER_ABI,
    signer
  );

  const token0 = await ethers.getContractAt(ERC_20, token0Address, signer);
  const token1 = await ethers.getContractAt(ERC_20, token1Address, signer);
  const multicall = await ethers.getContractAt(
    MulticallABI,
    multicallAddress,
    signer
  );

  const exactInputSingleParams = {
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    fee: feeTier,
    recipient: minter,
    deadline: ethers.constants.MaxUint256,
    amountIn: amountToSwap,
    amountOutMinimum: ethers.constants.Zero,
    sqrtPriceLimitX96: ethers.constants.Zero,
  };

  const approveData = token0.interface.encodeFunctionData("approve", [
    addresses.SwapRouter,
    amountToSwap,
  ]);
  const exactInputSingleData = swapRouter.interface.encodeFunctionData(
    "exactInputSingle",
    [exactInputSingleParams]
  );

  const multicallResult = await multicall.callStatic.aggregate([
    { target: tokenIn, callData: approveData },
    { target: addresses.SwapRouter, callData: exactInputSingleData },
  ]);

  const amountOut = multicallResult.returnData[1];

  exactInputSingleParams.amountOutMinimum = amountOut;

  const swapPayload = swapRouter.interface.encodeFunctionData(
    "exactInputSingle",
    [exactInputSingleParams]
  );

  const result = await arrakisV2Resolver.callStatic.getMintAmounts(
    vaultAddress,
    amountMax0,
    amountMax1
  );

  // console.log(result.amount0.toString());
  // console.log(result.amount1.toString());
  // console.log(result.mintAmount.toString());

  const swapData = {
    swapPayload: swapPayload,
    amountInSwap: amountToSwap,
    amountOutSwap: amountOut,
    swapRouter: addresses.SwapRouter,
    zeroForOne: false,
  };

  const addLiquidityData = {
    amount0Max: result.amount0,
    amount1Max: result.amount1,
    amount0Min: 0,
    amount1Min: 0,
    amountSharesMin: result.mintAmount,
    vault: vaultAddress,
    receiver: minter,
    gauge: ethers.constants.AddressZero,
  };

  const balance0 = await token0.balanceOf(minter);
  console.log("Balance 0 : ", balance0.toString());
  const balance1 = await token1.balanceOf(minter);
  console.log("Balance 1 : ", balance1.toString());

  if (tokenIn.toString() === token0Address.toString())
    result.amount0.add(amountToSwap);
  else result.amount1.add(amountToSwap);

  await token0.approve(arrakisV2Router.address, result.amount0);
  console.log("approved token 0");
  await token1.approve(arrakisV2Router.address, result.amount1);
  console.log("approved token 1");

  await arrakisV2Router.swapAndAddLiquidity({
    addData: addLiquidityData,
    swapData: swapData,
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
