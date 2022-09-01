import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import {
  TransparentUpgradeableProxy,
  ArrakisV2RouterWrapper,
  TempProxyAdmin,
} from "../typechain/";

let wallet: SignerWithAddress;
let walletAddress: string;
let owner: SignerWithAddress;

describe("ArrakisV2RouterWrapper Security Tests", function () {
  this.timeout(0);

  let vaultRouterWrapper: ArrakisV2RouterWrapper;
  let tempsProxyAdmin: TempProxyAdmin;
  let proxy: TransparentUpgradeableProxy;

  before(async function () {
    await deployments.fixture();

    [wallet, owner] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    const vaultRouterWrapperAddress = (
      await deployments.get("ArrakisV2RouterWrapper")
    ).address;

    vaultRouterWrapper = (await ethers.getContractAt(
      "ArrakisV2RouterWrapper",
      vaultRouterWrapperAddress,
      owner
    )) as ArrakisV2RouterWrapper;

    tempsProxyAdmin = (await ethers.getContract(
      "TempProxyAdmin",
      wallet
    )) as TempProxyAdmin;

    proxy = (await ethers.getContractAt(
      "TransparentUpgradeableProxy",
      vaultRouterWrapperAddress
    )) as TransparentUpgradeableProxy;

    await network.provider.send("hardhat_setBalance", [
      await tempsProxyAdmin.getProxyAdmin(proxy.address),
      "0x313030303030303030303030303030303030303030",
    ]);

    await network.provider.send("hardhat_setBalance", [
      walletAddress,
      "0x313030303030303030303030303030303030303030",
    ]);
  });

  it("Pause, Revocation, Ownership, Upgradeability", async function () {
    const proxyOwner = await tempsProxyAdmin.getProxyAdmin(proxy.address);

    await vaultRouterWrapper.pause();

    const addLiquidityData = {
      vault: "0x0000000000000000000000000000000000000000",
      amount0Max: 0,
      amount1Max: 0,
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      useETH: false,
      gaugeAddress: "0x0000000000000000000000000000000000000000",
      rebalance: false,
    };

    await expect(
      vaultRouterWrapper.addLiquidity(addLiquidityData)
    ).to.be.revertedWith("Pausable: paused");
    await vaultRouterWrapper.transferOwnership(walletAddress);
    const owner = await vaultRouterWrapper.owner();
    expect(owner).to.be.eq(walletAddress);
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [proxyOwner],
    });
    const proxySigner = await ethers.provider.getSigner(proxyOwner);

    const update = (await deployments.get("ArrakisV2Router")).address;

    await tempsProxyAdmin.upgrade(proxy.address, update);

    await proxy.connect(proxySigner).changeAdmin(update);
  });
});
