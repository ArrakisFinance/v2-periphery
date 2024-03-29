import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getAddresses } from "../../src/addresses";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (
    hre.network.name === "mainnet" ||
    hre.network.name === "polygon" ||
    hre.network.name === "goerli" ||
    hre.network.name === "optimism" ||
    hre.network.name === "arbitrum" ||
    hre.network.name === "binance" ||
    hre.network.name === "base" ||
    hre.network.name === "base_goerli" ||
    hre.network.name === "sepolia"
  ) {
    console.log(
      `Deploying ArrakisV2 to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const addresses = getAddresses(hre.network.name);
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  await deploy("ArrakisV2", {
    from: deployer,
    args: [addresses.UniswapV3Factory],
    libraries: {
      Pool: (await deployments.get("Pool")).address,
      Position: (await deployments.get("Position")).address,
      Underlying: (await deployments.get("Underlying")).address,
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
    hre.network.name === "optimism" ||
    hre.network.name === "arbitrum" ||
    hre.network.name === "binance" ||
    hre.network.name === "base" ||
    hre.network.name === "base_goerli" ||
    hre.network.name === "sepolia";
  return shouldSkip ? true : false;
};
func.tags = ["ArrakisV2"];
func.dependencies = ["Pool", "Position", "Underlying"];
