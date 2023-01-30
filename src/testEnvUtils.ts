import { ethers, network, deployments } from "hardhat";
import {
  ArrakisV2SwapExecutor,
  ArrakisV2Router,
  SwapResolver,
  ERC20,
  IArrakisV2,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "./addresses";
import { Contract, Signer } from "ethers";
import UniswapV3Factory from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import UniswapV3Pool from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";

const addresses: Addresses = getAddresses(network.name);

export const getPeripheryContracts = async (
  owner: Signer
): Promise<[SwapResolver, ArrakisV2SwapExecutor, ArrakisV2Router]> => {
  // getting resolver contract
  const resolverAddress = (await deployments.get("SwapResolver")).address;
  const swapResolver = (await ethers.getContractAt(
    "SwapResolver",
    resolverAddress
  )) as SwapResolver;

  // getting router executor contract
  const swapExecutorAddress = (await deployments.get("ArrakisV2SwapExecutor"))
    .address;
  const swapExecutor = (await ethers.getContractAt(
    "ArrakisV2SwapExecutor",
    swapExecutorAddress
  )) as ArrakisV2SwapExecutor;

  // getting generic router contract
  const routerAddress = (await deployments.get("ArrakisV2Router")).address;
  const router = (await ethers.getContractAt(
    "ArrakisV2Router",
    routerAddress
  )) as ArrakisV2Router;

  // updating router's swap executor
  await router.connect(owner).updateSwapExecutor(swapExecutor.address);

  return [swapResolver, swapExecutor, router];
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
): Promise<[IArrakisV2]> => {
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
    "IArrakisV2",
    result?.vault,
    signer
  )) as IArrakisV2;

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
