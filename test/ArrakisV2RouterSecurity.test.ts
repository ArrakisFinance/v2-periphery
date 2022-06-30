import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import { EIP173ProxyWithReceive, ArrakisV2RouterWrapper } from "../typechain/";

let wallet: SignerWithAddress;
let walletAddress: string;

describe("ArrakisV2RouterWrapper Security Tests", function () {
  this.timeout(0);

  let vaultRouterWrapper: ArrakisV2RouterWrapper;
  let proxy: EIP173ProxyWithReceive;
  before(async function () {
    await deployments.fixture();

    [wallet] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    const vaultRouterWrapperAddress = (
      await deployments.get("ArrakisV2RouterWrapper")
    ).address;

    vaultRouterWrapper = (await ethers.getContractAt(
      "ArrakisV2RouterWrapper",
      vaultRouterWrapperAddress
    )) as ArrakisV2RouterWrapper;

    proxy = (await ethers.getContractAt(
      "EIP173ProxyWithReceive",
      vaultRouterWrapperAddress
    )) as EIP173ProxyWithReceive;

    await network.provider.send("hardhat_setBalance", [
      await proxy.proxyAdmin(),
      "0x313030303030303030303030303030303030303030",
    ]);

    await network.provider.send("hardhat_setBalance", [
      walletAddress,
      "0x313030303030303030303030303030303030303030",
    ]);
  });

  describe("Upgradable tests", function () {
    it("Pause, Revocation, Ownership, Upgradeability", async function () {
      const proxyOwner = await proxy.proxyAdmin();

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
      };

      await expect(
        vaultRouterWrapper.addLiquidity(addLiquidityData)
      ).to.be.revertedWith("Pausable: paused");
      await vaultRouterWrapper.transferOwnership(proxyOwner);
      const owner = await vaultRouterWrapper.owner();
      expect(owner).to.be.eq(proxyOwner);
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [proxyOwner],
      });
      const proxySigner = await ethers.provider.getSigner(proxyOwner);

      await proxy.connect(proxySigner).upgradeTo(ethers.constants.AddressZero);

      await proxy
        .connect(proxySigner)
        .transferProxyAdmin(ethers.constants.AddressZero);
    });
  });
});
