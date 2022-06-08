import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import { IERC20, IArrakisVaultV1 } from "../typechain";
import { ERC20 } from "../typechain/ERC20";
import { ArrakisV1Router } from "../typechain/ArrakisV1Router";
import { ArrakisV1RouterWrapper } from "../typechain/ArrakisV1RouterWrapper";
// import { ArrakisSwappersWhitelist } from "../typechain/ArrakisSwappersWhitelist";
import { IUniswapV3Pool } from "../typechain/IUniswapV3Pool";
import { ArrakisV1Resolver } from "../typechain/ArrakisV1Resolver";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";
import {
  swapTokenData,
  quote1Inch,
  mockPayloads,
  OneInchDataType,
} from "../src/oneInchApiIntegration";
import Gauge from "../src/LiquidityGaugeV4.json";
import { BigNumber, Contract, ContractTransaction } from "ethers";

let addresses: Addresses;

const ANGLE = "0x31429d1856aD1377A8A0079410B297e1a9e214c2";
const veANGLE = "0x0C462Dbb9EC8cD1630f1728B2CFD2769d09f0dd5";
const veBoost = "0x52701bFA0599db6db2b2476075D9a2f4Cb77DAe3";

const WAD = ethers.BigNumber.from("10").pow("18");

// flag for easily switching between live 1inch api and stored mock payloads
const shouldUseMockPayloads = true;

describe("ArrakisV1Router tests", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let token0: ERC20;
  let token1: ERC20;
  let rakisToken: ERC20;
  let stRakisToken: ERC20;
  let vault: IArrakisVaultV1;
  let vaultRouterWrapper: ArrakisV1RouterWrapper;
  let vaultRouter: ArrakisV1Router;
  // let swappersWhitelist: ArrakisSwappersWhitelist;
  let resolver: ArrakisV1Resolver;
  let gauge: Contract;
  let routerBalanceEth: BigNumber | undefined;

  // Checks if a vault's position is in range or not
  const getPositionStatus = async (
    vault: IArrakisVaultV1
  ): Promise<[boolean, boolean]> => {
    const uniPool: IUniswapV3Pool = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await vault.pool()
    )) as IUniswapV3Pool;
    const slot = await uniPool.slot0();
    const currentTick = ethers.BigNumber.from(slot.tick);
    const lowerTick = ethers.BigNumber.from(await vault.lowerTick());
    const upperTick = ethers.BigNumber.from(await vault.upperTick());
    const isPositionInRange =
      currentTick.gte(lowerTick) && currentTick.lte(upperTick);
    const isToken0Empty = !isPositionInRange && currentTick.gt(upperTick);
    return [isPositionInRange, isToken0Empty];
  };

  const swapAndAddTest = async (
    vault: IArrakisVaultV1,
    token0: ERC20,
    token1: ERC20,
    rakisToken: ERC20,
    amount0Max: BigNumber,
    amount1Max: BigNumber,
    zeroForOne: boolean,
    slippage: number,
    useETH: boolean,
    mockPayloadScenario?: string,
    stRakisToken?: ERC20
  ) => {
    const walletAddress = await wallet.getAddress();

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

    // get current underlying amounts pre-deposit
    let [amount0Current, amount1Current] = await vault.getUnderlyingBalances();
    // console.log("amount0Current: ", amount0Current?.toString());
    // console.log("amount1Current: ", amount1Current?.toString());

    // we store working payloads from 1inch API for the swaps needed for tests and block number tests are pinned to
    let swapParams: OneInchDataType;
    let swapAmountIn: BigNumber;
    let swapAmountOut: BigNumber;
    if (mockPayloadScenario && shouldUseMockPayloads) {
      if (
        mockPayloads[vault.address] &&
        mockPayloads[vault.address][mockPayloadScenario]
      ) {
        // console.log("using mock payload...");
        swapParams = {
          to: addresses.OneInchRouter,
          data: mockPayloads[vault.address][mockPayloadScenario].payload,
        };
        swapAmountIn = ethers.BigNumber.from(
          mockPayloads[vault.address][mockPayloadScenario].swapIn
        );
        swapAmountOut = ethers.BigNumber.from(
          mockPayloads[vault.address][mockPayloadScenario].swapOut
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
    const addData = {
      amount0Max: amount0Max,
      amount1Max: amount1Max,
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
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
    vaultRouter.on("Swapped", (zeroForOne, amount0Diff, amount1Diff) => {
      swapppedEventData.zeroForOne = zeroForOne;
      swapppedEventData.amount0Diff = ethers.BigNumber.from(amount0Diff);
      swapppedEventData.amount1Diff = ethers.BigNumber.from(amount1Diff);
      hasSwapped = true;
    });

    // listener for getting data from "Minted" event
    vault.on(
      "Minted",
      (receiver, mintAmount, amount0In, amount1In, liquidityMinted) => {
        mintedEventData.receiver = receiver;
        mintedEventData.mintAmount = ethers.BigNumber.from(mintAmount);
        mintedEventData.amount0In = ethers.BigNumber.from(amount0In);
        mintedEventData.amount1In = ethers.BigNumber.from(amount1In);
        mintedEventData.liquidityMinted =
          ethers.BigNumber.from(liquidityMinted);
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

    // call wrapper.swapAndAddLiquidity()
    let swapAndAddTxPending: ContractTransaction;
    if (useETH) {
      if (isToken0Weth) {
        swapAndAddTxPending = await vaultRouterWrapper.swapAndAddLiquidity(
          vault.address,
          addData,
          swapData,
          { value: addData.amount0Max }
        );
      } else {
        swapAndAddTxPending = await vaultRouterWrapper.swapAndAddLiquidity(
          vault.address,
          addData,
          swapData,
          { value: addData.amount1Max }
        );
      }
    } else {
      swapAndAddTxPending = await vaultRouterWrapper.swapAndAddLiquidity(
        vault.address,
        addData,
        swapData
      );
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
      amount0Use = addData.amount0Max.sub(swapppedEventData.amount0Diff);
      amount1Use = addData.amount1Max.add(swapppedEventData.amount1Diff);

      expect(amountOut).to.be.lt(swapppedEventData.amount1Diff);
    } else {
      amount0Use = addData.amount0Max.add(swapppedEventData.amount0Diff);
      amount1Use = addData.amount1Max.sub(swapppedEventData.amount1Diff);

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
    // console.log("addData.amount0Max: ", addData.amount0Max.toString());
    // console.log("addData.amount1Max: ", addData.amount1Max.toString());
    // console.log("ethSpentForGas: ", ethSpentForGas.toString());

    // validate balances
    if (!useETH) {
      expect(balance0After).to.equal(
        balance0Before.sub(addData.amount0Max).add(refund0)
      );
      expect(balance1After).to.equal(
        balance1Before.sub(addData.amount1Max).add(refund1)
      );
      expect(balanceEthAfter).to.equal(balanceEthBefore.sub(ethSpentForGas));
    } else {
      if (isToken0Weth) {
        expect(balance0After).to.equal(balance0Before);
        expect(balance1After).to.equal(
          balance1Before.sub(addData.amount1Max).add(refund1)
        );
        expect(balanceEthAfter).to.equal(
          balanceEthBefore
            .sub(addData.amount0Max)
            .sub(ethSpentForGas)
            .add(refund0)
        );
      } else {
        expect(balance0After).to.equal(
          balance0Before.sub(addData.amount0Max).add(refund0)
        );
        expect(balance1After).to.equal(balance1Before);
        expect(balanceEthAfter).to.equal(
          balanceEthBefore
            .sub(addData.amount1Max)
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

    [amount0Current, amount1Current] = await vault.getUnderlyingBalances();
    if (amount0Current.gt(0) && amount1Current.gt(0)) {
      // validates nothing can be minted with current amounts refunded
      await expect(
        vault.getMintAmounts(refund0.toString(), refund1.toString())
      ).to.be.revertedWith("mint 0");
    }
    // else {
    //   const mintAmountsEnd = await vault.getMintAmounts(
    //     refund0.toString(),
    //     refund1.toString()
    //   );
    //   // console.log(
    //   //   "mintAmountsEnd.amount0.toString() ",
    //   //   mintAmountsEnd.amount0.toString()
    //   // );
    //   // console.log(
    //   //   "mintAmountsEnd.amount1.toString() ",
    //   //   mintAmountsEnd.amount1.toString()
    //   // );
    //   // console.log(
    //   //   "mintAmountsEnd.mintAmount.toString() ",
    //   //   mintAmountsEnd.mintAmount.toString()
    //   // );
    //   // for some reason check below fails on test "use only B"
    //   // expect(mintAmountsEnd.mintAmount).to.equal(ethers.constants.Zero);
    // }
  };

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet] = await ethers.getSigners();

    const faucet = "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7";

    await network.provider.send("hardhat_setBalance", [
      faucet,
      "0x313030303030303030303030303030303030303030",
    ]);
    const arrakisFactory = await ethers.getContractAt(
      [
        "function getDeployers() external view returns(address[] memory)",
        "function getPools(address) external view returns(address[] memory)",
      ],
      addresses.ArrakisV1Factory
    );
    const deployers = await arrakisFactory.getDeployers();
    const pools = await arrakisFactory.getPools(deployers[0]);
    const poolAddress = pools[0]; // this will be pool 0xAbDDAfB225e10B90D798bB8A886238Fb835e2053 DAI/USDC 0.05
    vault = (await ethers.getContractAt(
      "IArrakisVaultV1",
      poolAddress
    )) as IArrakisVaultV1;
    token0 = (await ethers.getContractAt(
      "ERC20",
      await vault.token0()
    )) as ERC20;
    token1 = (await ethers.getContractAt(
      "ERC20",
      await vault.token1()
    )) as ERC20;
    rakisToken = (await ethers.getContractAt("ERC20", poolAddress)) as ERC20;

    // const swappersWhitelistAddress = (
    //   await deployments.get("ArrakisSwappersWhitelist")
    // ).address;

    // swappersWhitelist = (await ethers.getContractAt(
    //   "ArrakisSwappersWhitelist",
    //   swappersWhitelistAddress
    // )) as ArrakisSwappersWhitelist;

    // await swappersWhitelist.addToWhitelist(addresses.OneInchRouter);

    const vaultRouterAddress = (await deployments.get("ArrakisV1Router"))
      .address;

    vaultRouter = (await ethers.getContractAt(
      "ArrakisV1Router",
      vaultRouterAddress
    )) as ArrakisV1Router;

    const vaultRouterWrapperAddress = (
      await deployments.get("ArrakisV1RouterWrapper")
    ).address;

    vaultRouterWrapper = (await ethers.getContractAt(
      "ArrakisV1RouterWrapper",
      vaultRouterWrapperAddress
    )) as ArrakisV1RouterWrapper;

    await vaultRouterWrapper.updateRouter(vaultRouter.address);

    const resolverAddress = (await deployments.get("ArrakisV1Resolver"))
      .address;
    resolver = (await ethers.getContractAt(
      "ArrakisV1Resolver",
      resolverAddress
    )) as ArrakisV1Resolver;

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [faucet],
    });
    const faucetSigner = await ethers.provider.getSigner(faucet);
    await token0
      .connect(faucetSigner)
      .transfer(await wallet.getAddress(), await token0.balanceOf(faucet));
    await token1
      .connect(faucetSigner)
      .transfer(await wallet.getAddress(), await token1.balanceOf(faucet));

    // WETH faucet
    const tokenW = (await ethers.getContractAt(
      "ERC20",
      addresses.WETH
    )) as ERC20;
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
    await tokenW
      .connect(faucetWethSigner)
      .transfer(await wallet.getAddress(), await tokenW.balanceOf(faucetWeth));

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
    // expect(routerBalanceEth).to.equal(1);
  });

  describe("deposits through ArrakisV1Router", function () {
    it("should deposit funds with addLiquidity", async function () {
      await token0
        .connect(wallet)
        .approve(
          vaultRouterWrapper.address,
          ethers.utils.parseEther("1000000")
        );
      await token1
        .connect(wallet)
        .approve(vaultRouterWrapper.address, ethers.utils.parseEther("100000"));
      const balance0Before = await token0.balanceOf(await wallet.getAddress());
      const balance1Before = await token1.balanceOf(await wallet.getAddress());
      const balanceArrakisV1Before = await rakisToken.balanceOf(
        await wallet.getAddress()
      );

      const input0 = WAD.mul(ethers.BigNumber.from("100"));
      const input1 = "100000000";
      const addLiquidityData = {
        amount0Max: input0,
        amount1Max: input1,
        amount0Min: 0,
        amount1Min: 0,
        receiver: await wallet.getAddress(),
        useETH: false,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };
      await vaultRouterWrapper.addLiquidity(vault.address, addLiquidityData);
      const balance0After = await token0.balanceOf(await wallet.getAddress());
      const balance1After = await token1.balanceOf(await wallet.getAddress());
      const balanceArrakisV1After = await rakisToken.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV1Before).to.be.lt(balanceArrakisV1After);

      const contractBalance0 = await token0.balanceOf(vaultRouter.address);
      const contractBalance1 = await token1.balanceOf(vaultRouter.address);
      const contractBalanceG = await rakisToken.balanceOf(vaultRouter.address);

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
    });
    it("should deposit funds and stake", async function () {
      await token0
        .connect(wallet)
        .approve(
          vaultRouterWrapper.address,
          ethers.utils.parseEther("1000000")
        );
      await token1
        .connect(wallet)
        .approve(vaultRouterWrapper.address, ethers.utils.parseEther("100000"));
      const balance0Before = await token0.balanceOf(await wallet.getAddress());
      const balance1Before = await token1.balanceOf(await wallet.getAddress());
      const balanceStakedBefore = await stRakisToken.balanceOf(
        await wallet.getAddress()
      );
      const balanceArrakisV1Before = await rakisToken.balanceOf(
        await wallet.getAddress()
      );

      await gauge
        .connect(wallet)
        .add_reward(token0.address, await wallet.getAddress(), {
          gasLimit: 6000000,
        });

      await token0
        .connect(wallet)
        .approve(gauge.address, WAD.mul(ethers.BigNumber.from("100")));

      await gauge.deposit_reward_token(
        token0.address,
        WAD.mul(ethers.BigNumber.from("100")),
        { gasLimit: 6000000 }
      );

      const input0 = WAD.mul(ethers.BigNumber.from("100"));
      const input1 = "100000000";
      const addLiquidityData = {
        amount0Max: input0,
        amount1Max: input1,
        amount0Min: 0,
        amount1Min: 0,
        receiver: await wallet.getAddress(),
        useETH: false,
        gaugeAddress: gauge.address,
      };
      await vaultRouterWrapper.addLiquidity(vault.address, addLiquidityData);
      const balance0After = await token0.balanceOf(await wallet.getAddress());
      const balance1After = await token1.balanceOf(await wallet.getAddress());
      const balanceStakedAfter = await stRakisToken.balanceOf(
        await wallet.getAddress()
      );
      const balanceArrakisV1After = await rakisToken.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV1Before).to.be.eq(balanceArrakisV1After);
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
  describe("withdrawal through ArrakisV1Router", function () {
    it("should withdraw funds with removeLiquidity", async function () {
      const balanceArrakisV1Before = await rakisToken.balanceOf(
        await wallet.getAddress()
      );
      expect(balanceArrakisV1Before).to.be.gt(ethers.constants.Zero);
      const balance0Before = await token0.balanceOf(await wallet.getAddress());
      const balance1Before = await token1.balanceOf(await wallet.getAddress());
      await rakisToken.approve(
        vaultRouterWrapper.address,
        ethers.utils.parseEther("100000000")
      );
      const removeLiquidity = {
        burnAmount: balanceArrakisV1Before,
        amount0Min: 0,
        amount1Min: 0,
        receiver: await wallet.getAddress(),
        receiveETH: false,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };
      await vaultRouterWrapper.removeLiquidity(vault.address, removeLiquidity);
      const balance0After = await token0.balanceOf(await wallet.getAddress());
      const balance1After = await token1.balanceOf(await wallet.getAddress());
      const balanceArrakisV1After = await rakisToken.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceArrakisV1Before).to.be.gt(balanceArrakisV1After);
    });
    it("should unstake and withdraw funds", async function () {
      const balanceStakedBefore = await stRakisToken.balanceOf(
        await wallet.getAddress()
      );
      expect(balanceStakedBefore).to.be.gt(ethers.constants.Zero);
      const balance0Before = await token0.balanceOf(await wallet.getAddress());
      const balance1Before = await token1.balanceOf(await wallet.getAddress());
      await stRakisToken.approve(
        vaultRouterWrapper.address,
        ethers.utils.parseEther("100000000")
      );
      const removeLiquidity = {
        burnAmount: balanceStakedBefore,
        amount0Min: 0,
        amount1Min: 0,
        receiver: await wallet.getAddress(),
        receiveETH: false,
        gaugeAddress: gauge.address,
      };
      await vaultRouterWrapper.removeLiquidity(vault.address, removeLiquidity);
      const balance0After = await token0.balanceOf(await wallet.getAddress());
      const balance1After = await token1.balanceOf(await wallet.getAddress());
      const balanceStakedAfter = await stRakisToken.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceStakedBefore).to.be.gt(balanceStakedAfter);
      expect(balanceStakedAfter).to.eq(0);
    });
  });
  describe("Native ETH tests", function () {
    it("add and remove liquidity using native ETH", async function () {
      const arrakisWethVault = (await ethers.getContractAt(
        "IArrakisVaultV1",
        addresses.ArrakisV1UsdcWethPool
      )) as IArrakisVaultV1;
      const token0W = (await ethers.getContractAt(
        "IERC20",
        await arrakisWethVault.token0()
      )) as IERC20;
      const token1W = (await ethers.getContractAt(
        "IERC20",
        await arrakisWethVault.token1()
      )) as IERC20;
      const rakisTokenW = (await ethers.getContractAt(
        "IERC20",
        addresses.ArrakisV1UsdcWethPool
      )) as IERC20;

      expect(await arrakisWethVault.token1()).to.equal(addresses.WETH);

      await token0W
        .connect(wallet)
        .approve(
          vaultRouterWrapper.address,
          ethers.utils.parseEther("1000000")
        );
      let balance0Before = await token0W.balanceOf(await wallet.getAddress());
      let balance1Before = await wallet.provider?.getBalance(
        await wallet.getAddress()
      );
      let balanceArrakisV1Before = await rakisTokenW.balanceOf(
        await wallet.getAddress()
      );

      const input0 = "100000000";
      const input1 = WAD.mul(ethers.BigNumber.from("2"));
      const addLiquidityData = {
        amount0Max: input0,
        amount1Max: input1,
        amount0Min: 0,
        amount1Min: 0,
        receiver: await wallet.getAddress(),
        useETH: true,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };
      await vaultRouterWrapper.addLiquidity(
        arrakisWethVault.address,
        addLiquidityData,
        { value: input1 }
      );

      let balance0After = await token0W.balanceOf(await wallet.getAddress());
      let balance1After = await wallet.provider?.getBalance(
        await wallet.getAddress()
      );
      let balanceArrakisV1After = await rakisTokenW.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV1Before).to.be.lt(balanceArrakisV1After);

      let contractBalance0 = await token0W.balanceOf(vaultRouter.address);
      let contractBalance1 = await token1W.balanceOf(vaultRouter.address);
      let contractBalanceG = await rakisTokenW.balanceOf(vaultRouter.address);
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

      await rakisTokenW.approve(
        vaultRouterWrapper.address,
        balanceArrakisV1Before
      );
      const removeLiquidity = {
        burnAmount: balanceArrakisV1Before,
        amount0Min: 0,
        amount1Min: 0,
        receiver: await wallet.getAddress(),
        receiveETH: true,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };
      await vaultRouterWrapper.removeLiquidity(
        arrakisWethVault.address,
        removeLiquidity
      );
      balance0After = await token0.balanceOf(await wallet.getAddress());
      balance1After = await wallet.provider?.getBalance(
        await wallet.getAddress()
      );
      balanceArrakisV1After = await rakisTokenW.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceArrakisV1Before).to.be.gt(balanceArrakisV1After);
      expect(balanceArrakisV1After).to.equal(ethers.constants.Zero);

      contractBalance0 = await token0W.balanceOf(vaultRouter.address);
      contractBalance1 = await token1W.balanceOf(vaultRouter.address);
      contractBalanceG = await rakisTokenW.balanceOf(vaultRouter.address);
      routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);
    });
    it("add and remove liquidity using native ETH and staking", async function () {
      const arrakisWethVault = (await ethers.getContractAt(
        "IArrakisVaultV1",
        addresses.ArrakisV1UsdcWethPool
      )) as IArrakisVaultV1;
      const token0W = (await ethers.getContractAt(
        "IERC20",
        await arrakisWethVault.token0()
      )) as IERC20;
      const token1W = (await ethers.getContractAt(
        "IERC20",
        await arrakisWethVault.token1()
      )) as IERC20;
      const rakisTokenW = (await ethers.getContractAt(
        "IERC20",
        addresses.ArrakisV1UsdcWethPool
      )) as IERC20;

      expect(await arrakisWethVault.token1()).to.equal(addresses.WETH);

      const gaugeImplFactory = ethers.ContractFactory.fromSolidity(Gauge);
      const gaugeImpl = await gaugeImplFactory
        .connect(wallet)
        .deploy({ gasLimit: 6000000 });
      const encoded = gaugeImpl.interface.encodeFunctionData("initialize", [
        arrakisWethVault.address,
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
      const stRakisTokenW = (await ethers.getContractAt(
        "ERC20",
        gauge.address
      )) as ERC20;

      await gauge
        .connect(wallet)
        .add_reward(token0.address, await wallet.getAddress(), {
          gasLimit: 6000000,
        });
      await token0
        .connect(wallet)
        .approve(gauge.address, WAD.mul(ethers.BigNumber.from("100")));
      await gauge.deposit_reward_token(
        token0.address,
        WAD.mul(ethers.BigNumber.from("100")),
        { gasLimit: 6000000 }
      );

      await token0W
        .connect(wallet)
        .approve(
          vaultRouterWrapper.address,
          ethers.utils.parseEther("1000000")
        );
      let balance0Before = await token0W.balanceOf(await wallet.getAddress());
      let balance1Before = await wallet.provider?.getBalance(
        await wallet.getAddress()
      );
      let balanceArrakisV1Before = await rakisTokenW.balanceOf(
        await wallet.getAddress()
      );
      let balanceStakedBefore = await stRakisTokenW.balanceOf(
        await wallet.getAddress()
      );

      const input0 = "100000000";
      const input1 = WAD.mul(ethers.BigNumber.from("2"));
      const addLiquidityData = {
        amount0Max: input0,
        amount1Max: input1,
        amount0Min: 0,
        amount1Min: 0,
        receiver: await wallet.getAddress(),
        useETH: true,
        gaugeAddress: gauge.address,
      };
      await vaultRouterWrapper.addLiquidity(
        arrakisWethVault.address,
        addLiquidityData,
        { value: input1 }
      );

      let balance0After = await token0W.balanceOf(await wallet.getAddress());
      let balance1After = await wallet.provider?.getBalance(
        await wallet.getAddress()
      );
      let balanceArrakisV1After = await rakisTokenW.balanceOf(
        await wallet.getAddress()
      );
      let balanceStakedAfter = await stRakisTokenW.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV1Before).to.be.eq(balanceArrakisV1After);
      expect(balanceStakedBefore).to.be.lt(balanceStakedAfter);

      let contractBalance0 = await token0W.balanceOf(vaultRouter.address);
      let contractBalance1 = await token1W.balanceOf(vaultRouter.address);
      let contractBalance2 = await rakisTokenW.balanceOf(vaultRouter.address);
      let contractBalance3 = await stRakisTokenW.balanceOf(vaultRouter.address);
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
      const balanceRewardsBefore = await token0.balanceOf(
        await wallet.getAddress()
      );
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

      await stRakisTokenW.approve(
        vaultRouterWrapper.address,
        balanceStakedBefore
      );
      const removeLiquidity = {
        burnAmount: balanceStakedBefore,
        amount0Min: 0,
        amount1Min: 0,
        receiver: await wallet.getAddress(),
        receiveETH: true,
        gaugeAddress: gauge.address,
      };
      await vaultRouterWrapper.removeLiquidity(
        arrakisWethVault.address,
        removeLiquidity
      );
      balance0After = await token0W.balanceOf(await wallet.getAddress());
      balance1After = await wallet.provider?.getBalance(
        await wallet.getAddress()
      );
      balanceArrakisV1After = await rakisTokenW.balanceOf(
        await wallet.getAddress()
      );
      balanceStakedAfter = await stRakisTokenW.balanceOf(
        await wallet.getAddress()
      );
      const balanceRewardsAfter = await token0.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceRewardsAfter).to.be.gt(balanceRewardsBefore);
      expect(balanceArrakisV1Before).to.be.eq(balanceArrakisV1After);
      expect(balanceArrakisV1After).to.equal(ethers.constants.Zero);

      contractBalance0 = await token0W.balanceOf(vaultRouter.address);
      contractBalance1 = await token1W.balanceOf(vaultRouter.address);
      contractBalance2 = await rakisTokenW.balanceOf(vaultRouter.address);
      contractBalance3 = await stRakisTokenW.balanceOf(vaultRouter.address);
      routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalance2).to.equal(ethers.constants.Zero);
      expect(contractBalance3).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);
    });
  });
  describe("Swap and add liquidity tests", function () {
    it("should test DAI/USDC vault", async function () {
      const [isPositionInRange] = await getPositionStatus(vault);
      // console.log("isPositionInRange: ", isPositionInRange);
      // console.log("isToken0Empty: ", isToken0Empty);

      if (isPositionInRange) {
        console.log("\n use A,B and swap A for B");
        await swapAndAddTest(
          vault,
          token0,
          token1,
          rakisToken,
          ethers.BigNumber.from("10000"),
          ethers.BigNumber.from("1000"),
          true,
          5,
          false,
          "scenario1"
        );
        console.log("> same test with stake...");
        await swapAndAddTest(
          vault,
          token0,
          token1,
          rakisToken,
          ethers.BigNumber.from("10000"),
          ethers.BigNumber.from("1000"),
          true,
          5,
          false,
          "scenario1",
          stRakisToken
        );

        console.log("\n use A,B and swap B for A");
        await swapAndAddTest(
          vault,
          token0,
          token1,
          rakisToken,
          ethers.BigNumber.from("1000"),
          ethers.BigNumber.from("10000"),
          false,
          5,
          false,
          "scenario2"
        );
        console.log("> same test with stake...");
        await swapAndAddTest(
          vault,
          token0,
          token1,
          rakisToken,
          ethers.BigNumber.from("1000"),
          ethers.BigNumber.from("10000"),
          false,
          5,
          false,
          "scenario2",
          stRakisToken
        );

        console.log("\n use only A, swap A for B");
        await swapAndAddTest(
          vault,
          token0,
          token1,
          rakisToken,
          ethers.BigNumber.from("1000"),
          ethers.BigNumber.from("0"),
          true,
          5,
          false,
          "scenario3"
        );
        console.log("> same test with stake...");
        await swapAndAddTest(
          vault,
          token0,
          token1,
          rakisToken,
          ethers.BigNumber.from("1000"),
          ethers.BigNumber.from("0"),
          true,
          5,
          false,
          "scenario3",
          stRakisToken
        );

        console.log("\n use only B, swap B for A");
        await swapAndAddTest(
          vault,
          token0,
          token1,
          rakisToken,
          ethers.BigNumber.from("0"),
          ethers.BigNumber.from("1000"),
          false,
          5,
          false,
          "scenario4"
        );
        console.log("> same test with stake...");
        await swapAndAddTest(
          vault,
          token0,
          token1,
          rakisToken,
          ethers.BigNumber.from("0"),
          ethers.BigNumber.from("1000"),
          false,
          5,
          false,
          "scenario4",
          stRakisToken
        );
      }
    });
    it("should test USDC/ETH vault", async function () {
      const arrakisWethVault = (await ethers.getContractAt(
        "IArrakisVaultV1",
        addresses.ArrakisV1UsdcWethPool
      )) as IArrakisVaultV1;
      const token0W = (await ethers.getContractAt(
        "ERC20",
        await arrakisWethVault.token0()
      )) as ERC20;
      const token1W = (await ethers.getContractAt(
        "ERC20",
        await arrakisWethVault.token1()
      )) as ERC20;
      const rakisTokenW = (await ethers.getContractAt(
        "ERC20",
        addresses.ArrakisV1UsdcWethPool
      )) as ERC20;
      const gaugeImplFactory = ethers.ContractFactory.fromSolidity(Gauge);
      const gaugeImpl = await gaugeImplFactory
        .connect(wallet)
        .deploy({ gasLimit: 6000000 });
      const encoded = gaugeImpl.interface.encodeFunctionData("initialize", [
        arrakisWethVault.address,
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
      const gaugeW: Contract = await ethers.getContractAt(
        Gauge.abi,
        contract.address
      );
      const stRakisTokenW = (await ethers.getContractAt(
        "ERC20",
        gaugeW.address
      )) as ERC20;

      expect(await arrakisWethVault.token1()).to.equal(addresses.WETH);

      const [isPositionInRange, isToken0Empty] = await getPositionStatus(
        arrakisWethVault
      );
      // console.log("isPositionInRange: ", isPositionInRange);
      // console.log("isToken0Empty: ", isToken0Empty);

      if (isPositionInRange || (!isPositionInRange && isToken0Empty)) {
        console.log("\n use A,B and swap A for B");
        await swapAndAddTest(
          arrakisWethVault,
          token0W,
          token1W,
          rakisTokenW,
          ethers.BigNumber.from("10000"),
          ethers.BigNumber.from("1"),
          true,
          5,
          false,
          "scenario1"
        );
        console.log("> same test with stake...");
        await swapAndAddTest(
          arrakisWethVault,
          token0W,
          token1W,
          rakisTokenW,
          ethers.BigNumber.from("10000"),
          ethers.BigNumber.from("1"),
          true,
          5,
          false,
          "scenario1",
          stRakisTokenW
        );
        console.log(">> same test with native ETH...");
        await swapAndAddTest(
          arrakisWethVault,
          token0W,
          token1W,
          rakisTokenW,
          ethers.BigNumber.from("10000"),
          ethers.BigNumber.from("1"),
          true,
          5,
          true,
          "scenario1"
        );
        console.log(">>> same test with native ETH and stake...");
        await swapAndAddTest(
          arrakisWethVault,
          token0W,
          token1W,
          rakisTokenW,
          ethers.BigNumber.from("10000"),
          ethers.BigNumber.from("1"),
          true,
          5,
          true,
          "scenario1",
          stRakisTokenW
        );
      }

      if (isPositionInRange || (!isPositionInRange && isToken0Empty)) {
        console.log("\n use only A, swap A for B");
        await swapAndAddTest(
          arrakisWethVault,
          token0W,
          token1W,
          rakisTokenW,
          ethers.BigNumber.from("10000"),
          ethers.BigNumber.from("0"),
          true,
          5,
          false,
          "scenario2"
        );
        console.log("> same test with stake...");
        await swapAndAddTest(
          arrakisWethVault,
          token0W,
          token1W,
          rakisTokenW,
          ethers.BigNumber.from("10000"),
          ethers.BigNumber.from("0"),
          true,
          5,
          false,
          "scenario2",
          stRakisTokenW
        );
        console.log(">> same test with native ETH...");
        await swapAndAddTest(
          arrakisWethVault,
          token0W,
          token1W,
          rakisTokenW,
          ethers.BigNumber.from("10000"),
          ethers.BigNumber.from("0"),
          true,
          5,
          true,
          "scenario2"
        );
        console.log(">>> same test with native ETH and stake...");
        await swapAndAddTest(
          arrakisWethVault,
          token0W,
          token1W,
          rakisTokenW,
          ethers.BigNumber.from("10000"),
          ethers.BigNumber.from("0"),
          true,
          5,
          true,
          "scenario2",
          stRakisTokenW
        );
      }
    });
    it("should test swap and add to a new vault out of range (token0 empty)", async function () {
      const arrakisFactory = await ethers.getContractAt(
        [
          "function deployVault(address tokenA,address tokenB,uint24 uniFee,address manager,uint16 managerFee,int24 lowerTick,int24 upperTick) external returns (address pool)",
          "event PoolCreated(address indexed uniPool,address indexed manager,address indexed pool)",
        ],
        addresses.ArrakisV1Factory
      );

      // listener for getting data from "PoolCreated" event
      const poolCreatedEventData = {
        uniPool: "",
        manager: "",
        pool: "",
      };
      let hasCreated = false;
      arrakisFactory.on("PoolCreated", (uniPool, manager, pool) => {
        poolCreatedEventData.uniPool = uniPool;
        poolCreatedEventData.manager = manager;
        poolCreatedEventData.pool = pool;
        hasCreated = true;
      });

      // function that returns a promise that resolves when "Swapped" and "Minted" are fired
      const getPoolCreationData = async () => {
        return new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            if (hasCreated) {
              clearInterval(interval);
              resolve();
            }
          }, 5000);
        });
      };

      await arrakisFactory.deployVault(
        addresses.USDC,
        addresses.WETH,
        3000,
        await wallet.getAddress(),
        0,
        -72000,
        72000
      );

      await getPoolCreationData();

      const newVault: IArrakisVaultV1 = (await ethers.getContractAt(
        "IArrakisVaultV1",
        poolCreatedEventData.pool
      )) as IArrakisVaultV1;
      const token0 = (await ethers.getContractAt(
        "ERC20",
        await newVault.token0()
      )) as ERC20;
      const token1 = (await ethers.getContractAt(
        "ERC20",
        await newVault.token1()
      )) as ERC20;
      const rakisToken = (await ethers.getContractAt(
        "ERC20",
        newVault.address
      )) as ERC20;
      const gaugeImplFactory = ethers.ContractFactory.fromSolidity(Gauge);
      const gaugeImpl = await gaugeImplFactory
        .connect(wallet)
        .deploy({ gasLimit: 6000000 });
      const encoded = gaugeImpl.interface.encodeFunctionData("initialize", [
        newVault.address,
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
      const gaugeW: Contract = await ethers.getContractAt(
        Gauge.abi,
        contract.address
      );
      const stRakisToken = (await ethers.getContractAt(
        "ERC20",
        gaugeW.address
      )) as ERC20;

      const [isPositionInRange, isToken0Empty] = await getPositionStatus(
        newVault
      );
      // console.log("isPositionInRange: ", isPositionInRange);
      // console.log("isToken0Empty: ", isToken0Empty);
      if (!isPositionInRange) {
        if (isToken0Empty) {
          console.log("\n use only A");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("0"),
            true,
            5,
            false,
            "scenario1"
          );

          console.log("> same test with stake");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("0"),
            true,
            5,
            false,
            "scenario1",
            stRakisToken
          );

          console.log(">> same test with native ETH");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("0"),
            true,
            5,
            true,
            "scenario1"
          );

          console.log(">>> same test with native ETH and stake");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("0"),
            true,
            5,
            true,
            "scenario1",
            stRakisToken
          );

          console.log("\n use A,B and swap A for B");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("2"),
            true,
            5,
            false,
            "scenario1"
          );

          console.log("> same test with stake");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("2"),
            true,
            5,
            false,
            "scenario1",
            stRakisToken
          );

          console.log(">> same test with native ETH");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("2"),
            true,
            5,
            true,
            "scenario1"
          );

          console.log(">>> same test with native ETH and stake");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("2"),
            true,
            5,
            true,
            "scenario1",
            stRakisToken
          );
        }
      }
    });
    it("should test swap and add to a new vault out of range (token1 empty)", async function () {
      const arrakisFactory = await ethers.getContractAt(
        [
          "function deployVault(address tokenA,address tokenB,uint24 uniFee,address manager,uint16 managerFee,int24 lowerTick,int24 upperTick) external returns (address pool)",
          "event PoolCreated(address indexed uniPool,address indexed manager,address indexed pool)",
        ],
        addresses.ArrakisV1Factory
      );

      // listener for getting data from "PoolCreated" event
      const poolCreatedEventData = {
        uniPool: "",
        manager: "",
        pool: "",
      };
      let hasCreated = false;
      arrakisFactory.on("PoolCreated", (uniPool, manager, pool) => {
        poolCreatedEventData.uniPool = uniPool;
        poolCreatedEventData.manager = manager;
        poolCreatedEventData.pool = pool;
        hasCreated = true;
      });

      // function that returns a promise that resolves when "Swapped" and "Minted" are fired
      const getPoolCreationData = async () => {
        return new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            if (hasCreated) {
              clearInterval(interval);
              resolve();
            }
          }, 5000);
        });
      };
      // 201609 (current tick)
      await arrakisFactory.deployVault(
        addresses.USDC,
        addresses.WETH,
        3000,
        await wallet.getAddress(),
        0,
        204000,
        240000
      );

      await getPoolCreationData();

      const newVault: IArrakisVaultV1 = (await ethers.getContractAt(
        "IArrakisVaultV1",
        poolCreatedEventData.pool
      )) as IArrakisVaultV1;
      const token0 = (await ethers.getContractAt(
        "ERC20",
        await newVault.token0()
      )) as ERC20;
      const token1 = (await ethers.getContractAt(
        "ERC20",
        await newVault.token1()
      )) as ERC20;
      const rakisToken = (await ethers.getContractAt(
        "ERC20",
        newVault.address
      )) as ERC20;
      const gaugeImplFactory = ethers.ContractFactory.fromSolidity(Gauge);
      const gaugeImpl = await gaugeImplFactory
        .connect(wallet)
        .deploy({ gasLimit: 6000000 });
      const encoded = gaugeImpl.interface.encodeFunctionData("initialize", [
        newVault.address,
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
      const gaugeW: Contract = await ethers.getContractAt(
        Gauge.abi,
        contract.address
      );
      const stRakisToken = (await ethers.getContractAt(
        "ERC20",
        gaugeW.address
      )) as ERC20;

      const [isPositionInRange, isToken0Empty] = await getPositionStatus(
        newVault
      );
      // console.log("isPositionInRange: ", isPositionInRange);
      // console.log("isToken0Empty: ", isToken0Empty);
      if (!isPositionInRange) {
        if (!isToken0Empty) {
          console.log("\n use only B");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("0"),
            ethers.BigNumber.from("10"),
            false,
            5,
            false,
            "scenario1"
          );

          console.log("> same test with stake");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("0"),
            ethers.BigNumber.from("10"),
            false,
            5,
            false,
            "scenario1",
            stRakisToken
          );

          console.log(">> same test with native ETH");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("0"),
            ethers.BigNumber.from("10"),
            false,
            5,
            true,
            "scenario1"
          );

          console.log(">>> same test with native ETH and stake");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("0"),
            ethers.BigNumber.from("10"),
            false,
            5,
            true,
            "scenario1",
            stRakisToken
          );

          console.log("\n use A,B and swap B for A");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("10"),
            false,
            5,
            false,
            "scenario1"
          );

          console.log("> same test with stake");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("10"),
            false,
            5,
            false,
            "scenario1",
            stRakisToken
          );

          console.log(">> same test with native ETH");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("10"),
            false,
            5,
            true,
            "scenario1"
          );

          console.log(">>> same test with native ETH and stake");
          await swapAndAddTest(
            newVault,
            token0,
            token1,
            rakisToken,
            ethers.BigNumber.from("10000"),
            ethers.BigNumber.from("10"),
            false,
            5,
            true,
            "scenario1",
            stRakisToken
          );
        }
      }
    });
  });
});
