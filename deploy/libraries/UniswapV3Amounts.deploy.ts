import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import UniswapV3Amounts from "../../src/v2-core/libraries/UniswapV3Amounts.json";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  await deploy("UniswapV3Amounts", {
    from: deployer,
    contract: {
      abi: UniswapV3Amounts.abi,
      bytecode: UniswapV3Amounts.bytecode,
      deployedBytecode: UniswapV3Amounts.deployedBytecode,
    },
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
func.tags = ["UniswapV3Amounts"];
