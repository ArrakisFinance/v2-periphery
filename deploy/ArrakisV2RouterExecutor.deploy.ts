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
      `!! Deploying ArrakisV2RouterExecutor to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const { deploy } = deployments;
  const { owner } = await getNamedAccounts();
  const addresses = getAddresses(hre.network.name);

  const arrakisV2GenericRouter = await deployments.get(
    "ArrakisV2GenericRouter"
  );

  // TODO: update resolver address in params below
  await deploy("ArrakisV2RouterExecutor", {
    from: owner,
    args: [
      addresses.WETH,
      arrakisV2GenericRouter.address,
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

func.tags = ["ArrakisV2RouterExecutor"];

func.dependencies = ["ArrakisV2GenericRouter"];

export default func;
