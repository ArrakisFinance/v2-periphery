import { deployments, getNamedAccounts, ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import VaultV2Helper from "../deployJSON/VaultV2Helper.json";
import { getLinkedByteCode } from "../src/modifyByteCode";
import { getAddresses } from "../src/addresses";
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const addresses = getAddresses(hre.network.name);

  const libraries = {
    Underlying: (await ethers.getContract("Underlying")).address,
  };
  // console.log("position address: ", libraries.Position);
  const byteCode = getLinkedByteCode(
    VaultV2Helper.bytecode,
    VaultV2Helper.linkReferences,
    libraries
  );

  await deploy("VaultV2Helper", {
    from: deployer,
    contract: {
      abi: VaultV2Helper.abi,
      bytecode: byteCode,
    },
    args: [addresses.UniswapV3Factory],
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
func.tags = ["VaultV2Helper"];
func.dependencies = ["Position", "Underlying"];
