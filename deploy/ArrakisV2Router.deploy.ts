import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getAddresses } from "../src/addresses";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (
    hre.network.name === "mainnet" ||
    hre.network.name === "optimism" ||
    hre.network.name === "polygon"
  ) {
    console.log(
      `!! Deploying ArrakisV2Router to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const { deploy } = deployments;
  const { arrakisDaoOwner } = await getNamedAccounts();
  const addresses = getAddresses(hre.network.name);

  const arrakisV2RouterWrapper = await deployments.get(
    "ArrakisV2RouterWrapper"
  );

  // TODO: update resolver address in params below
  await deploy("ArrakisV2Router", {
    from: arrakisDaoOwner,
    args: [
      addresses.WETH,
      arrakisV2RouterWrapper.address,
      addresses.ArrakisV2Resolver,
    ],
    log: hre.network.name !== "hardhat",
    gasPrice: hre.ethers.utils.parseUnits("50", "gwei"),
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

func.tags = ["ArrakisV2Router"];

func.dependencies = ["ArrakisV2RouterWrapper"];

export default func;
