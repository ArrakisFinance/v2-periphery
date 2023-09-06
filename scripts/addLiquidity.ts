import hre, { ethers, getNamedAccounts } from "hardhat";
import { getAddresses } from "../src/addresses";
import { abi as ERC_20 } from "@openzeppelin/contracts/build/contracts/ERC20.json";

const ARRAKIS_V2_ROUTER = "0x6aC8Bab8B775a03b8B72B2940251432442f61B94";

const vaultAddress = "0x5ee3148bfC8B449B9E565178927b1A6028adc49A";

const amountMax0 = ethers.utils.parseUnits("0.025", 18).div(2);
const amountMax1 = "25000000";

// #region tokens approve.

const token0Address = "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb";
const token1Address = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607";

// #endregion tokens approve.

async function main() {
  const addresses = getAddresses(hre.network.name);

  const { minter } = await getNamedAccounts();
  const signer = await ethers.getSigner(minter);

  // #region contract initialization.

  const arrakisV2Resolver = await ethers.getContractAt(
    "ArrakisV2Resolver",
    addresses.ArrakisV2Resolver,
    signer
  );
  const arrakisV2Router = await ethers.getContractAt(
    "ArrakisV2Router",
    ARRAKIS_V2_ROUTER,
    signer
  );

  const token0 = await ethers.getContractAt(ERC_20, token0Address, signer);
  const token1 = await ethers.getContractAt(ERC_20, token1Address, signer);
  const vault = await ethers.getContractAt(ERC_20, vaultAddress, signer);
  // #endregion contract initialization.

  // #region get mint data.

  const getMintAmountsResult =
    await arrakisV2Resolver.callStatic.getMintAmounts(
      vaultAddress,
      amountMax0,
      amountMax1
    );

  // #endregion get mint data.

  // #region balances.

  const balance0 = await token0.balanceOf(minter);
  console.log("Balance 0 : ", balance0.toString());
  const balance1 = await token1.balanceOf(minter);
  console.log("Balance 1 : ", balance1.toString());

  // #endregion balances.

  // #region approve actions.

  await token0.approve(arrakisV2Router.address, getMintAmountsResult.amount0);
  console.log("approved token 0");
  await token1.approve(arrakisV2Router.address, getMintAmountsResult.amount1);
  console.log("approved token 1");

  // #endregion approve actions.

  // #region add liquidity.

  const addLiquidityData = {
    amount0Max: getMintAmountsResult.amount0,
    amount1Max: getMintAmountsResult.amount1,
    amount0Min: 0,
    amount1Min: 0,
    amountSharesMin: getMintAmountsResult.mintAmount,
    vault: vaultAddress,
    receiver: minter,
    gauge: ethers.constants.AddressZero,
  };

  await arrakisV2Router.addLiquidity(addLiquidityData);

  // #endregion add liquidity.

  console.log("Vault balance : ", await vault.balanceOf(minter));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
