import { deployments, getNamedAccounts, ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // values from USDC/WETH pool on 24/6/22
  await deploy("MockVaultV2", {
    from: deployer,
    args: [
      ethers.BigNumber.from("639282782"),
      ethers.BigNumber.from("242759266677049373758"),
      ethers.BigNumber.from("24895685535618490"),
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    ],
    log: hre.network.name != "hardhat" ? true : false,
  });
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip =
    hre.network.name === "mainnet" ||
    hre.network.name === "polygon" ||
    hre.network.name === "goerli" ||
    hre.network.name === "optimism";
  return shouldSkip ? true : false;
};
func.tags = ["MockVaultV2"];
