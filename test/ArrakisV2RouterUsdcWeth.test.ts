import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import {
  ArrakisV2Router,
  ArrakisV2RouterWrapper,
  ArrakisV2Resolver,
  ERC20,
  IVaultV2,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";
import { BigNumber, Contract } from "ethers";
import {
  swapAndAddTest,
  getPeripheryContracts,
  getVaultV2,
  getFundsFromFaucet,
  createGauge,
} from "../src/testUtils";

let addresses: Addresses;

describe("ArrakisV2Router tests on USDC/WETH vault", function () {
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

  let vault: IVaultV2;

  let gauge: Contract;
  let routerBalanceEth: BigNumber | undefined;
  let wrapperBalanceEth: BigNumber | undefined;

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    [resolver, vaultRouter, vaultRouterWrapper] = await getPeripheryContracts();

    [vault] = await getVaultV2(
      wallet,
      addresses.USDC,
      addresses.WETH,
      500,
      resolver
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

    const faucetUsdc = "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7";
    await getFundsFromFaucet(faucetUsdc, token0, walletAddress);

    const faucetWeth = "0x2f0b23f53734252bda2277357e97e1517d6b042a";
    await getFundsFromFaucet(faucetWeth, token1, walletAddress);

    [gauge, stRakisToken] = await createGauge(wallet, vault.address);

    routerBalanceEth = await wallet.provider?.getBalance(vaultRouter.address);
    wrapperBalanceEth = await wallet.provider?.getBalance(
      vaultRouterWrapper.address
    );
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
        rebalance: false,
      };

      await vaultRouterWrapper.addLiquidity(addLiquidityData);

      const balance0After = await token0.balanceOf(walletAddress);
      const balance1After = await token1.balanceOf(walletAddress);
      const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);

      const routerBalance0 = await token0.balanceOf(vaultRouter.address);
      const routerBalance1 = await token1.balanceOf(vaultRouter.address);
      const routerBalanceRakis = await rakisToken.balanceOf(
        vaultRouter.address
      );

      expect(routerBalance0).to.equal(ethers.constants.Zero);
      expect(routerBalance1).to.equal(ethers.constants.Zero);
      expect(routerBalanceRakis).to.equal(ethers.constants.Zero);

      const wrapperBalance0 = await token0.balanceOf(
        vaultRouterWrapper.address
      );
      const wrapperBalance1 = await token1.balanceOf(
        vaultRouterWrapper.address
      );
      const wrapperBalanceRakis = await rakisToken.balanceOf(
        vaultRouterWrapper.address
      );

      expect(wrapperBalance0).to.equal(ethers.constants.Zero);
      expect(wrapperBalance1).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceRakis).to.equal(ethers.constants.Zero);
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
        rebalance: false,
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

      const routerBalance0 = await token0.balanceOf(vaultRouter.address);
      const routerBalance1 = await token1.balanceOf(vaultRouter.address);
      const routerBalanceRakis = await rakisToken.balanceOf(
        vaultRouter.address
      );
      const routerBalanceStRakis = await stRakisToken.balanceOf(
        vaultRouter.address
      );

      expect(routerBalance0).to.equal(ethers.constants.Zero);
      expect(routerBalance1).to.equal(ethers.constants.Zero);
      expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
      expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);

      const wrapperBalance0 = await token0.balanceOf(
        vaultRouterWrapper.address
      );
      const wrapperBalance1 = await token1.balanceOf(
        vaultRouterWrapper.address
      );
      const wrapperBalanceRakis = await rakisToken.balanceOf(
        vaultRouterWrapper.address
      );
      const wrapperBalanceStRakis = await stRakisToken.balanceOf(
        vaultRouterWrapper.address
      );

      expect(wrapperBalance0).to.equal(ethers.constants.Zero);
      expect(wrapperBalance1).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceRakis).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceStRakis).to.equal(ethers.constants.Zero);

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

      let balance0Before = await token0.balanceOf(walletAddress);
      let balance1Before = await wallet.provider?.getBalance(walletAddress);
      let balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);

      const addLiquidityData = {
        vault: vault.address,
        amount0Max: amount0In,
        amount1Max: amount1In,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        useETH: true,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
        rebalance: false,
      };

      await vaultRouterWrapper.addLiquidity(addLiquidityData, {
        value: amount1In,
      });

      let balance0After = await token0.balanceOf(walletAddress);
      let balance1After = await wallet.provider?.getBalance(walletAddress);
      let balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);

      let routerBalance0 = await token0.balanceOf(vaultRouter.address);
      let routerBalance1 = await token1.balanceOf(vaultRouter.address);
      let routerBalanceRakis = await rakisToken.balanceOf(vaultRouter.address);
      let routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(routerBalance0).to.equal(ethers.constants.Zero);
      expect(routerBalance1).to.equal(ethers.constants.Zero);
      expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);

      let wrapperBalance0 = await token0.balanceOf(vaultRouterWrapper.address);
      let wrapperBalance1 = await token1.balanceOf(vaultRouterWrapper.address);
      let wrapperBalanceRakis = await rakisToken.balanceOf(
        vaultRouterWrapper.address
      );
      let wrapperBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouterWrapper.address
      );

      expect(wrapperBalance0).to.equal(ethers.constants.Zero);
      expect(wrapperBalance1).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceRakis).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceEth).to.equal(wrapperBalanceEthEnd);

      balance0Before = balance0After;
      balance1Before = balance1After;
      balanceArrakisV2Before = balanceArrakisV2After;

      // removeLiquidityETH

      await rakisToken.approve(
        vaultRouterWrapper.address,
        balanceArrakisV2Before
      );
      const removeLiquidity = {
        burns: [],
        vault: vault.address,
        burnAmount: balanceArrakisV2Before,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        receiveETH: true,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };

      await vaultRouterWrapper.removeLiquidity(removeLiquidity);

      balance0After = await token0.balanceOf(walletAddress);
      balance1After = await wallet.provider?.getBalance(walletAddress);
      balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceArrakisV2Before).to.be.gt(balanceArrakisV2After);
      expect(balanceArrakisV2After).to.equal(ethers.constants.Zero);

      routerBalance0 = await token0.balanceOf(vaultRouter.address);
      routerBalance1 = await token1.balanceOf(vaultRouter.address);
      routerBalanceRakis = await rakisToken.balanceOf(vaultRouter.address);
      routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(routerBalance0).to.equal(ethers.constants.Zero);
      expect(routerBalance1).to.equal(ethers.constants.Zero);
      expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);

      wrapperBalance0 = await token0.balanceOf(vaultRouterWrapper.address);
      wrapperBalance1 = await token1.balanceOf(vaultRouterWrapper.address);
      wrapperBalanceRakis = await rakisToken.balanceOf(
        vaultRouterWrapper.address
      );
      wrapperBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouterWrapper.address
      );

      expect(wrapperBalance0).to.equal(ethers.constants.Zero);
      expect(wrapperBalance1).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceRakis).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceEth).to.equal(routerBalanceEthEnd);
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
      let balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);
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
        rebalance: false,
      };
      await vaultRouterWrapper.addLiquidity(addLiquidityData, {
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

      let routerBalance0 = await token0.balanceOf(vaultRouter.address);
      let routerBalance1 = await token1.balanceOf(vaultRouter.address);
      let routerBalanceRakis = await rakisToken.balanceOf(vaultRouter.address);
      let routerBalanceStRakis = await stRakisToken.balanceOf(
        vaultRouter.address
      );
      let routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(routerBalance0).to.equal(ethers.constants.Zero);
      expect(routerBalance1).to.equal(ethers.constants.Zero);
      expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
      expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
      expect(routerBalanceEthEnd).to.equal(routerBalanceEth);

      let wrapperBalance0 = await token0.balanceOf(vaultRouterWrapper.address);
      let wrapperBalance1 = await token1.balanceOf(vaultRouterWrapper.address);
      let wrapperBalanceRakis = await rakisToken.balanceOf(
        vaultRouterWrapper.address
      );
      let wrapperBalanceStRakis = await stRakisToken.balanceOf(
        vaultRouterWrapper.address
      );
      let wrapperBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouterWrapper.address
      );

      expect(wrapperBalance0).to.equal(ethers.constants.Zero);
      expect(wrapperBalance1).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceRakis).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceStRakis).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceEthEnd).to.equal(routerBalanceEth);

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
      balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);
      balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);
      const balanceRewardsAfter = await token0.balanceOf(walletAddress);

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceRewardsAfter).to.be.gt(balanceRewardsBefore);
      expect(balanceArrakisV2Before).to.be.eq(balanceArrakisV2After);
      expect(balanceArrakisV2After).to.equal(ethers.constants.Zero);

      routerBalance0 = await token0.balanceOf(vaultRouter.address);
      routerBalance1 = await token1.balanceOf(vaultRouter.address);
      routerBalanceRakis = await rakisToken.balanceOf(vaultRouter.address);
      routerBalanceStRakis = await stRakisToken.balanceOf(vaultRouter.address);
      routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(routerBalance0).to.equal(ethers.constants.Zero);
      expect(routerBalance1).to.equal(ethers.constants.Zero);
      expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
      expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);

      wrapperBalance0 = await token0.balanceOf(vaultRouterWrapper.address);
      wrapperBalance1 = await token1.balanceOf(vaultRouterWrapper.address);
      wrapperBalanceRakis = await rakisToken.balanceOf(
        vaultRouterWrapper.address
      );
      wrapperBalanceStRakis = await stRakisToken.balanceOf(
        vaultRouterWrapper.address
      );
      wrapperBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouterWrapper.address
      );

      expect(wrapperBalance0).to.equal(ethers.constants.Zero);
      expect(wrapperBalance1).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceRakis).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceStRakis).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceEth).to.equal(routerBalanceEthEnd);
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
        rebalance: false,
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
      let balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);
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
        rebalance: false,
      };
      await vaultRouterWrapper.addLiquidity(addLiquidityData, {
        value: transactionEthValue,
      });

      let balance0After = await token0.balanceOf(walletAddress);
      let balance1After = await wallet.provider?.getBalance(walletAddress);
      let balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);
      let wrapperEthBalanceAfter = await wallet.provider?.getBalance(
        vaultRouterWrapper.address
      );

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);
      expect(wrapperEthBalanceBefore).to.be.eq(wrapperEthBalanceAfter);

      let routerBalance0 = await token0.balanceOf(vaultRouter.address);
      let routerBalance1 = await token1.balanceOf(vaultRouter.address);
      let routerBalanceRakis = await rakisToken.balanceOf(vaultRouter.address);
      let routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(routerBalance0).to.equal(ethers.constants.Zero);
      expect(routerBalance1).to.equal(ethers.constants.Zero);
      expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);

      let wrapperBalance0 = await token0.balanceOf(vaultRouterWrapper.address);
      let wrapperBalance1 = await token1.balanceOf(vaultRouterWrapper.address);
      let wrapperBalanceRakis = await rakisToken.balanceOf(
        vaultRouterWrapper.address
      );
      const wrapperBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouterWrapper.address
      );

      expect(wrapperBalance0).to.equal(ethers.constants.Zero);
      expect(wrapperBalance1).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceRakis).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceEth).to.equal(wrapperBalanceEthEnd);

      balance0Before = balance0After;
      balance1Before = balance1After;
      balanceArrakisV2Before = balanceArrakisV2After;
      wrapperEthBalanceBefore = wrapperEthBalanceAfter;

      // removeLiquidityETH

      await rakisToken.approve(
        vaultRouterWrapper.address,
        balanceArrakisV2Before
      );
      const removeLiquidity = {
        burns: [],
        vault: vault.address,
        burnAmount: balanceArrakisV2Before,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        receiveETH: true,
        gaugeAddress: "0x0000000000000000000000000000000000000000",
      };
      await vaultRouterWrapper.removeLiquidity(removeLiquidity);
      balance0After = await token0.balanceOf(walletAddress);
      balance1After = await wallet.provider?.getBalance(walletAddress);
      balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceArrakisV2Before).to.be.gt(balanceArrakisV2After);
      expect(balanceArrakisV2After).to.equal(ethers.constants.Zero);

      routerBalance0 = await token0.balanceOf(vaultRouter.address);
      routerBalance1 = await token1.balanceOf(vaultRouter.address);
      routerBalanceRakis = await rakisToken.balanceOf(vaultRouter.address);
      routerBalanceEthEnd = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(routerBalance0).to.equal(ethers.constants.Zero);
      expect(routerBalance1).to.equal(ethers.constants.Zero);
      expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
      expect(routerBalanceEth).to.equal(routerBalanceEthEnd);

      wrapperBalance0 = await token0.balanceOf(vaultRouterWrapper.address);
      wrapperBalance1 = await token1.balanceOf(vaultRouterWrapper.address);
      wrapperBalanceRakis = await rakisToken.balanceOf(
        vaultRouterWrapper.address
      );
      wrapperEthBalanceAfter = await wallet.provider?.getBalance(
        vaultRouterWrapper.address
      );
      expect(wrapperBalance0).to.equal(ethers.constants.Zero);
      expect(wrapperBalance1).to.equal(ethers.constants.Zero);
      expect(wrapperBalanceRakis).to.equal(ethers.constants.Zero);
      expect(wrapperEthBalanceBefore).to.equal(wrapperEthBalanceAfter);
    });
  });

  describe("Swap and add liquidity tests", function () {
    it("should use A,B and swap A for B", async function () {
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

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
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

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
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("1"),
        true,
        5,
        true,
        "scenario2"
      );
    });
    it("should use A,B and swap A for B and stake using nativeETH", async function () {
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("1"),
        true,
        5,
        true,
        "scenario2",
        stRakisToken
      );
    });

    it("should use only A and swap A for B", async function () {
      // single side
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("0"),
        true,
        5,
        false,
        "scenario3"
      );
    });
    it("should use only A and swap A for B and stake", async function () {
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("0"),
        true,
        5,
        false,
        "scenario3",
        stRakisToken
      );
    });
    it("should use only A and swap A for B using native ETH", async function () {
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("0"),
        true,
        5,
        true,
        "scenario4"
      );
    });
    it("should use only A and swap A for B and stake using nativeETH", async function () {
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("0"),
        true,
        5,
        true,
        "scenario4",
        stRakisToken
      );
    });
    it("should use only A and swap A for B with different msg.value and nativeETH", async function () {
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("0"),
        true,
        5,
        true,
        "scenario4",
        stRakisToken,
        ethers.BigNumber.from("100000")
      );
    });
    it("should use A and B and revert with empty msg.value", async function () {
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("10000"),
        ethers.BigNumber.from("1"),
        true,
        5,
        false,
        "scenario5",
        stRakisToken,
        ethers.BigNumber.from("0")
      );
    });

    it("should use only B and swap B for A", async function () {
      // single side
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("0"),
        ethers.BigNumber.from("10"),
        false,
        5,
        false,
        "scenario6"
      );
    });
    it("should use only B and swap B for A and stake", async function () {
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("0"),
        ethers.BigNumber.from("10"),
        false,
        5,
        false,
        "scenario7",
        stRakisToken
      );
    });
    it("should use only B and swap B for A using native ETH", async function () {
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("0"),
        ethers.BigNumber.from("10"),
        false,
        5,
        true,
        "scenario8"
      );
    });
    it("should use only B and swap B for A and stake using nativeETH", async function () {
      await swapAndAddTest(
        wallet,
        vaultRouter,
        vaultRouterWrapper,
        resolver,

        vault,
        token0,
        token1,
        rakisToken,

        ethers.BigNumber.from("0"),
        ethers.BigNumber.from("10"),
        false,
        5,
        true,
        "scenario9",
        stRakisToken
      );
    });
  });
});
