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
  const { deployer, hardhatOwner } = await getNamedAccounts();
  const addresses = getAddresses(hre.network.name);

  const arrakisV2Resolver = await deployments.get("ArrakisV2Resolver");

  // TODO: add correct addresses in args here
  if (hre.network.name == "hardhat")
    await deploy("ArrakisV2RouterWrapper", {
      from: deployer,
      proxy: {
        proxyContract: "OpenZeppelinTransparentProxy",
        viaAdminContract: {
          name: "TempProxyAdmin",
        },
        execute: {
          methodName: "initialize",
          args: [hardhatOwner],
        },
      },
      args: [addresses.WETH, arrakisV2Resolver.address],
      log: hre.network.name !== "hardhat",
      // gasPrice: hre.ethers.utils.parseUnits("50", "gwei"),
    });
  else
    await deploy("ArrakisV2RouterWrapper", {
      from: deployer,
      proxy: {
        proxyContract: "OpenZeppelinTransparentProxy",
        viaAdminContract: addresses.ArrakisDevAdmin,
        execute: {
          init: {
            methodName: "initialize",
            args: [addresses.ArrakisDevOwner],
          },
        },
      },
      args: [addresses.WETH, arrakisV2Resolver.address],
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

func.dependencies = ["ArrakisV2Resolver", "TempProxyAdmin"];

export default func;
