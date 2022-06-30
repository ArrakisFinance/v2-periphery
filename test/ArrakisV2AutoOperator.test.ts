import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import {
  ArrakisV2Router,
  ArrakisV2RouterWrapper,
  ArrakisV2Resolver,
  ArrakisV2AutoOperator,
  ERC20,
  IVaultV2,
  IUniswapV3Pool,
  IUniswapV3Factory,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";
import {
  getPeripheryContracts,
  getVaultV2,
  getFundsFromFaucet,
} from "../src/testUtils";

let addresses: Addresses;

describe("ArrakisV2AutoOperator tests", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let walletAddress: string;

  let token0: ERC20;
  let token1: ERC20;
  let rakisToken: ERC20;

  let resolver: ArrakisV2Resolver;
  let vaultRouterWrapper: ArrakisV2RouterWrapper;
  let vaultRouter: ArrakisV2Router;
  let autoOperator: ArrakisV2AutoOperator;

  let vault: IVaultV2;

  let uniswapV3Factory: IUniswapV3Factory;

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [resolver, vaultRouter, vaultRouterWrapper, autoOperator] =
      await getPeripheryContracts();

    [vault] = await getVaultV2(
      wallet,
      addresses.DAI,
      addresses.WETH,
      3000,
      resolver
    );

    await vault.addOperators([autoOperator.address]);

    token0 = (await ethers.getContractAt(
      "ERC20",
      await vault.token0()
    )) as ERC20;
    token1 = (await ethers.getContractAt(
      "ERC20",
      await vault.token1()
    )) as ERC20;
    rakisToken = (await ethers.getContractAt("ERC20", vault.address)) as ERC20;

    const faucetDai = "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7";
    await getFundsFromFaucet(faucetDai, token0, walletAddress);

    const faucetWeth = "0x2f0b23f53734252bda2277357e97e1517d6b042a";
    await getFundsFromFaucet(faucetWeth, token1, walletAddress);

    // getting uniswap factory
    uniswapV3Factory = (await ethers.getContractAt(
      "IUniswapV3Factory",
      addresses.UniswapV3Factory,
      wallet
    )) as IUniswapV3Factory;
  });

  describe("ArrakisV2AutoOperator tests", function () {
    it("should add liquidity and rebalance", async function () {
      const amount0In = ethers.utils.parseEther("10000");
      const amount1In = ethers.utils.parseEther("10");

      await token0
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount0In);
      await token1
        .connect(wallet)
        .approve(vaultRouterWrapper.address, amount1In);

      const balance0Before = await token0.balanceOf(walletAddress);
      const balance1Before = await token1.balanceOf(walletAddress);
      const balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);

      const ranges = await vault.rangesArray();
      const rangesBalances = [];
      for (let eachRange = 0; eachRange < ranges.length; eachRange++) {
        // getting uniswap pool
        const uniswapV3Pool = (await ethers.getContractAt(
          "IUniswapV3Pool",
          await uniswapV3Factory.getPool(
            token0.address,
            token1.address,
            ranges[eachRange].feeTier
          ),
          wallet
        )) as IUniswapV3Pool;
        rangesBalances.push({
          balanceToken0: await token0.balanceOf(uniswapV3Pool.address),
          balanceToken1: await token1.balanceOf(uniswapV3Pool.address),
          liquidity: await uniswapV3Pool.liquidity(),
        });
      }

      const addLiquidityData = {
        vault: vault.address,
        amount0Max: amount0In,
        amount1Max: amount1In,
        amount0Min: 0,
        amount1Min: 0,
        receiver: walletAddress,
        useETH: false,
        gaugeAddress: ethers.constants.AddressZero,
        rebalance: true,
      };

      await vaultRouterWrapper.addLiquidity(addLiquidityData);

      const balance0After = await token0.balanceOf(walletAddress);
      const balance1After = await token1.balanceOf(walletAddress);
      const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);

      for (let eachRange = 0; eachRange < ranges.length; eachRange++) {
        // getting uniswap pool
        const uniswapV3Pool = (await ethers.getContractAt(
          "IUniswapV3Pool",
          await uniswapV3Factory.getPool(
            token0.address,
            token1.address,
            ranges[eachRange].feeTier
          ),
          wallet
        )) as IUniswapV3Pool;
        const balanceToken0 = await token0.balanceOf(uniswapV3Pool.address);
        const balanceToken1 = await token1.balanceOf(uniswapV3Pool.address);
        const liquidity = await uniswapV3Pool.liquidity();
        expect(balanceToken0).to.be.gt(rangesBalances[eachRange].balanceToken0);
        expect(balanceToken1).to.be.gt(rangesBalances[eachRange].balanceToken1);
        expect(liquidity).to.be.gt(rangesBalances[eachRange].liquidity);
      }
    });
    // it("should swap and add liquidity and rebalance", async function () {
    //   const ranges = await vault.rangesArray();
    //   const rangesBalances = [];
    //   for (let eachRange = 0; eachRange < ranges.length; eachRange++) {
    //     // getting uniswap pool
    //     const uniswapV3Pool = (await ethers.getContractAt(
    //       "IUniswapV3Pool",
    //       await uniswapV3Factory.getPool(
    //         token0.address,
    //         token1.address,
    //         ranges[eachRange].feeTier
    //       ),
    //       wallet
    //     )) as IUniswapV3Pool;
    //     rangesBalances.push({
    //       balanceToken0: await token0.balanceOf(uniswapV3Pool.address),
    //       balanceToken1: await token1.balanceOf(uniswapV3Pool.address),
    //       liquidity: await uniswapV3Pool.liquidity(),
    //     });
    //     console.log(
    //       "rangesBalances[eachRange].balancetoken0: ",
    //       rangesBalances[eachRange].balanceToken0.toString()
    //     );
    //     console.log(
    //       "rangesBalances[eachRange].balanceToken1: ",
    //       rangesBalances[eachRange].balanceToken1.toString()
    //     );
    //     console.log(
    //       "rangesBalances[eachRange].liquidity: ",
    //       rangesBalances[eachRange].liquidity.toString()
    //     );
    //   }
    //   await swapAndAddTest(
    //     wallet,
    //     vaultRouter,
    //     vaultRouterWrapper,
    //     resolver,

    //     vault,
    //     token0,
    //     token1,
    //     rakisToken,

    //     ethers.BigNumber.from("10000"),
    //     ethers.BigNumber.from("1"),
    //     true,
    //     5,
    //     false,
    //     "scenario1",
    //     undefined,
    //     undefined,
    //     true
    //   );

    //   for (let eachRange = 0; eachRange < ranges.length; eachRange++) {
    //     // getting uniswap pool
    //     const uniswapV3Pool = (await ethers.getContractAt(
    //       "IUniswapV3Pool",
    //       await uniswapV3Factory.getPool(
    //         token0.address,
    //         token1.address,
    //         ranges[eachRange].feeTier
    //       ),
    //       wallet
    //     )) as IUniswapV3Pool;
    //     const balanceToken0 = await token0.balanceOf(uniswapV3Pool.address);
    //     const balanceToken1 = await token1.balanceOf(uniswapV3Pool.address);
    //     const liquidity = await uniswapV3Pool.liquidity();
    //     console.log("balanceToken0 ", balanceToken0.toString());
    //     console.log("balanceToken1: ", balanceToken1.toString());
    //     console.log("liquidity: ", liquidity.toString());
    //     expect(balanceToken0).to.be.gt(rangesBalances[eachRange].balanceToken0);
    //     expect(balanceToken1).to.be.gt(rangesBalances[eachRange].balanceToken1);
    //     expect(liquidity).to.be.gt(rangesBalances[eachRange].liquidity);
    //   }
    // });
  });
});
