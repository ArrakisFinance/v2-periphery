import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import {
  ArrakisV2SwapExecutor,
  ArrakisV2Router,
  ERC20,
  ManagerMock,
  SwapResolver,
  IArrakisV2,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";
import { BigNumber, Contract } from "ethers";
import {
  getPeripheryContracts,
  deployArrakisV2,
  getFundsFromFaucet,
  createGauge,
  getArrakisResolver,
  getManagerMock,
  getSwapResolver,
} from "../src/testEnvUtils";
import { swapAndAddTest } from "../src/swapAndAddTest";

let addresses: Addresses;

describe("ArrakisV2Router tests on DAI/WETH vault", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let walletAddress: string;

  let owner: SignerWithAddress;

  let token0: ERC20;
  let token1: ERC20;
  let rakisToken: ERC20;
  let stRakisToken: ERC20;

  let resolver: Contract;
  let genericRouter: ArrakisV2Router;
  let routerExecutor: ArrakisV2SwapExecutor;
  let swapResolver: SwapResolver;
  let manager: ManagerMock;

  let vault: IArrakisV2;

  let gauge: Contract;
  let routerExecutorBalanceEth: BigNumber | undefined;
  let genericRouterBalanceEth: BigNumber | undefined;

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet, , owner] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    [, routerExecutor, genericRouter] = await getPeripheryContracts(owner);

    manager = await getManagerMock();

    resolver = await getArrakisResolver(owner);

    swapResolver = await getSwapResolver();

    [vault] = await deployArrakisV2(
      wallet,
      addresses.DAI,
      addresses.WETH,
      3000,
      resolver,
      manager.address
    );

    token0 = (await ethers.getContractAt(
      "ERC20",
      await vault.token0()
    )) as ERC20;
    token1 = (await ethers.getContractAt(
      "ERC20",
      await vault.token1()
    )) as ERC20;
    rakisToken = (await ethers.getContractAt("ERC20", vault.address)) as ERC20;

    await getFundsFromFaucet(addresses.faucetDai, token0, walletAddress);
    await getFundsFromFaucet(addresses.faucetWeth, token1, walletAddress);

    [gauge, stRakisToken] = await createGauge(vault.address);

    // await routerExecutor.connect(owner).whitelistRouter(genericRouter.address);

    routerExecutorBalanceEth = await wallet.provider?.getBalance(
      routerExecutor.address
    );
    genericRouterBalanceEth = await wallet.provider?.getBalance(
      genericRouter.address
    );
  });

  it("#0 : should deposit funds with addLiquidity", async function () {
    const amount0In = ethers.utils.parseEther("10");
    const amount1In = ethers.utils.parseEther("10000");

    await token0.connect(wallet).approve(genericRouter.address, amount0In);
    await token1.connect(wallet).approve(genericRouter.address, amount1In);

    const balance0Before = await token0.balanceOf(walletAddress);
    const balance1Before = await token1.balanceOf(walletAddress);
    const balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);

    const addLiquidityData = {
      vault: vault.address,
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      receiver: walletAddress,
      useETH: false,
      gaugeAddress: ethers.constants.AddressZero,
    };

    await genericRouter.addLiquidity(addLiquidityData);

    const balance0After = await token0.balanceOf(walletAddress);
    const balance1After = await token1.balanceOf(walletAddress);
    const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0Before).to.be.gt(balance0After);
    expect(balance1Before).to.be.gt(balance1After);
    expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);

    const routerExecutorBalance0 = await token0.balanceOf(
      routerExecutor.address
    );
    const routerExecutorBalance1 = await token1.balanceOf(
      routerExecutor.address
    );
    const routerExecutorBalanceRakis = await rakisToken.balanceOf(
      routerExecutor.address
    );

    expect(routerExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceRakis).to.equal(ethers.constants.Zero);

    const genericRouterBalance0 = await token0.balanceOf(genericRouter.address);
    const genericRouterBalance1 = await token1.balanceOf(genericRouter.address);
    const genericRouterBalanceRakis = await rakisToken.balanceOf(
      genericRouter.address
    );

    expect(genericRouterBalance0).to.equal(ethers.constants.Zero);
    expect(genericRouterBalance1).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceRakis).to.equal(ethers.constants.Zero);
  });

  it("#1 : should deposit funds and stake", async function () {
    const amount0In = ethers.utils.parseEther("10000");
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(genericRouter.address, amount0In);
    await token1.connect(wallet).approve(genericRouter.address, amount1In);

    const balance0Before = await token0.balanceOf(walletAddress);
    const balance1Before = await token1.balanceOf(walletAddress);
    const balanceStakedBefore = await stRakisToken.balanceOf(walletAddress);
    const balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);

    await gauge
      .connect(wallet)
      .add_reward(token0.address, await wallet.getAddress(), {
        gasLimit: 6000000,
      });

    const rewardAmount = ethers.utils.parseEther("1000");
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
      amountSharesMin: 0,
      receiver: walletAddress,
      useETH: false,
      gaugeAddress: gauge.address,
      rebalance: false,
    };

    await genericRouter.addLiquidity(addLiquidityData);

    const balance0After = await token0.balanceOf(walletAddress);
    const balance1After = await token1.balanceOf(walletAddress);
    const balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);
    const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0Before).to.be.gt(balance0After);
    expect(balance1Before).to.be.gt(balance1After);
    expect(balanceArrakisV2Before).to.be.eq(balanceArrakisV2After);
    expect(balanceStakedBefore).to.be.lt(balanceStakedAfter);

    const routerExecutorBalance0 = await token0.balanceOf(
      routerExecutor.address
    );
    const routerExecutorBalance1 = await token1.balanceOf(
      routerExecutor.address
    );
    const routerExecutorBalanceRakis = await rakisToken.balanceOf(
      routerExecutor.address
    );
    const routerExecutorBalanceStRakis = await stRakisToken.balanceOf(
      routerExecutor.address
    );

    expect(routerExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceStRakis).to.equal(ethers.constants.Zero);

    const genericRouterBalance0 = await token0.balanceOf(genericRouter.address);
    const genericRouterBalance1 = await token1.balanceOf(genericRouter.address);
    const genericRouterBalanceRakis = await rakisToken.balanceOf(
      genericRouter.address
    );
    const genericRouterBalanceStRakis = await stRakisToken.balanceOf(
      genericRouter.address
    );

    expect(genericRouterBalance0).to.equal(ethers.constants.Zero);
    expect(genericRouterBalance1).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceRakis).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceStRakis).to.equal(ethers.constants.Zero);

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
  });

  it("#2 : should withdraw funds with removeLiquidity", async function () {
    const balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);
    expect(balanceArrakisV2Before).to.be.gt(ethers.constants.Zero);

    const balance0Before = await token0.balanceOf(walletAddress);
    const balance1Before = await token1.balanceOf(walletAddress);
    await rakisToken.approve(genericRouter.address, balanceArrakisV2Before);
    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceArrakisV2Before.div(2),
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      receiveETH: false,
      gaugeAddress: "0x0000000000000000000000000000000000000000",
    };
    await genericRouter.removeLiquidity(removeLiquidity);
    const balance0After = await token0.balanceOf(walletAddress);
    const balance1After = await token1.balanceOf(walletAddress);
    const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceArrakisV2Before).to.be.gt(balanceArrakisV2After);

    const routerExecutorBalance0 = await token0.balanceOf(
      routerExecutor.address
    );
    const routerExecutorBalance1 = await token1.balanceOf(
      routerExecutor.address
    );
    const routerExecutorBalanceRakis = await rakisToken.balanceOf(
      routerExecutor.address
    );

    expect(routerExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceRakis).to.equal(ethers.constants.Zero);

    const genericRouterBalance0 = await token0.balanceOf(genericRouter.address);
    const genericRouterBalance1 = await token1.balanceOf(genericRouter.address);
    const genericRouterBalanceRakis = await rakisToken.balanceOf(
      genericRouter.address
    );

    expect(genericRouterBalance0).to.equal(ethers.constants.Zero);
    expect(genericRouterBalance1).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceRakis).to.equal(ethers.constants.Zero);
  });

  it("#3 : should unstake and withdraw funds", async function () {
    const balanceStakedBefore = await stRakisToken.balanceOf(walletAddress);
    expect(balanceStakedBefore).to.be.gt(ethers.constants.Zero);

    const balance0Before = await token0.balanceOf(walletAddress);
    const balance1Before = await token1.balanceOf(walletAddress);
    await stRakisToken.approve(genericRouter.address, balanceStakedBefore);
    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceStakedBefore,
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      receiveETH: false,
      gaugeAddress: gauge.address,
    };
    await genericRouter.removeLiquidity(removeLiquidity);
    const balance0After = await token0.balanceOf(walletAddress);
    const balance1After = await token1.balanceOf(walletAddress);
    const balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceStakedBefore).to.be.gt(balanceStakedAfter);
    expect(balanceStakedAfter).to.eq(0);

    const routerBalance0 = await token0.balanceOf(routerExecutor.address);
    const routerBalance1 = await token1.balanceOf(routerExecutor.address);
    const routerBalanceRakis = await rakisToken.balanceOf(
      routerExecutor.address
    );
    const routerBalanceStRakis = await stRakisToken.balanceOf(
      routerExecutor.address
    );

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);

    const genericRouterBalance0 = await token0.balanceOf(genericRouter.address);
    const genericRouterBalance1 = await token1.balanceOf(genericRouter.address);
    const genericRouterBalanceRakis = await rakisToken.balanceOf(
      genericRouter.address
    );
    const genericRouterBalanceStRakis = await stRakisToken.balanceOf(
      genericRouter.address
    );

    expect(genericRouterBalance0).to.equal(ethers.constants.Zero);
    expect(genericRouterBalance1).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceRakis).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceStRakis).to.equal(ethers.constants.Zero);
  });

  it("#4 : add and remove liquidity using native ETH", async function () {
    const token1Address = await vault.token1();
    expect(token1Address.toLowerCase()).to.equal(addresses.WETH.toLowerCase());

    const amount0In = ethers.utils.parseEther("10000");
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(genericRouter.address, amount0In);
    await token1.connect(wallet).approve(genericRouter.address, amount1In);

    let balance0Before = await token0.balanceOf(walletAddress);
    let balance1Before = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);

    const addLiquidityData = {
      vault: vault.address,
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      receiver: walletAddress,
      useETH: true,
      gaugeAddress: "0x0000000000000000000000000000000000000000",
      rebalance: false,
    };

    await genericRouter.addLiquidity(addLiquidityData, {
      value: amount1In,
    });

    let balance0After = await token0.balanceOf(walletAddress);
    let balance1After = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0Before).to.be.gt(balance0After);
    expect(balance1Before).to.be.gt(balance1After);
    expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);

    let routerExecutorBalance0 = await token0.balanceOf(routerExecutor.address);
    let routerExecutorBalance1 = await token1.balanceOf(routerExecutor.address);
    let routerExecutorBalanceRakis = await rakisToken.balanceOf(
      routerExecutor.address
    );
    let routerExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      routerExecutor.address
    );

    expect(routerExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceEth).to.equal(routerExecutorBalanceEthEnd);

    let genericRouterBalance0 = await token0.balanceOf(genericRouter.address);
    let genericRouterBalance1 = await token1.balanceOf(genericRouter.address);
    let genericRouterBalanceRakis = await rakisToken.balanceOf(
      genericRouter.address
    );
    let genericRouterBalanceEthEnd = await wallet.provider?.getBalance(
      genericRouter.address
    );

    expect(genericRouterBalance0).to.equal(ethers.constants.Zero);
    expect(genericRouterBalance1).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceRakis).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceEth).to.equal(genericRouterBalanceEthEnd);

    balance0Before = balance0After;
    balance1Before = balance1After;
    balanceArrakisV2Before = balanceArrakisV2After;

    // removeLiquidityETH

    await rakisToken.approve(genericRouter.address, balanceArrakisV2Before);
    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceArrakisV2Before,
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      receiveETH: true,
      gaugeAddress: "0x0000000000000000000000000000000000000000",
    };

    await genericRouter.removeLiquidity(removeLiquidity);

    balance0After = await token0.balanceOf(walletAddress);
    balance1After = await wallet.provider?.getBalance(walletAddress);
    balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceArrakisV2Before).to.be.gt(balanceArrakisV2After);
    expect(balanceArrakisV2After).to.equal(ethers.constants.Zero);

    routerExecutorBalance0 = await token0.balanceOf(routerExecutor.address);
    routerExecutorBalance1 = await token1.balanceOf(routerExecutor.address);
    routerExecutorBalanceRakis = await rakisToken.balanceOf(
      routerExecutor.address
    );
    routerExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      routerExecutor.address
    );

    expect(routerExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceEth).to.equal(routerExecutorBalanceEthEnd);

    genericRouterBalance0 = await token0.balanceOf(genericRouter.address);
    genericRouterBalance1 = await token1.balanceOf(genericRouter.address);
    genericRouterBalanceRakis = await rakisToken.balanceOf(
      genericRouter.address
    );
    genericRouterBalanceEthEnd = await wallet.provider?.getBalance(
      genericRouter.address
    );

    expect(genericRouterBalance0).to.equal(ethers.constants.Zero);
    expect(genericRouterBalance1).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceRakis).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceEth).to.equal(genericRouterBalanceEthEnd);
  });

  it("#5 : add and remove liquidity using native ETH and staking", async function () {
    const token1Address = await vault.token1();
    expect(token1Address.toLowerCase()).to.equal(addresses.WETH.toLowerCase());

    const amount0In = ethers.utils.parseEther("10000");
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(genericRouter.address, amount0In);

    let balance0Before = await token0.balanceOf(walletAddress);
    let balance1Before = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);
    let balanceStakedBefore = await stRakisToken.balanceOf(walletAddress);

    const addLiquidityData = {
      vault: vault.address,
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      receiver: walletAddress,
      useETH: true,
      gaugeAddress: gauge.address,
      rebalance: false,
    };
    await genericRouter.addLiquidity(addLiquidityData, {
      value: amount1In,
    });

    let balance0After = await token0.balanceOf(walletAddress);
    let balance1After = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);
    let balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);

    expect(balance0Before).to.be.gt(balance0After);
    expect(balance1Before).to.be.gt(balance1After);
    expect(balanceArrakisV2Before).to.be.eq(balanceArrakisV2After);
    expect(balanceStakedBefore).to.be.lt(balanceStakedAfter);

    let routerExecutorBalance0 = await token0.balanceOf(routerExecutor.address);
    let routerExecutorBalance1 = await token1.balanceOf(routerExecutor.address);
    let routerExecutorBalanceRakis = await rakisToken.balanceOf(
      routerExecutor.address
    );
    let routerExecutorBalanceStRakis = await stRakisToken.balanceOf(
      routerExecutor.address
    );
    let routerExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      routerExecutor.address
    );

    expect(routerExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceStRakis).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceEthEnd).to.equal(routerExecutorBalanceEth);

    let genericRouterBalance0 = await token0.balanceOf(genericRouter.address);
    let genericRouterBalance1 = await token1.balanceOf(genericRouter.address);
    let genericRouterBalanceRakis = await rakisToken.balanceOf(
      genericRouter.address
    );
    let genericRouterBalanceStRakis = await stRakisToken.balanceOf(
      genericRouter.address
    );
    let genericRouterBalanceEthEnd = await wallet.provider?.getBalance(
      genericRouter.address
    );

    expect(genericRouterBalance0).to.equal(ethers.constants.Zero);
    expect(genericRouterBalance1).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceRakis).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceStRakis).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceEthEnd).to.equal(genericRouterBalanceEth);

    balance0Before = balance0After;
    balance1Before = balance1After;
    balanceArrakisV2Before = balanceArrakisV2After;
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

    await stRakisToken.approve(genericRouter.address, balanceStakedBefore);

    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceStakedBefore,
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      receiveETH: true,
      gaugeAddress: gauge.address,
    };
    await genericRouter.removeLiquidity(removeLiquidity);

    balance0After = await token0.balanceOf(walletAddress);
    balance1After = await wallet.provider?.getBalance(walletAddress);
    balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);
    balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);
    const balanceRewardsAfter = await token0.balanceOf(walletAddress);

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceRewardsAfter).to.be.gt(balanceRewardsBefore);
    expect(balanceArrakisV2Before).to.be.eq(balanceArrakisV2After);
    expect(balanceArrakisV2After).to.equal(ethers.constants.Zero);

    routerExecutorBalance0 = await token0.balanceOf(routerExecutor.address);
    routerExecutorBalance1 = await token1.balanceOf(routerExecutor.address);
    routerExecutorBalanceRakis = await rakisToken.balanceOf(
      routerExecutor.address
    );
    routerExecutorBalanceStRakis = await stRakisToken.balanceOf(
      routerExecutor.address
    );
    routerExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      routerExecutor.address
    );

    expect(routerExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceStRakis).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceEthEnd).to.equal(routerExecutorBalanceEth);

    genericRouterBalance0 = await token0.balanceOf(genericRouter.address);
    genericRouterBalance1 = await token1.balanceOf(genericRouter.address);
    genericRouterBalanceRakis = await rakisToken.balanceOf(
      genericRouter.address
    );
    genericRouterBalanceStRakis = await stRakisToken.balanceOf(
      genericRouter.address
    );
    genericRouterBalanceEthEnd = await wallet.provider?.getBalance(
      genericRouter.address
    );

    expect(genericRouterBalance0).to.equal(ethers.constants.Zero);
    expect(genericRouterBalance1).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceRakis).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceStRakis).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceEth).to.equal(genericRouterBalanceEthEnd);
  });

  it("#6 : tests adding liquidity using native ETH passing empty msg.value", async function () {
    const token1Address = await vault.token1();
    expect(token1Address.toLowerCase()).to.equal(addresses.WETH.toLowerCase());

    const amount0In = ethers.utils.parseEther("10000");
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(genericRouter.address, amount0In);

    const transactionEthValue = ethers.BigNumber.from("0");

    const addLiquidityData = {
      vault: vault.address,
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      receiver: walletAddress,
      useETH: true,
      gaugeAddress: "0x0000000000000000000000000000000000000000",
      rebalance: false,
    };

    await expect(
      genericRouter.addLiquidity(addLiquidityData, {
        value: transactionEthValue,
      })
    ).to.be.revertedWith("Not enough ETH forwarded");
  });

  it("#7 : tests adding liquidity using native ETH passing double msg.value", async function () {
    const token1Address = await vault.token1();
    expect(token1Address.toLowerCase()).to.equal(addresses.WETH.toLowerCase());

    const amount0In = ethers.utils.parseEther("10000");
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(genericRouter.address, amount0In);

    let balance0Before = await token0.balanceOf(walletAddress);
    let balance1Before = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);
    let genericRouterEthBalanceBefore = await wallet.provider?.getBalance(
      genericRouter.address
    );

    const transactionEthValue = amount1In.mul(2);
    const addLiquidityData = {
      vault: vault.address,
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      receiver: walletAddress,
      useETH: true,
      gaugeAddress: "0x0000000000000000000000000000000000000000",
      rebalance: false,
    };
    await genericRouter.addLiquidity(addLiquidityData, {
      value: transactionEthValue,
    });

    let balance0After = await token0.balanceOf(walletAddress);
    let balance1After = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);
    const genericRouterEthBalanceAfter = await wallet.provider?.getBalance(
      genericRouter.address
    );

    expect(balance0Before).to.be.gt(balance0After);
    expect(balance1Before).to.be.gt(balance1After);
    expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);
    expect(genericRouterEthBalanceBefore).to.be.eq(
      genericRouterEthBalanceAfter
    );

    let routerExecutorBalance0 = await token0.balanceOf(routerExecutor.address);
    let routerExecutorBalance1 = await token1.balanceOf(routerExecutor.address);
    let routerExecutorBalanceRakis = await rakisToken.balanceOf(
      routerExecutor.address
    );
    let routerExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      routerExecutor.address
    );

    expect(routerExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceEth).to.equal(routerExecutorBalanceEthEnd);

    let genericRouterBalance0 = await token0.balanceOf(genericRouter.address);
    let genericRouterBalance1 = await token1.balanceOf(genericRouter.address);
    let genericRouterBalanceRakis = await rakisToken.balanceOf(
      genericRouter.address
    );
    let genericRouterBalanceEthEnd = await wallet.provider?.getBalance(
      genericRouter.address
    );

    expect(genericRouterBalance0).to.equal(ethers.constants.Zero);
    expect(genericRouterBalance1).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceRakis).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceEth).to.equal(genericRouterBalanceEthEnd);

    balance0Before = balance0After;
    balance1Before = balance1After;
    balanceArrakisV2Before = balanceArrakisV2After;
    genericRouterEthBalanceBefore = genericRouterEthBalanceAfter;

    // removeLiquidityETH

    await rakisToken.approve(genericRouter.address, balanceArrakisV2Before);
    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceArrakisV2Before,
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      receiveETH: true,
      gaugeAddress: "0x0000000000000000000000000000000000000000",
    };
    await genericRouter.removeLiquidity(removeLiquidity);
    balance0After = await token0.balanceOf(walletAddress);
    balance1After = await wallet.provider?.getBalance(walletAddress);
    balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceArrakisV2Before).to.be.gt(balanceArrakisV2After);
    expect(balanceArrakisV2After).to.equal(ethers.constants.Zero);

    routerExecutorBalance0 = await token0.balanceOf(routerExecutor.address);
    routerExecutorBalance1 = await token1.balanceOf(routerExecutor.address);
    routerExecutorBalanceRakis = await rakisToken.balanceOf(
      routerExecutor.address
    );
    routerExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      routerExecutor.address
    );

    genericRouterBalance0 = await token0.balanceOf(genericRouter.address);
    genericRouterBalance1 = await token1.balanceOf(genericRouter.address);
    genericRouterBalanceRakis = await rakisToken.balanceOf(
      genericRouter.address
    );
    genericRouterBalanceEthEnd = await wallet.provider?.getBalance(
      genericRouter.address
    );

    expect(routerExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerExecutorBalanceEth).to.equal(routerExecutorBalanceEthEnd);

    expect(genericRouterBalance0).to.equal(ethers.constants.Zero);
    expect(genericRouterBalance1).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceRakis).to.equal(ethers.constants.Zero);
    expect(genericRouterBalanceEth).to.equal(genericRouterBalanceEthEnd);
  });

  /**** Start of swapAndAddLiquidity tests */

  /** start of section depositing both tokens, swapping A for B */

  it("#8 : should use A,B and swap A for B", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      false, // 1
      "scenario1"
    );
  });

  it("#9 : should use A,B and swap A for B and stake", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      false,
      "scenario1",
      stRakisToken
    );
  });

  it("#10 : should use A,B and swap A for B using nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      true,
      "scenario1"
    );
  });

  it("#11 : should use A,B and swap A for B and stake using nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      true,
      "scenario1",
      stRakisToken
    );
  });

  it("#12 : should use A and B and revert with empty msg.value", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      true,
      "scenario1",
      stRakisToken,
      ethers.BigNumber.from("0")
    );
  });

  it("#13 : should use A and B and incorrect msg.value", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      true,
      "scenario1",
      stRakisToken,
      ethers.BigNumber.from("1")
    );
  });

  /** end of section depositing both tokens, swapping A for B */

  /** start of section depositing both tokens, swapping B for A */

  it("#14 : should use A,B and swap B for A", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("10"),
      ethers.BigNumber.from("5"),
      false,
      50,
      false, // 2
      "scenario2"
    );
  });

  it("#15 : should use A,B and swap B for A and stake", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("10"),
      ethers.BigNumber.from("5"),
      false,
      50,
      false,
      "scenario2",
      stRakisToken
    );
  });

  it("#16 : should use A,B and swap B for A using nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("10"),
      ethers.BigNumber.from("5"),
      false,
      50,
      true,
      "scenario2"
    );
  });

  it("#17 : should use A,B and swap B for A and stake using nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("10"),
      ethers.BigNumber.from("5"),
      false,
      50,
      true,
      "scenario2",
      stRakisToken
    );
  });

  /** end of section depositing both tokens, swapping B for A */

  /** start of section depositing only A, swapping A for B */

  it("#18 : should use only A and swap A for B", async function () {
    // single side
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("0"),
      true,
      50,
      false,
      "scenario3"
    );
  });

  it("#19 : should use only A and swap A for B and stake", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("0"),
      true,
      50,
      false,
      "scenario3",
      stRakisToken
    );
  });

  it("#20 : should use only A and swap A for B using native ETH", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("0"),
      true,
      50,
      true,
      "scenario3"
    );
  });

  it("#21 : should use only A and swap A for B and stake using nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("0"),
      true,
      50,
      true,
      "scenario3",
      stRakisToken
    );
  });

  it("#22 : should use only A and swap A for B with different msg.value and nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("0"),
      true,
      50,
      true,
      "scenario3",
      stRakisToken,
      ethers.BigNumber.from("100000")
    );
  });

  /** end of section depositing only A, swapping A for B */

  /** start of section depositing only B, swapping B for A */

  it("#23 : should use only B and swap B for A", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("5"),
      false,
      50,
      false,
      "scenario4"
    );
  });

  it("#24 : should use only B and swap B for A and stake", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("5"),
      false,
      50,
      false,
      "scenario4",
      stRakisToken
    );
  });

  it("#25 : should use only B and swap B for A using native ETH", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("5"),
      false,
      50,
      true,
      "scenario4"
    );
  });

  it("#26 : should use only B and swap B for A and stake using nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      genericRouter,
      routerExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("5"),
      false,
      50,
      true,
      "scenario4",
      stRakisToken
    );
  });

  /** end of section depositing only B, swapping B for A */

  /**** end of swapAndAddLiquidity tests */
});
