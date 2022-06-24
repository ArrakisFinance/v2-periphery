import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import { IERC20, IVaultV2 } from "../typechain";
// import { ERC20 } from "../typechain/ERC20";
// import { ArrakisV2Router } from "../typechain/ArrakisV2Router";
// import { ArrakisV2RouterWrapper } from "../typechain/ArrakisV2RouterWrapper";
// import { IUniswapV3Pool } from "../typechain/IUniswapV3Pool";
// import { ArrakisV2Resolver } from "../typechain/ArrakisV2Resolver";
// import { IUniswapV3Factory } from "../typechain/IUniswapV3Factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";

import { BigNumber, Contract, ContractTransaction } from "ethers";

let addresses: Addresses;

describe("ArrakisV1Router tests", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  before(async function () {
    // TODO: hardhat-deploy is disabled while v2-core is not live
    await deployments.fixture();

    [wallet] = await ethers.getSigners();
    const walletAddress = await wallet.getAddress();

    addresses = getAddresses(network.name);
  });

  describe("deposits through ArrakisV1Router", function () {
    it("should deposit funds with addLiquidity", async function () {
      console.log("just a test");
    });
  });
});
