import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import { Addresses, getAddresses } from "../src/addresses";
import { EIP173ProxyWithReceive } from "../typechain/EIP173ProxyWithReceive";
import { ArrakisV1RouterBlacklist } from "../typechain/ArrakisV1RouterBlacklist";
import { IArrakisVaultV1 } from "../typechain/IArrakisVaultV1";

let addresses: Addresses;
let wallet: SignerWithAddress;
let walletAddress: string;

describe("ArrakisV1 Router (with Blacklist): Security Tests", function () {
  this.timeout(0);
  let vault: IArrakisVaultV1;
  let vaultRouter: ArrakisV1RouterBlacklist;
  let proxy: EIP173ProxyWithReceive;
  before(async function () {
    await deployments.fixture();
    addresses = getAddresses(network.name);

    [wallet] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    const arrakisFactory = await ethers.getContractAt(
      [
        "function getDeployers() external view returns(address[] memory)",
        "function getPools(address) external view returns(address[] memory)",
      ],
      addresses.ArrakisV1Factory
    );
    const deployers = await arrakisFactory.getDeployers();
    const pools = await arrakisFactory.getPools(deployers[0]);
    const poolAddress = pools[0];
    vault = (await ethers.getContractAt(
      "IArrakisVaultV1",
      poolAddress
    )) as IArrakisVaultV1;

    const vaultRouterAddress = (
      await deployments.get("ArrakisV1RouterBlacklist")
    ).address;

    vaultRouter = (await ethers.getContractAt(
      "ArrakisV1RouterBlacklist",
      vaultRouterAddress
    )) as ArrakisV1RouterBlacklist;

    proxy = (await ethers.getContractAt(
      "EIP173ProxyWithReceive",
      vaultRouterAddress
    )) as EIP173ProxyWithReceive;

    await network.provider.send("hardhat_setBalance", [
      await proxy.proxyAdmin(),
      "0x313030303030303030303030303030303030303030",
    ]);

    await network.provider.send("hardhat_setBalance", [
      walletAddress,
      "0x313030303030303030303030303030303030303030",
    ]);

    const token1Address = await vault.token0();
    const token1 = await ethers.getContractAt("IERC20", token1Address);
    await token1.connect(wallet).approve(addresses.BlacklistedRouter, 10000);
  });

  describe("Upgradable tests", function () {
    it("Pause, Revocation, Ownership, Upgradeability", async function () {
      const proxyOwner = await proxy.proxyAdmin();

      await expect(
        vaultRouter
          .connect(wallet)
          .addLiquidity(vault.address, 0, 0, 0, 0, walletAddress)
      ).to.be.revertedWith("NEEDS REVOKE");
      await expect(
        vaultRouter.removeLiquidity(vault.address, 0, 0, 0, walletAddress)
      ).to.be.revertedWith("NEEDS REVOKE");
      await vaultRouter.pause();
      await expect(
        vaultRouter.addLiquidity(vault.address, 0, 0, 0, 0, walletAddress)
      ).to.be.revertedWith("Pausable: paused");
      await vaultRouter.transferOwnership(proxyOwner);
      const owner = await vaultRouter.owner();
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
