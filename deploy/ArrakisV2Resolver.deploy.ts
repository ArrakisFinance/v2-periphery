import { deployments, getNamedAccounts, ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Addresses, getAddresses } from "../src/addresses";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (
    hre.network.name === "mainnet" ||
    hre.network.name === "optimism" ||
    hre.network.name === "polygon"
  ) {
    console.log(
      `!! Deploying ArrakisV2Resolver to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const addresses: Addresses = getAddresses(hre.network.name);

  // TODO: add correct addresses here
  await deploy("ArrakisV2Resolver", {
    from: deployer,
    libraries: {
      Position: (await ethers.getContract("Position")).address,
      Underlying: (await ethers.getContract("Underlying")).address,
      UniswapV3Amounts: (await ethers.getContract("UniswapV3Amounts")).address,
    },
    args: [
      addresses.UniswapV3Factory,
      (await ethers.getContract("VaultV2Helper")).address,
    ],
  });
};

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip =
    hre.network.name === "mainnet" ||
    hre.network.name === "polygon" ||
    hre.network.name === "optimism" ||
    hre.network.name === "goerli";
  return shouldSkip ? true : false;
};

func.tags = ["ArrakisV2Resolver"];

func.dependencies = [
  "Underlying",
  "UniswapV3Amounts",
  "Position",
  "VaultV2Helper",
];

export default func;
