// import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import { expect } from "chai";
// import { deployments, ethers, network } from "hardhat";
// import { Addresses, getAddresses } from "../src/addresses";
// import { EIP173ProxyWithReceive } from "../typechain/EIP173ProxyWithReceive";
// import { ArrakisV2RouterWrapper } from "../typechain/ArrakisV2RouterWrapper";
// import { IVaultV2 } from "../typechain/IVaultV2";

// // let addresses: Addresses;
// let wallet: SignerWithAddress;
// let walletAddress: string;

// describe("ArrakisV1Router Security Tests", function () {
//   this.timeout(0);
//   let vault: IVaultV2;
//   let vaultRouterWrapper: ArrakisV2RouterWrapper;
//   let proxy: EIP173ProxyWithReceive;
//   before(async function () {
//     await deployments.fixture();
//     // addresses = getAddresses(network.name);

//     [wallet] = await ethers.getSigners();
//     walletAddress = await wallet.getAddress();

//     // const arrakisFactory = await ethers.getContractAt(
//     //   [
//     //     "function getDeployers() external view returns(address[] memory)",
//     //     "function getPools(address) external view returns(address[] memory)",
//     //   ],
//     //   addresses.ArrakisV1Factory
//     // );
//     // const deployers = await arrakisFactory.getDeployers();
//     // const pools = await arrakisFactory.getPools(deployers[0]);
//     // const poolAddress = pools[0];
//     // vault = (await ethers.getContractAt(
//     //   "IArrakisVaultV1",
//     //   poolAddress
//     // )) as IArrakisVaultV1;

//     const vaultRouterWrapperAddress = (
//       await deployments.get("ArrakisV2RouterWrapper")
//     ).address;

//     vaultRouterWrapper = (await ethers.getContractAt(
//       "ArrakisV2RouterWrapper",
//       vaultRouterWrapperAddress
//     )) as ArrakisV2RouterWrapper;

//     proxy = (await ethers.getContractAt(
//       "EIP173ProxyWithReceive",
//       vaultRouterWrapperAddress
//     )) as EIP173ProxyWithReceive;

//     await network.provider.send("hardhat_setBalance", [
//       await proxy.proxyAdmin(),
//       "0x313030303030303030303030303030303030303030",
//     ]);

//     await network.provider.send("hardhat_setBalance", [
//       walletAddress,
//       "0x313030303030303030303030303030303030303030",
//     ]);
//   });

//   describe("Upgradable tests", function () {
//     it("Pause, Revocation, Ownership, Upgradeability", async function () {
//       const proxyOwner = await proxy.proxyAdmin();

//       await vaultRouterWrapper.pause();

//       const addLiquidityData = {
//         vault: "0x0000000000000000000000000000000000000000",
//         amount0Max: 0,
//         amount1Max: 0,
//         amount0Min: 0,
//         amount1Min: 0,
//         receiver: walletAddress,
//         useETH: false,
//         gaugeAddress: "0x0000000000000000000000000000000000000000",
//       };

//       await expect(
//         vaultRouterWrapper.addLiquidity(addLiquidityData)
//       ).to.be.revertedWith("Pausable: paused");
//       await vaultRouterWrapper.transferOwnership(proxyOwner);
//       const owner = await vaultRouterWrapper.owner();
//       expect(owner).to.be.eq(proxyOwner);
//       await network.provider.request({
//         method: "hardhat_impersonateAccount",
//         params: [proxyOwner],
//       });
//       const proxySigner = await ethers.provider.getSigner(proxyOwner);

//       await proxy.connect(proxySigner).upgradeTo(ethers.constants.AddressZero);

//       await proxy
//         .connect(proxySigner)
//         .transferProxyAdmin(ethers.constants.AddressZero);
//     });
//   });
// });
