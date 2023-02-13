import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import { ERC20, IArrakisV2, IGauge } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";
import { Contract } from "ethers";
import {
  deployArrakisV2,
  getFundsFromFaucet,
  getArrakisResolver,
  createGauge,
} from "../src/testEnvUtils";

let addresses: Addresses;

describe("LiquidityGauge tests", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let walletAddress: string;

  let user1: SignerWithAddress;
  let owner: SignerWithAddress;

  let token0: ERC20;
  let token1: ERC20;
  let crv: ERC20;

  let resolver: Contract;

  let vault: IArrakisV2;

  let gauge: IGauge;
  let stToken: ERC20;

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet, user1, owner] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    resolver = await getArrakisResolver(owner);

    [vault] = await deployArrakisV2(
      wallet,
      addresses.DAI,
      addresses.WETH,
      3000,
      resolver,
      walletAddress
    );

    token0 = (await ethers.getContractAt(
      "ERC20",
      await vault.token0()
    )) as ERC20;
    token1 = (await ethers.getContractAt(
      "ERC20",
      await vault.token1()
    )) as ERC20;
    crv = (await ethers.getContractAt("ERC20", addresses.CRV)) as ERC20;

    await getFundsFromFaucet(addresses.faucetDai, token0, walletAddress);
    await getFundsFromFaucet(addresses.faucetWeth, token1, walletAddress);
    await getFundsFromFaucet(addresses.veCRV, crv, walletAddress);

    [gauge, stToken] = await createGauge(vault.address, wallet, owner.address);
  });
  it("#0 : check gauge init", async function () {
    const stakedTokenAddress = await gauge.staking_token();
    expect(stakedTokenAddress).to.be.eq(vault.address);

    const vaultSymbol = await vault.symbol();

    const gaugeName = await gauge.name();
    expect(gaugeName).to.be.eq(`${vaultSymbol} Spice Harvester`);

    const gaugeSymbol = await gauge.symbol();
    expect(gaugeSymbol).to.be.eq(`st${vaultSymbol}`);

    const gaugeDecimals = await gauge.decimals();
    const vaultDecimals = await vault.decimals();
    expect(gaugeDecimals).to.be.eq(vaultDecimals);
  });
  it("#1 : Adds reward", async function () {
    const rewardCount = await gauge.reward_count();
    await gauge.add_reward(
      crv.address,
      walletAddress,
      addresses.veCRV,
      addresses.veCRVBoost
    );
    const newRewardCount = await gauge.reward_count();
    expect(rewardCount.add(1)).to.be.eq(newRewardCount);

    const rewardData = await gauge.reward_data(crv.address);
    expect(rewardData.distributor).to.be.eq(walletAddress);
    expect(rewardData.ve).to.be.eq(addresses.veCRV);
    expect(rewardData.veBoost_proxy).to.be.eq(addresses.veCRVBoost);
  });
  it("#2 : Deposit reward token", async function () {
    const rewardData = await gauge.reward_data(crv.address);

    const amount = ethers.utils.parseEther("10000");
    await crv.approve(gauge.address, amount);
    await gauge.connect(wallet).deposit_reward_token(crv.address, amount);

    const newRewardData = await gauge.reward_data(crv.address);
    expect(newRewardData.period_finish).to.be.gt(rewardData.period_finish);
    expect(newRewardData.last_update).to.be.gt(rewardData.last_update);
    expect(newRewardData.rate).to.be.gt(rewardData.rate);
  });
  it("#3 : Stake LP token", async function () {
    const user1Address = await user1.getAddress();

    const userBalance = await vault.balanceOf(user1Address);
    expect(userBalance).to.be.eq(0);

    const amount0In = ethers.utils.parseEther("1600");
    const amount1In = ethers.utils.parseEther("1");

    await token0.approve(vault.address, amount0In);
    await token1.approve(vault.address, amount1In);

    const { mintAmount } = await resolver.getMintAmounts(
      vault.address,
      amount0In,
      amount1In
    );

    await vault.mint(mintAmount, user1Address);

    const newUserBalance = await vault.balanceOf(user1Address);
    expect(newUserBalance).to.be.gt(userBalance);

    const userStakedBalance = await stToken.balanceOf(user1Address);
    expect(userStakedBalance).to.be.eq(0);

    await vault.connect(user1).approve(gauge.address, userStakedBalance);

    await gauge.connect(user1).deposit(newUserBalance, user1Address);

    const newUserStakedBalance = await stToken.balanceOf(user1Address);
    expect(newUserStakedBalance).to.be.gt(userStakedBalance);
  });
});
