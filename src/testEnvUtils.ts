import { ethers, network, deployments } from "hardhat";
import {
  ArrakisV2RouterExecutor,
  ArrakisV2GenericRouter,
  SwapResolver,
  ERC20,
  ManagerMock,
  ArrakisV2,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "./addresses";
import { Contract, Signer } from "ethers";
import UniswapV3Factory from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import UniswapV3Pool from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";

const addresses: Addresses = getAddresses(network.name);

export const getPeripheryContracts = async (
  owner: Signer
): Promise<[SwapResolver, ArrakisV2RouterExecutor, ArrakisV2GenericRouter]> => {
  // getting resolver contract
  const resolverAddress = (await deployments.get("SwapResolver")).address;
  const swapResolver = (await ethers.getContractAt(
    "SwapResolver",
    resolverAddress
  )) as SwapResolver;

  // getting router executor contract
  const routerExecutorAddress = (
    await deployments.get("ArrakisV2RouterExecutor")
  ).address;
  const routerExecutor = (await ethers.getContractAt(
    "ArrakisV2RouterExecutor",
    routerExecutorAddress
  )) as ArrakisV2RouterExecutor;

  // getting generic router contract
  const genericRouterAddress = (await deployments.get("ArrakisV2GenericRouter"))
    .address;
  const genericRouter = (await ethers.getContractAt(
    "ArrakisV2GenericRouter",
    genericRouterAddress
  )) as ArrakisV2GenericRouter;

  // updating genericRouter's executor
  await genericRouter
    .connect(owner)
    .updateRouterExecutor(routerExecutor.address);

  return [swapResolver, routerExecutor, genericRouter];
};

export const getManagerMock = async (): Promise<ManagerMock> => {
  const managerAddress = (await deployments.get("ManagerMock")).address;
  const managerMock = (await ethers.getContractAt(
    "ManagerMock",
    managerAddress
  )) as ManagerMock;
  return managerMock;
};

export const getArrakisResolver = async (
  signer: SignerWithAddress
): Promise<Contract> => {
  const resolver = await ethers.getContractAt(
    "IArrakisV2Resolver",
    addresses.ArrakisV2Resolver,
    signer
  );
  return resolver;
};

export const getSwapResolver = async (): Promise<SwapResolver> => {
  const swapResolverAddress = (await deployments.get("SwapResolver")).address;
  const swapResolver = (await ethers.getContractAt(
    "SwapResolver",
    swapResolverAddress
  )) as SwapResolver;
  return swapResolver;
};

export const deployArrakisV2 = async (
  signer: SignerWithAddress,
  token0Address: string,
  token1Address: string,
  fee: number,
  resolver: Contract,
  managerAddress: string
): Promise<[ArrakisV2]> => {
  const signerAddress = await signer.getAddress();

  // getting vault factory
  const vaultV2Factory = await ethers.getContractAt(
    "IArrakisV2Factory",
    addresses.ArrakisV2Factory,
    signer
  );

  // getting uniswap factory
  const uniswapV3Factory = new ethers.Contract(
    addresses.UniswapV3Factory,
    UniswapV3Factory.abi,
    signer
  );

  // getting pool address
  const poolAddress = await uniswapV3Factory.getPool(
    token0Address,
    token1Address,
    fee
  );

  // getting uniswap pool
  const uniswapV3Pool = new ethers.Contract(
    poolAddress,
    UniswapV3Pool.abi,
    signer
  );

  // getting pool data
  const slot0 = await uniswapV3Pool.slot0();
  const tickSpacing = await uniswapV3Pool.tickSpacing();
  const lowerTick = slot0.tick - (slot0.tick % tickSpacing) - tickSpacing;
  const upperTick = slot0.tick - (slot0.tick % tickSpacing) + 2 * tickSpacing;

  // get initial amounts
  const res = await resolver.getAmountsForLiquidity(
    slot0.tick,
    lowerTick,
    upperTick,
    ethers.utils.parseUnits("1", 18)
  );

  // deploying vault
  const tx = await vaultV2Factory.deployVault(
    {
      feeTiers: [fee],
      token0: token0Address,
      token1: token1Address,
      owner: signerAddress,
      init0: res.amount0,
      init1: res.amount1,
      manager: managerAddress,
      routers: [addresses.SwapRouter],
      burnBuffer: 1000,
    },
    true
  );

  const rc = await tx.wait();
  const event = rc?.events?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event: any) => event.event === "VaultCreated"
  );
  const result = event?.args;

  // getting vault
  const vault = (await ethers.getContractAt(
    "ArrakisV2",
    result?.vault,
    signer
  )) as ArrakisV2;

  return [vault];
};

export const getFundsFromFaucet = async (
  faucetAddress: string,
  token: ERC20,
  targetAddress: string
) => {
  if (network.name === "local") {
    const provider = new ethers.providers.JsonRpcProvider(
      "http://localhost:8545"
    );
    await provider.send("hardhat_impersonateAccount", [faucetAddress]);
    await provider.send("hardhat_setBalance", [
      faucetAddress,
      "0x313030303030303030303030303030303030303030",
    ]);
    const faucetSigner = await provider.getSigner(faucetAddress);
    const faucetBalance = await token.balanceOf(faucetAddress);
    await token.connect(faucetSigner).transfer(targetAddress, faucetBalance);
  } else {
    await network.provider.send("hardhat_setBalance", [
      faucetAddress,
      "0x313030303030303030303030303030303030303030",
    ]);
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [faucetAddress],
    });
    const faucetSigner = await ethers.provider.getSigner(faucetAddress);
    await token
      .connect(faucetSigner)
      .transfer(targetAddress, await token.balanceOf(faucetAddress));

    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [faucetAddress],
    });
  }
};

export const createGauge = async (
  vaultAddress: string
): Promise<[Contract, ERC20]> => {
  const gaugeMockFactory = await ethers.getContractFactory("GaugeMock");

  const gauge = await gaugeMockFactory.deploy(vaultAddress, {
    gasLimit: 6000000,
  });

  const stRakisToken = (await ethers.getContractAt(
    "ERC20",
    gauge.address
  )) as ERC20;

  return [gauge, stRakisToken];
};
