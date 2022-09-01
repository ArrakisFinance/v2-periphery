import { deployments, getNamedAccounts, ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import ArrakisV2 from "../deployJSON/ArrakisV2.json";
import { getLinkedByteCode } from "../src/modifyByteCode";
import { getAddresses } from "../src/addresses";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const addresses = getAddresses(hre.network.name);

  const libraries = {
    Pool: (await ethers.getContract("Pool")).address,
    Twap: (await ethers.getContract("Twap")).address,
    Underlying: (await ethers.getContract("Underlying")).address,
    UniswapV3Amounts: (await ethers.getContract("UniswapV3Amounts")).address,
  };

  const byteCode = getLinkedByteCode(
    ArrakisV2.bytecode,
    ArrakisV2.linkReferences,
    libraries
  );

  await deploy("ArrakisV2", {
    from: deployer,
    contract: {
      abi: ArrakisV2.abi,
      bytecode: byteCode,
    },
    args: [addresses.UniswapV3Factory, deployer],
    libraries: libraries,
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
func.tags = ["ArrakisV2"];
func.dependencies = ["Pool", "Twap", "Underlying", "UniswapV3Amounts"];
