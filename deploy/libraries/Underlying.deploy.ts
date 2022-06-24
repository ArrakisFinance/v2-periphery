import { deployments, getNamedAccounts, ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import Underlying from "../../src/v2-core/libraries/Underlying.json";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const positionAddress = (await ethers.getContract("Position")).address;
  console.log("positionAddress:", positionAddress);

  await deploy("Underlying", {
    from: deployer,
    contract: {
      abi: Underlying.abi,
      bytecode: Underlying.bytecode,
      deployedBytecode: Underlying.deployedBytecode,
    },
    libraries: {
      Position: (await ethers.getContract("Position")).address,
      UniswapV3Amounts: (await ethers.getContract("UniswapV3Amounts")).address,
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
func.tags = ["Underlying"];
func.dependencies = ["Position", "UniswapV3Amounts"];
