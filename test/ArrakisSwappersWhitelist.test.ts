// import { expect } from "chai";
// import { deployments, ethers, network } from "hardhat";
// import { ArrakisSwappersWhitelist } from "../typechain/ArrakisSwappersWhitelist";
// import { Addresses, getAddresses } from "../src/addresses";

// let addresses: Addresses;

// describe("ArrakisSwappersWhitelist tests", function () {
//   this.timeout(0);
//   let swappersWhitelist: ArrakisSwappersWhitelist;
//   let oneInchAddress: string;
//   before(async function () {
//     await deployments.fixture();

//     addresses = getAddresses(network.name);
//     oneInchAddress = addresses.OneInchRouter;

//     const swappersWhitelistAddress = (
//       await deployments.get("ArrakisSwappersWhitelist")
//     ).address;

//     swappersWhitelist = (await ethers.getContractAt(
//       "ArrakisSwappersWhitelist",
//       swappersWhitelistAddress
//     )) as ArrakisSwappersWhitelist;
//   });

//   it("should add, verify and remove address from whitelist", async function () {
//     let isWhitelisted = await swappersWhitelist.verify(oneInchAddress);
//     expect(isWhitelisted).to.be.false;

//     await swappersWhitelist.addToWhitelist(oneInchAddress);
//     isWhitelisted = await swappersWhitelist.verify(oneInchAddress);
//     expect(isWhitelisted).to.be.true;

//     await expect(
//       swappersWhitelist.addToWhitelist(oneInchAddress)
//     ).to.be.revertedWith("This address is already whitelisted!");

//     await swappersWhitelist.removeFromWhitelist(oneInchAddress);

//     isWhitelisted = await swappersWhitelist.verify(oneInchAddress);
//     expect(isWhitelisted).to.be.false;

//     await expect(
//       swappersWhitelist.removeFromWhitelist(oneInchAddress)
//     ).to.be.revertedWith("This address is not in whitelisted!");
//   });
// });
