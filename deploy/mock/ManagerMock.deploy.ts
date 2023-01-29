import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (
    hre.network.name === "mainnet" ||
    hre.network.name === "optimism" ||
    hre.network.name === "polygon" ||
    hre.network.name === "arbitrum"
  ) {
    console.log(
      `!! Deploying ArrakisV2Router to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }
  const { owner } = await getNamedAccounts();
  const { deploy } = deployments;

  await deploy("ManagerMock", {
    from: owner,
    log: hre.network.name !== "hardhat",
    gasPrice: hre.ethers.utils.parseUnits("50", "gwei"),
  });
};

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip =
    hre.network.name === "mainnet" ||
    hre.network.name === "polygon" ||
    hre.network.name === "optimism" ||
    hre.network.name === "arbitrum" ||
    hre.network.name === "goerli";
  return shouldSkip ? true : false;
};

func.tags = ["ManagerMock"];

export default func;
