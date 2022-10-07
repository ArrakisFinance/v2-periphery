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
      `!! Deploying ArrakisV2RouterWrapper to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const { deploy } = deployments;
  const { deployer, arrakisDaoAdmin, arrakisDaoOwner } =
    await getNamedAccounts();
  const addresses = getAddresses(hre.network.name);

  await deploy("ArrakisV2RouterWrapper", {
    from: deployer,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      owner: arrakisDaoAdmin,
      execute: {
        init: {
          methodName: "initialize",
          args: [arrakisDaoOwner],
        },
      },
    },
    args: [addresses.WETH, addresses.ArrakisV2Resolver],
    log: hre.network.name !== "hardhat",
    // gasPrice: hre.ethers.utils.parseUnits("50", "gwei"),
  });
};

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip =
    hre.network.name === "mainnet" ||
    hre.network.name === "polygon" ||
    hre.network.name === "optimism" ||
    hre.network.name === "goerli";
  return shouldSkip;
};

func.tags = ["ArrakisV2RouterWrapper"];

func.dependencies = ["TempProxyAdmin"];

export default func;
