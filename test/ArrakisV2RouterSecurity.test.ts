// import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import { expect } from "chai";
// import { deployments, ethers, network } from "hardhat";
// import {
//   TransparentUpgradeableProxy,
//   ArrakisV2RouterWrapper,
//   TempProxyAdmin,
// } from "../typechain/";

// let wallet: SignerWithAddress;
// let walletAddress: string;
// let owner: SignerWithAddress;

// describe("ArrakisV2RouterWrapper Security Tests", function () {
//   this.timeout(0);

//   let vaultRouterWrapper: ArrakisV2RouterWrapper;
//   let tempsProxyAdmin: TempProxyAdmin;
//   let proxy: TransparentUpgradeableProxy;

//   before(async function () {
//     await deployments.fixture();
//     console.log("after fixture");
//     [wallet, owner] = await ethers.getSigners();
//     walletAddress = await wallet.getAddress();

//     const vaultRouterWrapperAddress = (
//       await deployments.get("ArrakisV2RouterWrapper")
//     ).address;

//     vaultRouterWrapper = (await ethers.getContractAt(
//       "ArrakisV2RouterWrapper",
//       vaultRouterWrapperAddress,
//       owner
//     )) as ArrakisV2RouterWrapper;
//     console.log("after wrapper");
//     const proxyAdminAddress = (await deployments.get("TempProxyAdmin")).address;
//     console.log("proxyAdminAddress", proxyAdminAddress);
//     tempsProxyAdmin = (await ethers.getContractAt(
//       "TempProxyAdmin",
//       proxyAdminAddress,
//       wallet
//     )) as TempProxyAdmin;
//     console.log("after proxyadmin");
//     proxy = (await ethers.getContractAt(
//       "TransparentUpgradeableProxy",
//       vaultRouterWrapperAddress,
//       wallet
//     )) as TransparentUpgradeableProxy;
//     console.log("after proxy address: ", proxy.address);
//     await network.provider.send("hardhat_setBalance", [
//       await tempsProxyAdmin.getProxyAdmin(proxy.address),
//       "0x313030303030303030303030303030303030303030",
//     ]);
//     console.log("after setBalance");
//     await network.provider.send("hardhat_setBalance", [
//       walletAddress,
//       "0x313030303030303030303030303030303030303030",
//     ]);
//   });

//   it("Pause, Revocation, Ownership, Upgradeability", async function () {
//     console.log("test start");
//     const proxyOwner = await tempsProxyAdmin.getProxyAdmin(proxy.address);
//     console.log("after proxyowner");
//     await vaultRouterWrapper.pause();
//     console.log("after pause");
//     const addLiquidityData = {
//       vault: "0x0000000000000000000000000000000000000000",
//       amount0Max: 0,
//       amount1Max: 0,
//       amount0Min: 0,
//       amount1Min: 0,
//       receiver: walletAddress,
//       useETH: false,
//       gaugeAddress: "0x0000000000000000000000000000000000000000",
//       rebalance: false,
//     };

//     await expect(
//       vaultRouterWrapper.addLiquidity(addLiquidityData)
//     ).to.be.revertedWith("Pausable: paused");
//     console.log("after expect");
//     await vaultRouterWrapper.transferOwnership(walletAddress);
//     const owner = await vaultRouterWrapper.owner();
//     console.log("before other expect");
//     expect(owner).to.be.eq(walletAddress);
//     await network.provider.request({
//       method: "hardhat_impersonateAccount",
//       params: [proxyOwner],
//     });
//     console.log("after other expect");
//     const proxySigner = await ethers.provider.getSigner(proxyOwner);

//     const update = (await deployments.get("ArrakisV2Router")).address;

//     await tempsProxyAdmin.upgrade(proxy.address, update);

//     await proxy.connect(proxySigner).changeAdmin(update);
//   });
// });
