import { expect } from "chai";
import { ethers, network, deployments } from "hardhat";
import {
  ArrakisV2Router,
  ArrakisV2RouterWrapper,
  SwapResolver,
  ERC20,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "./addresses";
import {
  swapTokenData,
  quote1Inch,
  mockPayloads,
  OneInchDataType,
} from "./oneInchApiIntegration";
import { BigNumber, ContractTransaction, Contract, Signer } from "ethers";
import ArrakisV2 from "@arrakisfi/vault-v2-core/deployments/polygon/ArrakisV2.json";
import ArrakisV2Factory from "@arrakisfi/vault-v2-core/deployments/polygon/ArrakisV2Factory.json";
import ArrakisV2Resolver from "@arrakisfi/vault-v2-core/deployments/polygon/ArrakisV2Resolver.json";
import UniswapV3Factory from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import UniswapV3Pool from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";

const addresses: Addresses = getAddresses(network.name);

export const swapAndAddTest = async (
  signer: SignerWithAddress,

  vaultRouter: ArrakisV2Router,
  vaultRouterWrapper: ArrakisV2RouterWrapper,
  swapResolver: SwapResolver,

  resolver: Contract,

  vault: Contract,
  token0: ERC20,
  token1: ERC20,
  rakisToken: ERC20,

  amount0Max: BigNumber,
  amount1Max: BigNumber,
  zeroForOne: boolean,
  slippage: number,
  useETH: boolean,
  mockPayloadScenario?: string,
  stRakisToken?: ERC20,
  transactionEthValue?: BigNumber,
  rebalance?: boolean
) => {
  // flag for easily switching between live 1inch api and stored mock payloads
  const shouldUseMockPayloads = true;

  const signerAddress = await signer.getAddress();

  // formatting amounts
  const decimalsToken0 = await token0.decimals();
  const decimalsToken1 = await token1.decimals();
  amount0Max = ethers.utils.parseUnits(amount0Max.toString(), decimalsToken0);
  amount1Max = ethers.utils.parseUnits(amount1Max.toString(), decimalsToken1);
  // console.log("amount0Max: ", amount0Max.toString());
  // console.log("amount1Max: ", amount1Max.toString());

  const isToken0Weth: boolean = token0.address === addresses.WETH;
  // console.log("isToken0Weth: ", isToken0Weth);

  // amounts used for getMintAmounts(), to be filled later depending on swap amounts
  let amount0Use: BigNumber;
  let amount1Use: BigNumber;

  // approve the wrapper for user's max amounts
  if (amount0Max.gt(0)) {
    await token0
      .connect(signer)
      .approve(vaultRouterWrapper.address, amount0Max);
  }
  if (amount1Max.gt(0)) {
    await token1
      .connect(signer)
      .approve(vaultRouterWrapper.address, amount1Max);
  }

  // get before balances
  const balance0Before = await token0.balanceOf(signerAddress);
  const balance1Before = await token1.balanceOf(signerAddress);
  const balanceEthBefore = await token0.provider.getBalance(signerAddress);
  const balanceRakisBefore = await rakisToken.balanceOf(signerAddress);
  const balanceStRakisBefore = stRakisToken
    ? await stRakisToken.balanceOf(signerAddress)
    : ethers.BigNumber.from(0);
  // console.log("balance0Before: ", balance0Before?.toString());
  // console.log("balance1Before: ", balance1Before?.toString());
  // console.log("balanceEthBefore: ", balanceEthBefore?.toString());

  // we store working payloads from 1inch API for the swaps needed for tests and block number tests are pinned to
  let swapParams: OneInchDataType;
  let swapAmountIn: BigNumber;
  let swapAmountOut: BigNumber;

  // const vaultNamet = (await token0.symbol()) + "/" + (await token1.symbol());

  // console.log("vaultName : ", vaultNamet);
  // console.log("scenario : ", mockPayloadScenario);

  if (mockPayloadScenario && shouldUseMockPayloads) {
    const vaultName = (await token0.symbol()) + "/" + (await token1.symbol());
    if (
      mockPayloads[vaultName] &&
      mockPayloads[vaultName][mockPayloadScenario]
    ) {
      // console.log("using mock payload...");
      swapParams = {
        to: addresses.OneInchRouter,
        data: mockPayloads[vaultName][mockPayloadScenario].payload,
      };
      swapAmountIn = ethers.BigNumber.from(
        mockPayloads[vaultName][mockPayloadScenario].swapIn
      );
      swapAmountOut = ethers.BigNumber.from(
        mockPayloads[vaultName][mockPayloadScenario].swapOut
      );
    } else {
      return Promise.reject(
        "Mock payload of 1inch api not found for this scenario!"
      );
    }
  } else {
    // get quote and swap data from live 1inch API

    const chainID =
      network.name == "hardhat"
        ? "137"
        : network.config.chainId?.toString() ?? "1";

    // amount here is not so important, as what we want is an initial price for this asset pair
    const quoteAmount = await quote1Inch(
      chainID,
      zeroForOne ? token0.address : token1.address,
      zeroForOne ? token1.address : token0.address,
      zeroForOne ? amount0Max.toString() : amount1Max.toString()
    );

    const numerator = ethers.BigNumber.from(quoteAmount).mul(
      zeroForOne
        ? ethers.BigNumber.from((10 ** decimalsToken0).toString())
        : ethers.BigNumber.from((10 ** decimalsToken1).toString())
    );
    const denominator = zeroForOne
      ? amount0Max.mul(ethers.BigNumber.from((10 ** decimalsToken1).toString()))
      : amount1Max.mul(
          ethers.BigNumber.from((10 ** decimalsToken0).toString())
        );
    const priceX18 = numerator
      .mul(ethers.utils.parseEther("1"))
      .div(denominator);
    // console.log("price check:", priceX18.toString());

    // given this price and the amounts the user is willing to spend
    // which token should be swapped and how much

    const result = await swapResolver.calculateSwapAmount(
      vault.address,
      amount0Max,
      amount1Max,
      priceX18
    );
    // console.log(
    //   "calculateSwapAmount - result.swapAmount.toString(): ",
    //   result.swapAmount.toString()
    // );
    // console.log("calculateSwapAmount - result.zeroForOne: ", result.zeroForOne);
    expect(result.zeroForOne).to.be.equals(zeroForOne);

    // now that we know how much to swap, let's get a new quote
    const quoteAmount2 = await quote1Inch(
      chainID,
      zeroForOne ? token0.address : token1.address,
      zeroForOne ? token1.address : token0.address,
      result.swapAmount.toString()
    );
    console.log("quoteAmount2:", quoteAmount2);

    const numerator2 = ethers.BigNumber.from(quoteAmount2).mul(
      zeroForOne
        ? ethers.BigNumber.from((10 ** decimalsToken0).toString())
        : ethers.BigNumber.from((10 ** decimalsToken1).toString())
    );
    const denominator2 = result.swapAmount.mul(
      zeroForOne
        ? ethers.BigNumber.from((10 ** decimalsToken1).toString())
        : ethers.BigNumber.from((10 ** decimalsToken0).toString())
    );
    const price2 = numerator2
      .mul(ethers.utils.parseEther("1"))
      .div(denominator2);
    // console.log("price2 check:", price2.toString());

    // given the new price, let's get a new swap amount
    const result2 = await swapResolver.calculateSwapAmount(
      vault.address,
      amount0Max,
      amount1Max,
      price2
    );
    // console.log(
    //   "calculateSwapAmount - result2.swapAmount.toString():",
    //   result2.swapAmount.toString()
    // );
    expect(result2.zeroForOne).to.be.equals(zeroForOne);

    // given this new swapAmount, how much of the other token will I receive?
    const quoteAmount3 = await quote1Inch(
      chainID,
      zeroForOne ? token0.address : token1.address,
      zeroForOne ? token1.address : token0.address,
      result2.swapAmount.toString()
    );
    // console.log("quoteAmount3:", quoteAmount3);

    swapAmountIn = result2.swapAmount;
    swapAmountOut = ethers.BigNumber.from(quoteAmount3);

    swapParams = await swapTokenData(
      chainID,
      zeroForOne ? token0.address : token1.address,
      zeroForOne ? token1.address : token0.address,
      swapAmountIn.toString(),
      vaultRouter.address,
      slippage.toString()
    );
  }

  // now that we have swapData, calculate amounts used for getMintAmounts()
  // if (zeroForOne) {
  //   amount0Use = amount0Max.sub(swapAmountIn);
  //   amount1Use = amount1Max.add(swapAmountOut);
  // } else {
  //   amount0Use = amount0Max.add(swapAmountOut);
  //   amount1Use = amount1Max.sub(swapAmountIn);
  // }
  // console.log("amount0Use.toString(): ", amount0Use.toString());
  // console.log("amount1Use.toString() ", amount1Use.toString());
  // const mintAmounts = await resolver.getMintAmounts(
  //   vault.address,
  //   amount0Use,
  //   amount1Use
  // );
  // console.log(
  //   "mintAmounts.amount0.toString() ",
  //   mintAmounts.amount0.toString()
  // );
  // console.log(
  //   "mintAmounts.amount1.toString() ",
  //   mintAmounts.amount1.toString()
  // );
  // console.log(
  //   "mintAmounts.mintAmount.toString() ",
  //   mintAmounts.mintAmount.toString()
  // );

  // calculate minimum amount out on the swap considering slippage passed
  const amountOut = swapAmountOut
    .mul(ethers.BigNumber.from((100 - slippage).toString()))
    .div(ethers.BigNumber.from((100).toString()));
  // console.log("amountOut.toString(): ", amountOut.toString());

  if (!rebalance) {
    rebalance = false;
  }

  // preparing parameter structs for swapAndAddLiquidity()
  const addData = {
    vault: vault.address,

    amount0Max: amount0Max,
    amount1Max: amount1Max,
    amount0Min: 0,
    amount1Min: 0,
    receiver: signerAddress,
    useETH: useETH,
    gaugeAddress: stRakisToken
      ? stRakisToken.address
      : ethers.constants.AddressZero,
  };
  const swapData = {
    amountInSwap: swapAmountIn.toString(),
    amountOutSwap: amountOut,
    zeroForOne: zeroForOne,
    swapRouter: swapParams.to,
    swapPayload: swapParams.data,

    userToRefund: "0x0000000000000000000000000000000000000000",
  };
  const addAndSwapData = {
    addData: addData,
    swapData: swapData,
  };

  // console.log("swapIn : ", swapAmountIn.toString());
  // console.log("swapOut : ", amountOut.toString());
  // console.log("to : ", swapParams.to);
  // console.log("data : ", swapParams.data);

  // flag indicating if "Swapped" event fired
  let hasSwapped = false;
  // flag indicating if "Minted" event fired
  let hasMinted = false;

  // object to be filled with "Swapped" event data
  const swapppedEventData = {
    zeroForOne: false,
    amount0Diff: ethers.BigNumber.from(0),
    amount1Diff: ethers.BigNumber.from(0),
  };

  // object to be filled with "Minted" event data
  const mintedEventData = {
    receiver: "",
    mintAmount: ethers.BigNumber.from(0),
    amount0In: ethers.BigNumber.from(0),
    amount1In: ethers.BigNumber.from(0),
    liquidityMinted: ethers.BigNumber.from(0),
  };

  // listener for getting data from "Swapped" event
  vaultRouter.on(
    "Swapped",
    (zeroForOne: boolean, amount0Diff: BigNumber, amount1Diff: BigNumber) => {
      swapppedEventData.zeroForOne = zeroForOne;
      swapppedEventData.amount0Diff = ethers.BigNumber.from(amount0Diff);
      swapppedEventData.amount1Diff = ethers.BigNumber.from(amount1Diff);
      hasSwapped = true;
    }
  );

  // listener for getting data from "Minted" event
  vault.on(
    "Minted",
    (
      receiver: string,
      mintAmount: BigNumber,
      amount0In: BigNumber,
      amount1In: BigNumber
    ) => {
      mintedEventData.receiver = receiver;
      mintedEventData.mintAmount = ethers.BigNumber.from(mintAmount);
      mintedEventData.amount0In = ethers.BigNumber.from(amount0In);
      mintedEventData.amount1In = ethers.BigNumber.from(amount1In);
      hasMinted = true;
    }
  );

  // function that returns a promise that resolves when "Swapped" and "Minted" are fired
  const getEventsData = async () => {
    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (hasSwapped && hasMinted) {
          clearInterval(interval);
          resolve();
        }
      }, 5000);
    });
  };

  let swapAndAddTxPending: ContractTransaction;

  if (useETH) {
    if (isToken0Weth) {
      const value = transactionEthValue || addAndSwapData.addData.amount0Max;
      if (value == addAndSwapData.addData.amount0Max) {
        swapAndAddTxPending = await vaultRouterWrapper.swapAndAddLiquidity(
          addAndSwapData,
          { value: value }
        );
      } else {
        await expect(
          vaultRouterWrapper.swapAndAddLiquidity(addAndSwapData, {
            value: value,
          })
        ).to.be.revertedWith("Invalid amount of ETH forwarded");
        return;
      }
    } else {
      const value = transactionEthValue || addAndSwapData.addData.amount1Max;
      if (value == addAndSwapData.addData.amount1Max) {
        swapAndAddTxPending = await vaultRouterWrapper.swapAndAddLiquidity(
          addAndSwapData,
          { value: value }
        );
      } else {
        await expect(
          vaultRouterWrapper.swapAndAddLiquidity(addAndSwapData, {
            value: value,
          })
        ).to.be.revertedWith("Invalid amount of ETH forwarded");
        return;
      }
    }
  } else {
    if (transactionEthValue) {
      swapAndAddTxPending = await vaultRouterWrapper.swapAndAddLiquidity(
        addAndSwapData,
        { value: transactionEthValue }
      );
    } else {
      swapAndAddTxPending = await vaultRouterWrapper.swapAndAddLiquidity(
        addAndSwapData
      );
    }
  }

  const swapAndAddTx = await swapAndAddTxPending.wait();

  const ethSpentForGas = swapAndAddTx.gasUsed.mul(
    swapAndAddTx.effectiveGasPrice
  );

  // wait for events to be fired so we have swap and deposit data
  await getEventsData();

  // get new balances
  const balance0After = await token0.balanceOf(signerAddress);
  const balance1After = await token1.balanceOf(signerAddress);
  const balanceEthAfter = await token0.provider.getBalance(signerAddress);
  const balanceRakisAfter = await rakisToken.balanceOf(signerAddress);
  const balanceStRakisAfter = stRakisToken
    ? await stRakisToken.balanceOf(signerAddress)
    : ethers.BigNumber.from(0);

  // calculate actual amounts used for mintAmounts after swap and validate swapAmountOut
  if (swapppedEventData.zeroForOne) {
    amount0Use = addAndSwapData.addData.amount0Max.sub(
      swapppedEventData.amount0Diff
    );
    amount1Use = addAndSwapData.addData.amount1Max.add(
      swapppedEventData.amount1Diff
    );

    expect(amountOut).to.be.lt(swapppedEventData.amount1Diff);
  } else {
    amount0Use = addAndSwapData.addData.amount0Max.add(
      swapppedEventData.amount0Diff
    );
    amount1Use = addAndSwapData.addData.amount1Max.sub(
      swapppedEventData.amount1Diff
    );

    expect(amountOut).to.be.lt(swapppedEventData.amount0Diff);
  }

  // calculate expected refunds
  const refund0 = amount0Use.sub(mintedEventData.amount0In);
  const refund1 = amount1Use.sub(mintedEventData.amount1In);

  // console.log("amount0Use: ", amount0Use.toString());
  // console.log("amount1Use: ", amount1Use.toString());
  // console.log("refund0: ", refund0.toString());
  // console.log("refund1: ", refund1.toString());
  // console.log("balanceEthAfter: ", balanceEthAfter.toString());
  // console.log("balanceEthBefore: ", balanceEthBefore.toString());
  // console.log("swapData.amount0Max: ", swapData.amount0Max.toString());
  // console.log("swapData.amount1Max: ", swapData.amount1Max.toString());
  // console.log("ethSpentForGas: ", ethSpentForGas.toString());

  // validate balances
  if (!useETH) {
    expect(balance0After).to.equal(
      balance0Before.sub(addAndSwapData.addData.amount0Max).add(refund0)
    );
    expect(balance1After).to.equal(
      balance1Before.sub(addAndSwapData.addData.amount1Max).add(refund1)
    );
    expect(balanceEthAfter).to.equal(balanceEthBefore.sub(ethSpentForGas));
  } else {
    if (isToken0Weth) {
      expect(balance0After).to.equal(balance0Before);
      expect(balance1After).to.equal(
        balance1Before.sub(addAndSwapData.addData.amount1Max).add(refund1)
      );
      expect(balanceEthAfter).to.equal(
        balanceEthBefore
          .sub(addAndSwapData.addData.amount0Max)
          .sub(ethSpentForGas)
          .add(refund0)
      );
    } else {
      expect(balance0After).to.equal(
        balance0Before.sub(addAndSwapData.addData.amount0Max).add(refund0)
      );
      expect(balance1After).to.equal(balance1Before);
      expect(balanceEthAfter).to.equal(
        balanceEthBefore
          .sub(addAndSwapData.addData.amount1Max)
          .sub(ethSpentForGas)
          .add(refund1)
      );
    }
  }

  // validate staked token balances
  if (stRakisToken) {
    expect(balanceRakisBefore).to.be.eq(balanceRakisAfter);
    expect(balanceStRakisBefore).to.be.lt(balanceStRakisAfter);
  } else {
    expect(balanceRakisBefore).to.be.lt(balanceRakisAfter);
    expect(balanceStRakisBefore).to.be.eq(balanceStRakisAfter);
  }

  // validate router balances
  const routerBalance0 = await token0.balanceOf(vaultRouter.address);
  const routerBalance1 = await token1.balanceOf(vaultRouter.address);
  const routerBalanceRakis = await rakisToken.balanceOf(vaultRouter.address);
  expect(routerBalance0).to.equal(ethers.constants.Zero);
  expect(routerBalance1).to.equal(ethers.constants.Zero);
  expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
  if (stRakisToken) {
    const routerBalanceStRakis = await stRakisToken.balanceOf(
      vaultRouter.address
    );
    expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
  }

  // validate router - 1inch allowance
  const routerAllowance0 = await token0.allowance(
    vaultRouter.address,
    addresses.OneInchRouter
  );
  const routerAllowance1 = await token1.allowance(
    vaultRouter.address,
    addresses.OneInchRouter
  );
  expect(routerAllowance0).to.equal(ethers.constants.Zero);
  expect(routerAllowance1).to.equal(ethers.constants.Zero);

  // validate wrapper balances
  const wrapperBalance0 = await token0.balanceOf(vaultRouterWrapper.address);
  const wrapperBalance1 = await token1.balanceOf(vaultRouterWrapper.address);
  const wrapperBalanceRakis = await rakisToken.balanceOf(
    vaultRouterWrapper.address
  );
  expect(wrapperBalance0).to.equal(ethers.constants.Zero);
  expect(wrapperBalance1).to.equal(ethers.constants.Zero);
  expect(wrapperBalanceRakis).to.equal(ethers.constants.Zero);
  if (stRakisToken) {
    const wrapperBalanceStRakis = await stRakisToken.balanceOf(
      vaultRouterWrapper.address
    );
    expect(wrapperBalanceStRakis).to.equal(ethers.constants.Zero);
  }

  await expect(
    resolver.getMintAmounts(vault.address, refund0, refund1)
  ).to.be.revertedWith("ArrakisVaultV2: mint 0");
};

export const getPeripheryContracts = async (
  owner: Signer
): Promise<[SwapResolver, ArrakisV2Router, ArrakisV2RouterWrapper]> => {
  // getting resolver contract
  const resolverAddress = (await deployments.get("SwapResolver")).address;
  const swapResolver = (await ethers.getContractAt(
    "SwapResolver",
    resolverAddress
  )) as SwapResolver;

  // getting router contract
  const vaultRouterAddress = (await deployments.get("ArrakisV2Router")).address;
  const vaultRouter = (await ethers.getContractAt(
    "ArrakisV2Router",
    vaultRouterAddress
  )) as ArrakisV2Router;

  // getting wrapper contract
  const vaultRouterWrapperAddress = (
    await deployments.get("ArrakisV2RouterWrapper")
  ).address;
  const vaultRouterWrapper = (await ethers.getContractAt(
    "ArrakisV2RouterWrapper",
    vaultRouterWrapperAddress
  )) as ArrakisV2RouterWrapper;

  // updating wrapper's router
  await vaultRouterWrapper.connect(owner).updateRouter(vaultRouter.address);

  return [swapResolver, vaultRouter, vaultRouterWrapper];
};

export const deployArrakisV2 = async (
  signer: SignerWithAddress,
  token0Address: string,
  token1Address: string,
  fee: number,
  resolver: Contract
): Promise<[Contract]> => {
  const signerAddress = await signer.getAddress();

  // getting vault factory
  const vaultV2Factory = new ethers.Contract(
    addresses.ArrakisV2Factory,
    ArrakisV2Factory.abi,
    signer
  );

  // getting uniswap factory
  const uniswapV3Factory = new ethers.Contract(
    addresses.UniswapV3Factory,
    UniswapV3Factory.abi,
    signer
  );

  // getting pool address
  const poolAddress = await uniswapV3Factory.getPool(
    token0Address,
    token1Address,
    fee
  );
  console.log("poolAddress: ", poolAddress);

  // getting uniswap pool
  const uniswapV3Pool = new ethers.Contract(
    poolAddress,
    UniswapV3Pool.abi,
    signer
  );

  // getting pool data
  const slot0 = await uniswapV3Pool.slot0();
  const tickSpacing = await uniswapV3Pool.tickSpacing();
  const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
  const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;
  console.log("slot0: ", slot0);
  // get initial amounts
  const res = await resolver.getAmountsForLiquidity(
    slot0.tick,
    lowerTick,
    upperTick,
    ethers.utils.parseUnits("1", 18)
  );
  console.log("res: ", res);
  // deploying vault
  const tx = await vaultV2Factory.deployVault(
    {
      feeTiers: [fee],
      token0: token0Address,
      token1: token1Address,
      owner: signerAddress,
      init0: res.amount0,
      init1: res.amount1,
      manager: signerAddress,
    },
    true
  );
  console.log("vault deployed..");
  const rc = await tx.wait();
  const event = rc?.events?.find(
    (event: any) => event.event === "VaultCreated"
  );
  // eslint-disable-next-line no-unsafe-optional-chaining
  const result = event?.args;
  console.log("result: ", result);
  console.log("vaultAddress: ", result?.vault);
  // getting vault
  const vault = new ethers.Contract(result?.vault, ArrakisV2.abi, signer);

  return [vault];
};

export const getFundsFromFaucet = async (
  faucetAddress: string,
  token: ERC20,
  targetAddress: string
) => {
  await network.provider.send("hardhat_setBalance", [
    faucetAddress,
    "0x313030303030303030303030303030303030303030",
  ]);
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [faucetAddress],
  });
  const faucetSigner = await ethers.provider.getSigner(faucetAddress);
  await token
    .connect(faucetSigner)
    .transfer(targetAddress, await token.balanceOf(faucetAddress));

  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [faucetAddress],
  });
};

export const createGauge = async (
  vaultAddress: string
): Promise<[Contract, ERC20]> => {
  const gaugeMockFactory = await ethers.getContractFactory("GaugeMock");

  const gauge = await gaugeMockFactory.deploy(vaultAddress, {
    gasLimit: 6000000,
  });

  const stRakisToken = (await ethers.getContractAt(
    "ERC20",
    gauge.address
  )) as ERC20;

  return [gauge, stRakisToken];
};

export const getArrakisResolver = async (
  signer: SignerWithAddress
): Promise<Contract> => {
  console.log("getArrakisResolver");
  const resolver = new ethers.Contract(
    addresses.ArrakisV2Resolver,
    ArrakisV2Resolver.abi,
    signer
  );
  return resolver;
};
