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
  let user2: SignerWithAddress;
  let owner: SignerWithAddress;

  let token0: ERC20; // dai
  let token1: ERC20; // weth
  let crv: ERC20;
  let vecrv: ERC20;
  let usdc: ERC20;

  let vecrvContract: Contract;

  let resolver: Contract;

  let vault: IArrakisV2;

  let gauge: IGauge;
  let stToken: ERC20;

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet, user1, user2, owner] = await ethers.getSigners();
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
    usdc = (await ethers.getContractAt("ERC20", addresses.USDC)) as ERC20;
    vecrv = (await ethers.getContractAt("ERC20", addresses.veCRV)) as ERC20;
    vecrvContract = await ethers.getContractAt(
      ["function create_lock(uint256 _value, uint256 _unlock_time) external"],
      addresses.veCRV
    );

    await getFundsFromFaucet(addresses.faucetDai, token0, walletAddress);
    await getFundsFromFaucet(addresses.faucetWeth, token1, walletAddress);
    await getFundsFromFaucet(addresses.veCRV, crv, walletAddress);
    await getFundsFromFaucet(addresses.faucetUSDC, usdc, walletAddress);

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
  it("#1 : Adds reward with boost", async function () {
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
  it("#2 : Adds reward without boost", async function () {
    const rewardCount = await gauge.reward_count();
    await gauge.add_reward(
      usdc.address,
      walletAddress,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero
    );
    const newRewardCount = await gauge.reward_count();
    expect(rewardCount.add(1)).to.be.eq(newRewardCount);

    const rewardData = await gauge.reward_data(usdc.address);
    expect(rewardData.distributor).to.be.eq(walletAddress);
    expect(rewardData.ve).to.be.eq(ethers.constants.AddressZero);
    expect(rewardData.veBoost_proxy).to.be.eq(ethers.constants.AddressZero);
  });
  it("#3 : Gets veCrv for user1", async function () {
    const userAddress = await user1.getAddress();
    const crvBalanceBefore = await crv.balanceOf(userAddress);
    expect(crvBalanceBefore).to.be.eq(0);

    const amount = ethers.utils.parseEther("100");
    await crv.transfer(userAddress, amount);

    const crvBalanceAfter = await crv.balanceOf(userAddress);
    expect(crvBalanceAfter).to.be.eq(amount);

    const veCrvBalanceBefore = await vecrv.balanceOf(userAddress);
    expect(veCrvBalanceBefore).to.be.eq(0);

    const blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    const week = 60 * 60 * 24 * 7; // in s

    await crv.connect(user1).approve(vecrvContract.address, amount);

    await vecrvContract
      .connect(user1)
      .create_lock(amount, block.timestamp + week);

    const veCrvBalanceAfter = await vecrv.balanceOf(userAddress);
    expect(veCrvBalanceAfter).to.be.gt(0);
  });
  it("#4 : Stake LP token (user1 with veCrv)", async function () {
    const userAddress = await user1.getAddress();

    const userBalance = await vault.balanceOf(userAddress);
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

    await vault.mint(mintAmount, userAddress);
    const newUserBalance = await vault.balanceOf(userAddress);

    expect(newUserBalance).to.be.gt(userBalance);

    const userStakedBalance = await stToken.balanceOf(userAddress);
    expect(userStakedBalance).to.be.eq(0);

    await vault.connect(user1).approve(gauge.address, newUserBalance);

    await gauge.connect(user1).deposit(newUserBalance, userAddress);

    const newUserStakedBalance = await stToken.balanceOf(userAddress);
    expect(newUserStakedBalance).to.be.gt(userStakedBalance);
  });
  it("#5 : Stake LP token (user2 without vecrv)", async function () {
    const userAddress = await user2.getAddress();

    const balanceVeCrvBefore = await vecrv.balanceOf(userAddress);
    expect(balanceVeCrvBefore).to.be.eq(0);

    const userBalance = await vault.balanceOf(userAddress);
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

    await vault.mint(mintAmount, userAddress);

    const newUserBalance = await vault.balanceOf(userAddress);
    expect(newUserBalance).to.be.gt(userBalance);

    const userStakedBalance = await stToken.balanceOf(userAddress);
    expect(userStakedBalance).to.be.eq(0);

    await vault.connect(user2).approve(gauge.address, newUserBalance);

    await gauge.connect(user2).deposit(newUserBalance, userAddress);

    const newUserStakedBalance = await stToken.balanceOf(userAddress);
    expect(newUserStakedBalance).to.be.gt(userStakedBalance);
  });
  it("#6 : Deposit reward tokens with boost", async function () {
    const rewardData = await gauge.reward_data(crv.address);

    const amount = ethers.utils.parseEther("10000");
    await crv.approve(gauge.address, amount);
    await gauge.connect(wallet).deposit_reward_token(crv.address, amount);

    const newRewardData = await gauge.reward_data(crv.address);
    expect(newRewardData.period_finish).to.be.gt(rewardData.period_finish);
    expect(newRewardData.last_update).to.be.gt(rewardData.last_update);
    expect(newRewardData.rate).to.be.gt(rewardData.rate);
  });
  it("#7 : Deposit reward token without boost", async function () {
    const rewardData = await gauge.reward_data(usdc.address);

    const amount = ethers.utils.parseUnits("10000", 6);
    await usdc.approve(gauge.address, amount);
    await gauge.connect(wallet).deposit_reward_token(usdc.address, amount);

    const newRewardData = await gauge.reward_data(usdc.address);
    expect(newRewardData.period_finish).to.be.gt(rewardData.period_finish);
    expect(newRewardData.last_update).to.be.gt(rewardData.last_update);
    expect(newRewardData.rate).to.be.gt(rewardData.rate);
  });
  it("#8 : Fast forward time", async function () {
    const currentBlockNumber = await ethers.provider.getBlockNumber();
    const currentBlock = await ethers.provider.getBlock(currentBlockNumber);
    const day = 60 * 60 * 24; // in s

    await network.provider.send("evm_increaseTime", [day]);
    await network.provider.send("evm_mine");

    const newBlockNumber = await ethers.provider.getBlockNumber();
    const newBlock = await ethers.provider.getBlock(newBlockNumber);

    expect(newBlock.timestamp).to.be.gt(currentBlock.timestamp);
  });
  it("#9 : Check users crv rewards", async function () {
    const user1Address = await user1.getAddress();
    const user2Address = await user2.getAddress();

    const crvRewardUser1 = await gauge.claimable_reward(
      user1Address,
      crv.address
    );

    const crvRewardUser2 = await gauge.claimable_reward(
      user2Address,
      crv.address
    );

    expect(crvRewardUser1).to.be.gt(crvRewardUser2);
  });
  it("#10 : Check users usdc rewards", async function () {
    const user1Address = await user1.getAddress();
    const user2Address = await user2.getAddress();

    const usdcRewardUser1 = await gauge.claimable_reward(
      user1Address,
      usdc.address
    );

    const usdcRewardUser2 = await gauge.claimable_reward(
      user2Address,
      usdc.address
    );

    expect(usdcRewardUser1).to.be.eq(usdcRewardUser2);
  });
  it("#11 : Claim user1 rewards", async function () {
    const userAddress = await user1.getAddress();

    const usdcBalanceBefore = await usdc.balanceOf(userAddress);
    const crvBalanceBefore = await crv.balanceOf(userAddress);

    await gauge.claim_rewards(userAddress);

    const usdcBalanceAfter = await usdc.balanceOf(userAddress);
    const crvBalanceAfter = await crv.balanceOf(userAddress);

    expect(usdcBalanceAfter).to.be.gt(usdcBalanceBefore);
    expect(crvBalanceAfter).to.be.gt(crvBalanceBefore);
  });
  it("#12 : Withdraws user1", async function () {
    const balanceBefore = await stToken.balanceOf(user1.address);

    await gauge.connect(user1).withdraw(balanceBefore.div(2));

    const balanceAfter = await stToken.balanceOf(user1.address);
    expect(balanceAfter).to.be.eq(balanceBefore.div(2));
  });
  it("#13 : Admin changes reward token proxy boost data", async function () {
    await gauge.set_reward_voting_escrow(
      crv.address,
      addresses.ArrakisV2Resolver,
      addresses.ArrakisV2Resolver
    );

    const rewardData = await gauge.reward_data(crv.address);
    expect(rewardData.distributor).to.be.eq(walletAddress);
    expect(rewardData.ve).to.be.eq(addresses.ArrakisV2Resolver);
    expect(rewardData.veBoost_proxy).to.be.eq(addresses.ArrakisV2Resolver);
  });
  it("#14 : Withdraws user1 again", async function () {
    const balanceBefore = await stToken.balanceOf(user1.address);

    await gauge.connect(user1).withdraw(balanceBefore);

    const balanceAfter = await stToken.balanceOf(user1.address);
    expect(balanceAfter).to.be.eq(0);
  });
  it("#15 : Set reward distributor", async function () {
    await gauge.set_reward_distributor(crv.address, owner.address);

    const rewardData = await gauge.reward_data(crv.address);
    expect(rewardData.distributor).to.be.eq(owner.address);
  });
  it("#16 : Revert when depositing reward token", async function () {
    const amount = ethers.utils.parseEther("10000");
    await crv.approve(gauge.address, amount);

    await expect(
      gauge.connect(wallet).deposit_reward_token(crv.address, amount)
    ).to.be.reverted;
  });
  it("#17 : Claim user2 rewards", async function () {
    const userAddress = await user2.getAddress();

    const usdcBalanceBefore = await usdc.balanceOf(userAddress);
    const crvBalanceBefore = await crv.balanceOf(userAddress);
    const token0BalanceBefore = await token0.balanceOf(userAddress);

    await gauge.claim_rewards(userAddress);

    const usdcBalanceAfter = await usdc.balanceOf(userAddress);
    const crvBalanceAfter = await crv.balanceOf(userAddress);
    const token0BalanceAfter = await token0.balanceOf(userAddress);

    expect(usdcBalanceAfter).to.be.gt(usdcBalanceBefore);
    expect(crvBalanceAfter).to.be.gt(crvBalanceBefore);
    expect(token0BalanceBefore).to.be.eq(token0BalanceAfter);
  });
  it("#18 : Revert commit transfer ownership", async function () {
    await expect(gauge.connect(owner).commit_transfer_ownership(user1.address))
      .to.be.reverted;
  });
  it("#19 : Commit transfer ownership", async function () {
    await gauge.commit_transfer_ownership(user1.address);

    const futureAdmin = await gauge.future_admin();
    const admin = await gauge.admin();

    expect(futureAdmin).to.be.eq(user1.address);
    expect(admin).to.be.eq(walletAddress);
  });
  it("#20 : Revert accept transfer ownership", async function () {
    await expect(gauge.accept_transfer_ownership()).to.be.reverted;
  });
  it("#21 : Accept transfer ownership", async function () {
    await gauge.connect(user1).accept_transfer_ownership();

    const admin = await gauge.admin();
    expect(admin).to.be.eq(user1.address);
  });
});
