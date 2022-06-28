import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import {
  ArrakisV2Router,
  ArrakisV2RouterWrapper,
  ArrakisV2Resolver,
  ERC20,
  IVaultV2,
  IVaultV2Factory,
  IUniswapV3Pool,
  IUniswapV3Factory,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";
import {
  swapTokenData,
  quote1Inch,
  mockPayloads,
  OneInchDataType,
} from "../src/oneInchApiIntegration";
import Gauge from "../src/LiquidityGaugeV4.json";
import VaultV2 from "../deployJSON/VaultV2.json";
import VaultV2Factory from "../deployJSON/VaultV2Factory.json";
import { BigNumber, Contract, ContractTransaction } from "ethers";

let addresses: Addresses;

const ANGLE = "0x31429d1856aD1377A8A0079410B297e1a9e214c2";
const veANGLE = "0x0C462Dbb9EC8cD1630f1728B2CFD2769d09f0dd5";
const veBoost = "0x52701bFA0599db6db2b2476075D9a2f4Cb77DAe3";

// const WAD = ethers.BigNumber.from("10").pow("18");

// flag for easily switching between live 1inch api and stored mock payloads
const shouldUseMockPayloads = true;

describe("ArrakisV2Router tests", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let walletAddress: string;

  let token0: ERC20;
  let token1: ERC20;
  let rakisToken: ERC20;
  let stRakisToken: ERC20;

  let resolver: ArrakisV2Resolver;
  let vaultRouterWrapper: ArrakisV2RouterWrapper;
  let vaultRouter: ArrakisV2Router;

  let vaultV2Factory: IVaultV2Factory;
  let vault: IVaultV2;

  let gauge: Contract;
  let routerBalanceEth: BigNumber | undefined;

  const swapAndAddTest = async (
    vault: IVaultV2,
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
    transactionEthValue?: BigNumber
  ) => {
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
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount0Max);
    }
    if (amount1Max.gt(0)) {
      await token1
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount1Max);
    }

    // get before balances
    const balance0Before = await token0.balanceOf(walletAddress);
    const balance1Before = await token1.balanceOf(walletAddress);
    const balanceEthBefore = await token0.provider.getBalance(walletAddress);
    const balanceRakisBefore = await rakisToken.balanceOf(walletAddress);
    const balanceStRakisBefore = stRakisToken
      ? await stRakisToken.balanceOf(walletAddress)
      : ethers.BigNumber.from(0);
    // console.log("balance0Before: ", balance0Before?.toString());
    // console.log("balance1Before: ", balance1Before?.toString());
    // console.log("balanceEthBefore: ", balanceEthBefore?.toString());

    // we store working payloads from 1inch API for the swaps needed for tests and block number tests are pinned to
    let swapParams: OneInchDataType;
    let swapAmountIn: BigNumber;
    let swapAmountOut: BigNumber;
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

      // amount here is not so important, as what we want is an initial price for this asset pair
      const quoteAmount = await quote1Inch(
        "1",
        zeroForOne ? token0.address : token1.address,
        zeroForOne ? token1.address : token0.address,
        zeroForOne ? amount0Max.toString() : amount1Max.toString()
      );
      // console.log("quoteAmount: ", quoteAmount);

      const numerator = ethers.BigNumber.from(quoteAmount).mul(
        zeroForOne
          ? ethers.BigNumber.from((10 ** decimalsToken0).toString())
          : ethers.BigNumber.from((10 ** decimalsToken1).toString())
      );
      const denominator = zeroForOne
        ? amount0Max.mul(
            ethers.BigNumber.from((10 ** decimalsToken1).toString())
          )
        : amount1Max.mul(
            ethers.BigNumber.from((10 ** decimalsToken0).toString())
          );
      const priceX18 = numerator
        .mul(ethers.utils.parseEther("1"))
        .div(denominator);
      // console.log("price check:", priceX18.toString());

      // given this price and the amounts the user is willing to spend
      // which token should be swapped and how much
      const result = await resolver.getRebalanceParams(
        vault.address,
        amount0Max,
        amount1Max,
        priceX18
      );
      // console.log(
      //   "getRebalanceParams - result.swapAmount.toString(): ",
      //   result.swapAmount.toString()
      // );
      expect(result.zeroForOne).to.be.equals(zeroForOne);

      // now that we know how much to swap, let's get a new quote
      const quoteAmount2 = await quote1Inch(
        "1",
        zeroForOne ? token0.address : token1.address,
        zeroForOne ? token1.address : token0.address,
        result.swapAmount.toString()
      );
      // console.log("quoteAmount2:", quoteAmount2);

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
      const result2 = await resolver.getRebalanceParams(
        vault.address,
        amount0Max,
        amount1Max,
        price2
      );
      // console.log(
      //   "getRebalanceParams - result2.swapAmount.toString():",
      //   result2.swapAmount.toString()
      // );
      expect(result2.zeroForOne).to.be.equals(zeroForOne);

      // given this new swapAmount, how much of the other token will I receive?
      const quoteAmount3 = await quote1Inch(
        "1",
        zeroForOne ? token0.address : token1.address,
        zeroForOne ? token1.address : token0.address,
        result2.swapAmount.toString()
      );
      // console.log("quoteAmount3:", quoteAmount3);

      swapAmountIn = result2.swapAmount;
      swapAmountOut = ethers.BigNumber.from(quoteAmount3);

      swapParams = await swapTokenData(
        "1",
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
    // const mintAmounts = await vault.getMintAmounts(amount0Use, amount1Use);
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

    // preparing parameter structs for swapAndAddLiquidity()
    const swapData = {
      vault: vault.address,

      amount0Max: amount0Max,
      amount1Max: amount1Max,
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      useETH: useETH,
      gaugeAddress: stRakisToken
        ? stRakisToken.address
        : ethers.constants.AddressZero,

      amountInSwap: swapAmountIn.toString(),
      amountOutSwap: amountOut,
      zeroForOne: zeroForOne,
      swapRouter: swapParams.to,
      swapPayload: swapParams.data,

      userToRefund: "0x0000000000000000000000000000000000000000",
    };

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
        const value = transactionEthValue || swapData.amount0Max;
        if (value == swapData.amount0Max) {
          swapAndAddTxPending = await vaultRouterWrapper.swapAndAddLiquidity(
            swapData,
            { value: value }
          );
        } else {
          await expect(
            vaultRouterWrapper.swapAndAddLiquidity(swapData, { value: value })
          ).to.be.revertedWith("Invalid amount of ETH forwarded");
          return;
        }
      } else {
        const value = transactionEthValue || swapData.amount1Max;
        if (value == swapData.amount1Max) {
          swapAndAddTxPending = await vaultRouterWrapper.swapAndAddLiquidity(
            swapData,
            { value: value }
          );
        } else {
          await expect(
            vaultRouterWrapper.swapAndAddLiquidity(swapData, { value: value })
          ).to.be.revertedWith("Invalid amount of ETH forwarded");
          return;
        }
      }
    } else {
      if (transactionEthValue) {
        swapAndAddTxPending = await vaultRouterWrapper.swapAndAddLiquidity(
          swapData,
          { value: transactionEthValue }
        );
      } else {
        swapAndAddTxPending = await vaultRouterWrapper.swapAndAddLiquidity(
          swapData
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
    const balance0After = await token0.balanceOf(walletAddress);
    const balance1After = await token1.balanceOf(walletAddress);
    const balanceEthAfter = await token0.provider.getBalance(walletAddress);
    const balanceRakisAfter = await rakisToken.balanceOf(walletAddress);
    const balanceStRakisAfter = stRakisToken
      ? await stRakisToken.balanceOf(walletAddress)
      : ethers.BigNumber.from(0);

    // calculate actual amounts used for mintAmounts after swap and validate swapAmountOut
    if (swapppedEventData.zeroForOne) {
      amount0Use = swapData.amount0Max.sub(swapppedEventData.amount0Diff);
      amount1Use = swapData.amount1Max.add(swapppedEventData.amount1Diff);

      expect(amountOut).to.be.lt(swapppedEventData.amount1Diff);
    } else {
      amount0Use = swapData.amount0Max.add(swapppedEventData.amount0Diff);
      amount1Use = swapData.amount1Max.sub(swapppedEventData.amount1Diff);

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
        balance0Before.sub(swapData.amount0Max).add(refund0)
      );
      expect(balance1After).to.equal(
        balance1Before.sub(swapData.amount1Max).add(refund1)
      );
      expect(balanceEthAfter).to.equal(balanceEthBefore.sub(ethSpentForGas));
    } else {
      if (isToken0Weth) {
        expect(balance0After).to.equal(balance0Before);
        expect(balance1After).to.equal(
          balance1Before.sub(swapData.amount1Max).add(refund1)
        );
        expect(balanceEthAfter).to.equal(
          balanceEthBefore
            .sub(swapData.amount0Max)
            .sub(ethSpentForGas)
            .add(refund0)
        );
      } else {
        expect(balance0After).to.equal(
          balance0Before.sub(swapData.amount0Max).add(refund0)
        );
        expect(balance1After).to.equal(balance1Before);
        expect(balanceEthAfter).to.equal(
          balanceEthBefore
            .sub(swapData.amount1Max)
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
  };

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    // start loading periphery stuff
    // getting resolver contract
    const resolverAddress = (await deployments.get("ArrakisV2Resolver"))
      .address;
    resolver = (await ethers.getContractAt(
      "ArrakisV2Resolver",
      resolverAddress
    )) as ArrakisV2Resolver;

    // getting router contract
    const vaultRouterAddress = (await deployments.get("ArrakisV2Router"))
      .address;
    vaultRouter = (await ethers.getContractAt(
      "ArrakisV2Router",
      vaultRouterAddress
    )) as ArrakisV2Router;

    // getting wrapper contract
    const vaultRouterWrapperAddress = (
      await deployments.get("ArrakisV2RouterWrapper")
    ).address;
    vaultRouterWrapper = (await ethers.getContractAt(
      "ArrakisV2RouterWrapper",
      vaultRouterWrapperAddress
    )) as ArrakisV2RouterWrapper;

    // updating wrapper's router
    await vaultRouterWrapper.updateRouter(vaultRouter.address);
    // finished loading periphery stuff

    // start loading v2-core stuff
    // get vault implementation address
    const vaultImplementationAddress = (await deployments.get("VaultV2"))
      .address;

    // getting vault factory
    const vaultFactoryAddress = (await deployments.get("VaultV2Factory"))
      .address;
    vaultV2Factory = (await ethers.getContractAt(
      VaultV2Factory.abi,
      vaultFactoryAddress
    )) as IVaultV2Factory;

    // initializing factory
    await vaultV2Factory.initialize(vaultImplementationAddress, walletAddress);

    // getting uniswap factory
    const uniswapV3Factory = (await ethers.getContractAt(
      "IUniswapV3Factory",
      addresses.UniswapV3Factory,
      wallet
    )) as IUniswapV3Factory;

    // getting uniswap pool
    const uniswapV3Pool = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await uniswapV3Factory.getPool(addresses.USDC, addresses.WETH, 500),
      wallet
    )) as IUniswapV3Pool;

    // getting pool data
    const slot0 = await uniswapV3Pool.slot0();
    const tickSpacing = await uniswapV3Pool.tickSpacing();
    const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
    const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

    // get initial amounts
    const res = await resolver.getAmountsForLiquidity(
      slot0.tick,
      lowerTick,
      upperTick,
      ethers.utils.parseUnits("1", 18)
    );

    // deploying vault
    const tx = await vaultV2Factory.deployVault({
      feeTiers: [500],
      token0: addresses.USDC,
      token1: addresses.WETH,
      owner: walletAddress,
      operators: [walletAddress],
      ranges: [
        {
          lowerTick: lowerTick,
          upperTick: upperTick,
          feeTier: 500,
        },
      ],
      init0: res.amount0,
      init1: res.amount1,
      managerTreasury: walletAddress,
      managerFeeBPS: 100,
      maxTwapDeviation: 100,
      twapDuration: 2000,
    });

    const rc = await tx.wait();
    const event = rc?.events?.find((event) => event.event === "VaultCreated");
    // eslint-disable-next-line no-unsafe-optional-chaining
    const result = event?.args;

    // getting vault
    vault = (await ethers.getContractAt(
      VaultV2.abi,
      result?.vault,
      wallet
    )) as IVaultV2;
    // finished loading v2-core stuff

    token0 = (await ethers.getContractAt(
      "ERC20",
      await vault.token0()
    )) as ERC20;
    token1 = (await ethers.getContractAt(
      "ERC20",
      await vault.token1()
    )) as ERC20;
    rakisToken = (await ethers.getContractAt("ERC20", vault.address)) as ERC20;

    // getting funds from faucet
    const faucetUsdc = "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7";
    await network.provider.send("hardhat_setBalance", [
      faucetUsdc,
      "0x313030303030303030303030303030303030303030",
    ]);
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [faucetUsdc],
    });
    const faucetUsdcSigner = await ethers.provider.getSigner(faucetUsdc);

    await token0
      .connect(faucetUsdcSigner)
      .transfer(walletAddress, await token0.balanceOf(faucetUsdc));

    const faucetWeth = "0x2f0b23f53734252bda2277357e97e1517d6b042a";
    await network.provider.send("hardhat_setBalance", [
      faucetWeth,
      "0x313030303030303030303030303030303030303030",
    ]);
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [faucetWeth],
    });
    const faucetWethSigner = await ethers.provider.getSigner(faucetWeth);
    await token1
      .connect(faucetWethSigner)
      .transfer(walletAddress, await token1.balanceOf(faucetWeth));

    const gaugeImplFactory = ethers.ContractFactory.fromSolidity(Gauge);
    const gaugeImpl = await gaugeImplFactory
      .connect(wallet)
      .deploy({ gasLimit: 6000000 });
    const encoded = gaugeImpl.interface.encodeFunctionData("initialize", [
      vault.address,
      await wallet.getAddress(),
      ANGLE,
      veANGLE,
      veBoost,
      await wallet.getAddress(),
    ]);
    const factory = await ethers.getContractFactory("EIP173Proxy");
    const contract = await factory
      .connect(wallet)
      .deploy(gaugeImpl.address, await wallet.getAddress(), encoded);
    gauge = await ethers.getContractAt(Gauge.abi, contract.address);
    stRakisToken = (await ethers.getContractAt(
      "ERC20",
      gauge.address
    )) as ERC20;

    routerBalanceEth = await wallet.provider?.getBalance(vaultRouter.address);
  });

  describe("deposits through ArrakisV2Router", function () {
    it("should deposit funds with addLiquidity", async function () {
      const amount0In = ethers.BigNumber.from("10000").mul(
        ethers.BigNumber.from("10").pow("6")
      );
      const amount1In = ethers.utils.parseEther("10");

      await token0
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount0In);
      await token1
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount1In);

      const balance0Before = await token0.balanceOf(walletAddress);
      const balance1Before = await token1.balanceOf(walletAddress);
      const balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);

      const addLiquidityData = {
        vault: vault.address,
        amount0Max: amount0In,
        amount1Max: amount1In,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        useETH: false,
        gaugeAddress: ethers.constants.AddressZero,
      };

      await vaultRouterWrapper.addLiquidity(addLiquidityData);

      const balance0After = await token0.balanceOf(walletAddress);
      const balance1After = await token1.balanceOf(walletAddress);
      const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);

      const contractBalance0 = await token0.balanceOf(vaultRouter.address);
      const contractBalance1 = await token1.balanceOf(vaultRouter.address);
      const contractBalanceG = await rakisToken.balanceOf(vaultRouter.address);

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
    });
    it("should deposit funds and stake", async function () {
      const amount0In = ethers.BigNumber.from("10000").mul(
        ethers.BigNumber.from("10").pow("6")
      );
      const amount1In = ethers.utils.parseEther("10");

      await token0
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount0In);
      await token1
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount1In);
      const balance0Before = await token0.balanceOf(walletAddress);
      const balance1Before = await token1.balanceOf(walletAddress);
      const balanceStakedBefore = await stRakisToken.balanceOf(walletAddress);
      const balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);

      await gauge
        .connect(wallet)
        .add_reward(token0.address, await wallet.getAddress(), {
          gasLimit: 6000000,
        });

      const rewardAmount = ethers.BigNumber.from("100").mul(
        ethers.BigNumber.from("10").pow("6")
      );
      await token0.connect(wallet).approve(gauge.address, rewardAmount);
      await gauge.deposit_reward_token(token0.address, rewardAmount, {
        gasLimit: 6000000,
      });

      const addLiquidityData = {
        vault: vault.address,
        amount0Max: amount0In,
        amount1Max: amount1In,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        useETH: false,
        gaugeAddress: gauge.address,
      };

      await vaultRouterWrapper.addLiquidity(addLiquidityData);
      const balance0After = await token0.balanceOf(walletAddress);
      const balance1After = await token1.balanceOf(walletAddress);
      const balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);
      const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV2Before).to.be.eq(balanceArrakisV2After);
      expect(balanceStakedBefore).to.be.lt(balanceStakedAfter);

      const contractBalance0 = await token0.balanceOf(vaultRouter.address);
      const contractBalance1 = await token1.balanceOf(vaultRouter.address);
      const contractBalance2 = await rakisToken.balanceOf(vaultRouter.address);
      const contractBalance3 = await stRakisToken.balanceOf(
        vaultRouter.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalance2).to.equal(ethers.constants.Zero);
      expect(contractBalance3).to.equal(ethers.constants.Zero);

      const newStartTime1 = (await wallet.provider?.getBlock("latest"))
        ?.timestamp;
      const dayLater1 = Number(newStartTime1?.toString()) + 86400;
      await network.provider.request({
        method: "evm_mine",
        params: [dayLater1],
      });

      const claimable = await gauge.claimable_reward(
        await wallet.getAddress(),
        token0.address
      );
      expect(claimable).to.be.gt(0);
    });
  });

  describe("withdrawal through ArrakisV2Router", function () {
    it("should withdraw funds with removeLiquidity", async function () {
      const balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);
      expect(balanceArrakisV2Before).to.be.gt(ethers.constants.Zero);

      const balance0Before = await token0.balanceOf(walletAddress);
      const balance1Before = await token1.balanceOf(walletAddress);
      await rakisToken.approve(
        vaultRouterWrapper.address,
        balanceArrakisV2Before
      );
      const removeLiquidity = {
        burns: [],
        vault: vault.address,
        burnAmount: balanceArrakisV2Before.div(2),
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        receiveETH: false,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };
      await vaultRouterWrapper.removeLiquidity(removeLiquidity);
      const balance0After = await token0.balanceOf(walletAddress);
      const balance1After = await token1.balanceOf(walletAddress);
      const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceArrakisV2Before).to.be.gt(balanceArrakisV2After);
    });
    it("should unstake and withdraw funds", async function () {
      const balanceStakedBefore = await stRakisToken.balanceOf(walletAddress);
      expect(balanceStakedBefore).to.be.gt(ethers.constants.Zero);

      const balance0Before = await token0.balanceOf(walletAddress);
      const balance1Before = await token1.balanceOf(walletAddress);
      await stRakisToken.approve(
        vaultRouterWrapper.address,
        balanceStakedBefore
      );
      const removeLiquidity = {
        burns: [],
        vault: vault.address,
        burnAmount: balanceStakedBefore,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        receiveETH: false,
        gaugeAddress: gauge.address,
      };
      await vaultRouterWrapper.removeLiquidity(removeLiquidity);
      const balance0After = await token0.balanceOf(walletAddress);
      const balance1After = await token1.balanceOf(walletAddress);
      const balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceStakedBefore).to.be.gt(balanceStakedAfter);
      expect(balanceStakedAfter).to.eq(0);
    });
  });

  describe("Native ETH tests", function () {
    it("add and remove liquidity using native ETH", async function () {
      expect(await vault.token1()).to.equal(addresses.WETH);

      const amount0In = ethers.BigNumber.from("10000").mul(
        ethers.BigNumber.from("10").pow("6")
      );
      const amount1In = ethers.utils.parseEther("10");

      await token0
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount0In);
      await token1
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount1In);

      let balance0Before = await token1.balanceOf(walletAddress);
      let balance1Before = await wallet.provider?.getBalance(walletAddress);
      let balanceArrakisV1Before = await rakisToken.balanceOf(walletAddress);

      const addLiquidityData = {
        vault: vault.address,
        amount0Max: amount0In,
        amount1Max: amount1In,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        useETH: true,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };

      await vaultRouterWrapper.addLiquidity(addLiquidityData, {
        value: amount1In,
      });

      let balance0After = await token0.balanceOf(walletAddress);
      let balance1After = await wallet.provider?.getBalance(walletAddress);
      let balanceArrakisV1After = await rakisToken.balanceOf(walletAddress);

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV1Before).to.be.lt(balanceArrakisV1After);

      let contractBalance0 = await token0.balanceOf(vaultRouter.address);
      let contractBalance1 = await token1.balanceOf(vaultRouter.address);
      let contractBalanceG = await rakisToken.balanceOf(vaultRouter.address);
      let routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);

      balance0Before = balance0After;
      balance1Before = balance1After;
      balanceArrakisV1Before = balanceArrakisV1After;

      // removeLiquidityETH

      await rakisToken.approve(
        vaultRouterWrapper.address,
        balanceArrakisV1Before
      );
      const removeLiquidity = {
        burns: [],
        vault: vault.address,
        burnAmount: balanceArrakisV1Before,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        receiveETH: true,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };

      await vaultRouterWrapper.removeLiquidity(removeLiquidity);

      balance0After = await token0.balanceOf(walletAddress);
      balance1After = await wallet.provider?.getBalance(walletAddress);
      balanceArrakisV1After = await rakisToken.balanceOf(walletAddress);

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceArrakisV1Before).to.be.gt(balanceArrakisV1After);
      expect(balanceArrakisV1After).to.equal(ethers.constants.Zero);

      contractBalance0 = await token0.balanceOf(vaultRouter.address);
      contractBalance1 = await token1.balanceOf(vaultRouter.address);
      contractBalanceG = await rakisToken.balanceOf(vaultRouter.address);
      routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);
    });
    it("add and remove liquidity using native ETH and staking", async function () {
      expect(await vault.token1()).to.equal(addresses.WETH);

      const amount0In = ethers.BigNumber.from("10000").mul(
        ethers.BigNumber.from("10").pow("6")
      );
      const amount1In = ethers.utils.parseEther("10");

      await token0
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount0In);
      let balance0Before = await token0.balanceOf(walletAddress);
      let balance1Before = await wallet.provider?.getBalance(walletAddress);
      let balanceArrakisV1Before = await rakisToken.balanceOf(walletAddress);
      let balanceStakedBefore = await stRakisToken.balanceOf(walletAddress);

      const addLiquidityData = {
        vault: vault.address,
        amount0Max: amount0In,
        amount1Max: amount1In,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        useETH: true,
        gaugeAddress: gauge.address,
      };
      await vaultRouterWrapper.addLiquidity(addLiquidityData, {
        value: amount1In,
      });

      let balance0After = await token0.balanceOf(walletAddress);
      let balance1After = await wallet.provider?.getBalance(walletAddress);
      let balanceArrakisV1After = await rakisToken.balanceOf(walletAddress);
      let balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV1Before).to.be.eq(balanceArrakisV1After);
      expect(balanceStakedBefore).to.be.lt(balanceStakedAfter);

      let contractBalance0 = await token0.balanceOf(vaultRouter.address);
      let contractBalance1 = await token1.balanceOf(vaultRouter.address);
      let contractBalance2 = await rakisToken.balanceOf(vaultRouter.address);
      let contractBalance3 = await stRakisToken.balanceOf(vaultRouter.address);
      let routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalance2).to.equal(ethers.constants.Zero);
      expect(contractBalance3).to.equal(ethers.constants.Zero);
      expect(routerBalanceEthEnd).to.equal(routerBalanceEth);

      balance0Before = balance0After;
      balance1Before = balance1After;
      balanceArrakisV1Before = balanceArrakisV1After;
      balanceStakedBefore = balanceStakedAfter;
      const balanceRewardsBefore = await token0.balanceOf(walletAddress);
      const newStartTime1 = (await wallet.provider?.getBlock("latest"))
        ?.timestamp;
      const dayLater1 = Number(newStartTime1?.toString()) + 86400;
      await network.provider.request({
        method: "evm_mine",
        params: [dayLater1],
      });

      const claimable = await gauge.claimable_reward(
        walletAddress,
        token0.address
      );
      expect(claimable).to.be.gt(0);

      await stRakisToken.approve(
        vaultRouterWrapper.address,
        balanceStakedBefore
      );
      const removeLiquidity = {
        burns: [],
        vault: vault.address,
        burnAmount: balanceStakedBefore,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        receiveETH: true,
        gaugeAddress: gauge.address,
      };
      await vaultRouterWrapper.removeLiquidity(removeLiquidity);
      balance0After = await token0.balanceOf(walletAddress);
      balance1After = await wallet.provider?.getBalance(walletAddress);
      balanceArrakisV1After = await rakisToken.balanceOf(walletAddress);
      balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);
      const balanceRewardsAfter = await token0.balanceOf(walletAddress);

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceRewardsAfter).to.be.gt(balanceRewardsBefore);
      expect(balanceArrakisV1Before).to.be.eq(balanceArrakisV1After);
      expect(balanceArrakisV1After).to.equal(ethers.constants.Zero);

      contractBalance0 = await token0.balanceOf(vaultRouter.address);
      contractBalance1 = await token1.balanceOf(vaultRouter.address);
      contractBalance2 = await rakisToken.balanceOf(vaultRouter.address);
      contractBalance3 = await stRakisToken.balanceOf(vaultRouter.address);
      routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalance2).to.equal(ethers.constants.Zero);
      expect(contractBalance3).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);
    });
    it("tests adding liquidity using native ETH passing empty msg.value", async function () {
      expect(await vault.token1()).to.equal(addresses.WETH);

      const amount0In = ethers.BigNumber.from("10000").mul(
        ethers.BigNumber.from("10").pow("6")
      );
      const amount1In = ethers.utils.parseEther("10");

      await token0
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount0In);

      const transactionEthValue = ethers.BigNumber.from("0");

      const addLiquidityData = {
        vault: vault.address,
        amount0Max: amount0In,
        amount1Max: amount1In,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        useETH: true,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };

      await expect(
        vaultRouterWrapper.addLiquidity(addLiquidityData, {
          value: transactionEthValue,
        })
      ).to.be.revertedWith("Not enough ETH forwarded");
    });
    it("tests adding liquidity using native ETH passing double msg.value", async function () {
      expect(await vault.token1()).to.equal(addresses.WETH);

      const amount0In = ethers.BigNumber.from("10000").mul(
        ethers.BigNumber.from("10").pow("6")
      );
      const amount1In = ethers.utils.parseEther("10");

      await token0
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount0In);

      let balance0Before = await token0.balanceOf(walletAddress);
      let balance1Before = await wallet.provider?.getBalance(walletAddress);
      let balanceArrakisV1Before = await rakisToken.balanceOf(walletAddress);
      let wrapperEthBalanceBefore = await wallet.provider?.getBalance(
        vaultRouterWrapper.address
      );

      const transactionEthValue = amount1In.mul(2);
      const addLiquidityData = {
        vault: vault.address,
        amount0Max: amount0In,
        amount1Max: amount1In,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        useETH: true,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };
      await vaultRouterWrapper.addLiquidity(addLiquidityData, {
        value: transactionEthValue,
      });

      let balance0After = await token0.balanceOf(walletAddress);
      let balance1After = await wallet.provider?.getBalance(walletAddress);
      let balanceArrakisV1After = await rakisToken.balanceOf(walletAddress);
      let wrapperEthBalanceAfter = await wallet.provider?.getBalance(
        vaultRouterWrapper.address
      );

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV1Before).to.be.lt(balanceArrakisV1After);
      expect(wrapperEthBalanceBefore).to.be.eq(wrapperEthBalanceAfter);

      let contractBalance0 = await token0.balanceOf(vaultRouter.address);
      let contractBalance1 = await token1.balanceOf(vaultRouter.address);
      let contractBalanceG = await rakisToken.balanceOf(vaultRouter.address);
      let routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);

      balance0Before = balance0After;
      balance1Before = balance1After;
      balanceArrakisV1Before = balanceArrakisV1After;
      wrapperEthBalanceBefore = wrapperEthBalanceAfter;

      // removeLiquidityETH

      await rakisToken.approve(
        vaultRouterWrapper.address,
        balanceArrakisV1Before
      );
      const removeLiquidity = {
        burns: [],
        vault: vault.address,
        burnAmount: balanceArrakisV1Before,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        receiveETH: true,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };
      await vaultRouterWrapper.removeLiquidity(removeLiquidity);
      balance0After = await token0.balanceOf(walletAddress);
      balance1After = await wallet.provider?.getBalance(walletAddress);
      balanceArrakisV1After = await rakisToken.balanceOf(walletAddress);

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceArrakisV1Before).to.be.gt(balanceArrakisV1After);
      expect(balanceArrakisV1After).to.equal(ethers.constants.Zero);

      contractBalance0 = await token0.balanceOf(vaultRouter.address);
      contractBalance1 = await token1.balanceOf(vaultRouter.address);
      contractBalanceG = await rakisToken.balanceOf(vaultRouter.address);
      routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );
      wrapperEthBalanceAfter = await wallet.provider?.getBalance(
        vaultRouterWrapper.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);
      expect(wrapperEthBalanceBefore).to.equal(wrapperEthBalanceAfter);
    });
  });

  describe("Swap and add liquidity tests", function () {
    it("should use A,B and swap A for B", async function () {
      await swapAndAddTest(
        vault,
        token0,
        token1,
        rakisToken,
        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("1"),
        true,
        5,
        false,
        "scenario1"
      );
    });
    it("should use A,B and swap A for B and stake", async function () {
      await swapAndAddTest(
        vault,
        token0,
        token1,
        rakisToken,
        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("1"),
        true,
        5,
        false,
        "scenario1",
        stRakisToken
      );
    });
    it("should use A,B and swap A for B using nativeETH", async function () {
      await swapAndAddTest(
        vault,
        token0,
        token1,
        rakisToken,
        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("1"),
        true,
        5,
        true,
        "scenario1"
      );
    });
    it("should use A,B and swap A for B and stake using nativeETH", async function () {
      await swapAndAddTest(
        vault,
        token0,
        token1,
        rakisToken,
        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("1"),
        true,
        5,
        true,
        "scenario1",
        stRakisToken
      );
    });

    it("should use only A and swap A for B", async function () {
      // single side
      await swapAndAddTest(
        vault,
        token0,
        token1,
        rakisToken,
        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("0"),
        true,
        5,
        false,
        "scenario2"
      );
    });
    it("should use only A and swap A for B and stake", async function () {
      await swapAndAddTest(
        vault,
        token0,
        token1,
        rakisToken,
        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("0"),
        true,
        5,
        false,
        "scenario2",
        stRakisToken
      );
    });
    it("should use only A and swap A for B using native ETH", async function () {
      await swapAndAddTest(
        vault,
        token0,
        token1,
        rakisToken,
        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("0"),
        true,
        5,
        true,
        "scenario2"
      );
    });
    it("should use only A and swap A for B and stake using nativeETH", async function () {
      await swapAndAddTest(
        vault,
        token0,
        token1,
        rakisToken,
        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("0"),
        true,
        5,
        true,
        "scenario2",
        stRakisToken
      );
    });
    it("should use only A and swap A for B with different msg.value and nativeETH", async function () {
      await swapAndAddTest(
        vault,
        token0,
        token1,
        rakisToken,
        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("0"),
        true,
        5,
        true,
        "scenario2",
        stRakisToken,
        ethers.BigNumber.from("100000")
      );
    });
    it("should use A and B and revert with empty msg.value", async function () {
      await swapAndAddTest(
        vault,
        token0,
        token1,
        rakisToken,
        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("10"),
        true,
        5,
        false,
        "scenario2",
        stRakisToken,
        ethers.BigNumber.from("0")
      );
    });
  });
});
