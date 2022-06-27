import { deployments, getNamedAccounts, ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import Underlying from "../../deployJSON/Underlying.json";
import { getLinkedByteCode } from "../../src/modifyByteCode";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const libraries = {
    Position: (await ethers.getContract("Position")).address,
    UniswapV3Amounts: (await ethers.getContract("UniswapV3Amounts")).address,
  };
  const byteCode = getLinkedByteCode(
    Underlying.bytecode,
    Underlying.linkReferences,
    libraries
  );

  await deploy("Underlying", {
    from: deployer,
    contract: {
      abi: Underlying.abi,
      bytecode: byteCode,
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
