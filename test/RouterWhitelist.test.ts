import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import {
  ArrakisV2RouterExecutor,
  ArrakisV2GenericRouter,
  ERC20,
  ManagerMock,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";
import { Contract } from "ethers";
import {
  getPeripheryContracts,
  deployArrakisV2,
  getFundsFromFaucet,
  getArrakisResolver,
  getManagerMock,
} from "../src/testUtils";

let addresses: Addresses;

describe("Router whitelist", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let walletAddress: string;

  let owner: SignerWithAddress;

  let token0: ERC20;
  let token1: ERC20;

  let resolver: Contract;
  let genericRouter: ArrakisV2GenericRouter;
  let routerExecutor: ArrakisV2RouterExecutor;
  let manager: ManagerMock;

  let vault: Contract;

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);

    [wallet, , owner] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    [, routerExecutor, genericRouter] = await getPeripheryContracts(owner);

    manager = await getManagerMock();

    resolver = await getArrakisResolver(owner);

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

    await getFundsFromFaucet(addresses.faucetDai, token0, walletAddress);
    await getFundsFromFaucet(addresses.faucetWeth, token1, walletAddress);
  });

  it("#0 : should revert because router is not whitelisted", async function () {
    const amount0In = ethers.utils.parseEther("10");
    const amount1In = ethers.utils.parseEther("10000");

    await token0.connect(wallet).approve(genericRouter.address, amount0In);
    await token1.connect(wallet).approve(genericRouter.address, amount1In);

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

    await expect(
      genericRouter.addLiquidity(addLiquidityData)
    ).to.be.revertedWith("W");
  });

  it("#1 : should not revert because router is whitelisted", async function () {
    await routerExecutor.connect(owner).whitelistRouter(genericRouter.address);

    const amount0In = ethers.utils.parseEther("10");
    const amount1In = ethers.utils.parseEther("10000");

    await token0.connect(wallet).approve(genericRouter.address, amount0In);
    await token1.connect(wallet).approve(genericRouter.address, amount1In);

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

    await expect(genericRouter.addLiquidity(addLiquidityData)).to.not.be
      .reverted;
  });

  it("#2: should revert because router is already whitelisted", async function () {
    await expect(
      routerExecutor.connect(owner).whitelistRouter(genericRouter.address)
    ).to.be.revertedWith("RW");
  });

  it("#3: should revert because router was removed from whitelist", async function () {
    await routerExecutor.connect(owner).removeRouter(genericRouter.address);

    const amount0In = ethers.utils.parseEther("10");
    const amount1In = ethers.utils.parseEther("10000");

    await token0.connect(wallet).approve(genericRouter.address, amount0In);
    await token1.connect(wallet).approve(genericRouter.address, amount1In);

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

    await expect(
      genericRouter.addLiquidity(addLiquidityData)
    ).to.be.revertedWith("W");
  });

  it("#4: should revert because router is not whitelisted", async function () {
    await expect(
      routerExecutor.connect(owner).removeRouter(genericRouter.address)
    ).to.be.revertedWith("NW");
  });
});
