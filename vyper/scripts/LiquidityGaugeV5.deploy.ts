import { ethers, network } from "hardhat";
import Gauge from "../build/contracts/LiquidityGaugeV5.json";

const deploy = async () => {
  if (
    network.name === "mainnet" ||
    network.name === "polygon" ||
    network.name === "optimism" ||
    network.name === "arbitrum"
  ) {
    console.log(
      `Deploying Vyper LiquidityGaugeV5 to ${network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }
  const [signer] = await ethers.getSigners();
  const gaugeImplFactory = ethers.ContractFactory.fromSolidity(Gauge);
  const gaugeImpl = await gaugeImplFactory
    .connect(signer)
    .deploy({ gasLimit: 6000000 });
  console.log("GAUGE V5 IMPLEMENTATION DEPLOYED:", gaugeImpl.address);
};

(async () => {
  await deploy();
})();
