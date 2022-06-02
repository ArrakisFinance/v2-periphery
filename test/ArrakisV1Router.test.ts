import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import {
  IERC20,
  ArrakisV1Router,
  IArrakisVaultV1,
  IUniswapV3Pool,
  ArrakisV1Resolver,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";

let addresses: Addresses;

const X96 = ethers.BigNumber.from("2").pow("96");
const WAD = ethers.BigNumber.from("10").pow("18");

describe("ArrakisV1 Router tests", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let token0: IERC20;
  let token1: IERC20;
  let rakisToken: IERC20;
  let vault: IArrakisVaultV1;
  let vaultRouter: ArrakisV1Router;
  let pool: IUniswapV3Pool;
  let resolver: ArrakisV1Resolver;
  let decimals0: number;
  let decimals1: number;
  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet] = await ethers.getSigners();

    const faucet = "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7";

    await network.provider.send("hardhat_setBalance", [
      faucet,
      "0x313030303030303030303030303030303030303030",
    ]);
    const arrakisFactory = await ethers.getContractAt(
      [
        "function getDeployers() external view returns(address[] memory)",
        "function getPools(address) external view returns(address[] memory)",
      ],
      addresses.ArrakisV1Factory
    );
    const deployers = await arrakisFactory.getDeployers();
    const pools = await arrakisFactory.getPools(deployers[0]);
    const poolAddress = pools[0];
    vault = (await ethers.getContractAt(
      "IArrakisVaultV1",
      poolAddress
    )) as IArrakisVaultV1;
    token0 = (await ethers.getContractAt(
      "IERC20",
      await vault.token0()
    )) as IERC20;
    token1 = (await ethers.getContractAt(
      "IERC20",
      await vault.token1()
    )) as IERC20;
    rakisToken = (await ethers.getContractAt("IERC20", poolAddress)) as IERC20;

    pool = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await vault.pool()
    )) as IUniswapV3Pool;

    const vaultRouterAddress = (await deployments.get("ArrakisV1Router"))
      .address;

    vaultRouter = (await ethers.getContractAt(
      "ArrakisV1Router",
      vaultRouterAddress
    )) as ArrakisV1Router;

    const resolverAddress = (await deployments.get("ArrakisV1Resolver"))
      .address;

    resolver = (await ethers.getContractAt(
      "ArrakisV1Resolver",
      resolverAddress
    )) as ArrakisV1Resolver;

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [faucet],
    });
    const faucetSigner = await ethers.provider.getSigner(faucet);
    await token0
      .connect(faucetSigner)
      .transfer(await wallet.getAddress(), await token0.balanceOf(faucet));
    await token1
      .connect(faucetSigner)
      .transfer(await wallet.getAddress(), await token1.balanceOf(faucet));

    decimals0 = Number(
      await (
        await ethers.getContractAt(
          ["function decimals() external view returns(uint8)"],
          token0.address
        )
      ).decimals()
    );
    decimals1 = Number(
      await (
        await ethers.getContractAt(
          ["function decimals() external view returns(uint8)"],
          token1.address
        )
      ).decimals()
    );
  });

  describe("deposits through ArrakisV1Router", function () {
    it("should deposit funds with addLiquidity", async function () {
      await token0
        .connect(wallet)
        .approve(vaultRouter.address, ethers.utils.parseEther("1000000"));
      await token1
        .connect(wallet)
        .approve(vaultRouter.address, ethers.utils.parseEther("100000"));
      const balance0Before = await token0.balanceOf(await wallet.getAddress());
      const balance1Before = await token1.balanceOf(await wallet.getAddress());
      const balanceArrakisV1Before = await rakisToken.balanceOf(
        await wallet.getAddress()
      );

      const input0 = WAD.mul(ethers.BigNumber.from("100"));
      const input1 = "100000000";

      await vaultRouter.addLiquidity(
        vault.address,
        input0,
        input1,
        0,
        0,
        await wallet.getAddress()
      );
      const balance0After = await token0.balanceOf(await wallet.getAddress());
      const balance1After = await token1.balanceOf(await wallet.getAddress());
      const balanceArrakisV1After = await rakisToken.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV1Before).to.be.lt(balanceArrakisV1After);

      const contractBalance0 = await token0.balanceOf(vaultRouter.address);
      const contractBalance1 = await token1.balanceOf(vaultRouter.address);
      const contractBalanceG = await rakisToken.balanceOf(vaultRouter.address);

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
    });

    it("should deposit funds with rebalanceAndAddLiquidity", async function () {
      await token0
        .connect(wallet)
        .approve(vaultRouter.address, ethers.utils.parseEther("1000000"));
      await token1
        .connect(wallet)
        .approve(vaultRouter.address, ethers.utils.parseEther("100000"));
      const balance0Before = await token0.balanceOf(await wallet.getAddress());
      const balance1Before = await token1.balanceOf(await wallet.getAddress());
      const balanceArrakisV1Before = await rakisToken.balanceOf(
        await wallet.getAddress()
      );

      const input0 = WAD.mul(ethers.BigNumber.from("100"));
      const input1 = "100000000";

      const { sqrtPriceX96 } = await pool.slot0();

      const priceX96 = sqrtPriceX96.mul(sqrtPriceX96).div(X96);
      const normalized = priceX96
        .mul(ethers.BigNumber.from((10 ** decimals0).toString()))
        .mul(WAD)
        .div(ethers.BigNumber.from((10 ** decimals1).toString()))
        .div(X96);

      const { zeroForOne: isZero, swapAmount } =
        await resolver.getRebalanceParams(
          vault.address,
          input0,
          input1,
          normalized.toString()
        );

      await vaultRouter.rebalanceAndAddLiquidity(
        vault.address,
        input0,
        input1,
        isZero,
        swapAmount,
        isZero
          ? sqrtPriceX96.div(ethers.BigNumber.from("100"))
          : sqrtPriceX96.mul(ethers.BigNumber.from("100")),
        0,
        0,
        await wallet.getAddress()
      );

      const balance0After = await token0.balanceOf(await wallet.getAddress());
      const balance1After = await token1.balanceOf(await wallet.getAddress());
      const balanceArrakisV1After = await rakisToken.balanceOf(
        await wallet.getAddress()
      );
      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV1Before).to.be.lt(balanceArrakisV1After);

      const contractBalance0 = await token0.balanceOf(vaultRouter.address);
      const contractBalance1 = await token1.balanceOf(vaultRouter.address);
      const contractBalanceG = await rakisToken.balanceOf(vaultRouter.address);

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
    });
  });
  describe("withdrawal through ArrakisV1Router", function () {
    it("should withdraw funds with removeLiquidity", async function () {
      const balanceArrakisV1Before = await rakisToken.balanceOf(
        await wallet.getAddress()
      );
      expect(balanceArrakisV1Before).to.be.gt(ethers.constants.Zero);
      const balance0Before = await token0.balanceOf(await wallet.getAddress());
      const balance1Before = await token1.balanceOf(await wallet.getAddress());
      await rakisToken.approve(
        vaultRouter.address,
        ethers.utils.parseEther("100000000")
      );
      await vaultRouter.removeLiquidity(
        vault.address,
        balanceArrakisV1Before,
        0,
        0,
        await wallet.getAddress()
      );
      const balance0After = await token0.balanceOf(await wallet.getAddress());
      const balance1After = await token1.balanceOf(await wallet.getAddress());
      const balanceArrakisV1After = await rakisToken.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceArrakisV1Before).to.be.gt(balanceArrakisV1After);
    });
  });
  describe("ETH methods", function () {
    it("addLiquidityETH, rebalanceAndAddLiquidityETH, removeLiquidityETH", async function () {
      const arrakisWethVault = (await ethers.getContractAt(
        "IArrakisVaultV1",
        addresses.ArrakisV1UsdcWethPool
      )) as IArrakisVaultV1;
      const token0W = (await ethers.getContractAt(
        "IERC20",
        await arrakisWethVault.token0()
      )) as IERC20;
      const token1W = (await ethers.getContractAt(
        "IERC20",
        await arrakisWethVault.token1()
      )) as IERC20;
      const rakisTokenW = (await ethers.getContractAt(
        "IERC20",
        addresses.ArrakisV1UsdcWethPool
      )) as IERC20;
      const decimals0W = Number(
        await (
          await ethers.getContractAt(
            ["function decimals() external view returns(uint8)"],
            token0W.address
          )
        ).decimals()
      );
      const decimals1W = Number(
        await (
          await ethers.getContractAt(
            ["function decimals() external view returns(uint8)"],
            token1W.address
          )
        ).decimals()
      );

      const poolW = (await ethers.getContractAt(
        "IUniswapV3Pool",
        await arrakisWethVault.pool()
      )) as IUniswapV3Pool;

      expect(await arrakisWethVault.token1()).to.equal(addresses.WETH);

      // addLiquidityETH

      await token0W
        .connect(wallet)
        .approve(vaultRouter.address, ethers.utils.parseEther("1000000"));
      let balance0Before = await token0W.balanceOf(await wallet.getAddress());
      let balance1Before = await wallet.provider?.getBalance(
        await wallet.getAddress()
      );
      let balanceArrakisV1Before = await rakisTokenW.balanceOf(
        await wallet.getAddress()
      );

      const input0 = "100000000";
      const input1 = WAD.mul(ethers.BigNumber.from("1"));

      await vaultRouter.addLiquidityETH(
        arrakisWethVault.address,
        input0,
        input1,
        0,
        0,
        await wallet.getAddress(),
        { value: input1 }
      );

      let balance0After = await token0W.balanceOf(await wallet.getAddress());
      let balance1After = await wallet.provider?.getBalance(
        await wallet.getAddress()
      );
      let balanceArrakisV1After = await rakisTokenW.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV1Before).to.be.lt(balanceArrakisV1After);

      let contractBalance0 = await token0W.balanceOf(vaultRouter.address);
      let contractBalance1 = await token1W.balanceOf(vaultRouter.address);
      let contractBalanceG = await rakisTokenW.balanceOf(vaultRouter.address);
      let contractBalanceEth = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
      expect(contractBalanceEth).to.equal(ethers.constants.Zero);

      balance0Before = balance0After;
      balance1Before = balance1After;
      balanceArrakisV1Before = balanceArrakisV1After;

      // rebalanceAndAddLiquidityETH

      const { sqrtPriceX96 } = await poolW.slot0();

      const priceX96 = sqrtPriceX96.mul(sqrtPriceX96).div(X96);
      const normalized = priceX96
        .mul(ethers.BigNumber.from((10 ** decimals0W).toString()))
        .mul(WAD)
        .div(ethers.BigNumber.from((10 ** decimals1W).toString()))
        .div(X96);

      const { zeroForOne: isZero, swapAmount } =
        await resolver.getRebalanceParams(
          arrakisWethVault.address,
          input0,
          input1,
          normalized.toString()
        );

      await vaultRouter.rebalanceAndAddLiquidityETH(
        arrakisWethVault.address,
        input0,
        input1,
        isZero,
        swapAmount,
        isZero
          ? sqrtPriceX96.div(ethers.BigNumber.from("100"))
          : sqrtPriceX96.mul(ethers.BigNumber.from("100")),
        0,
        0,
        await wallet.getAddress(),
        { value: input1 }
      );

      balance0After = await token0W.balanceOf(await wallet.getAddress());
      balance1After = await wallet.provider?.getBalance(
        await wallet.getAddress()
      );
      balanceArrakisV1After = await rakisTokenW.balanceOf(
        await wallet.getAddress()
      );
      expect(balance0Before).to.be.gt(balance0After);
      expect(balance1Before).to.be.gt(balance1After);
      expect(balanceArrakisV1Before).to.be.lt(balanceArrakisV1After);

      contractBalance0 = await token0W.balanceOf(vaultRouter.address);
      contractBalance1 = await token1W.balanceOf(vaultRouter.address);
      contractBalanceG = await rakisTokenW.balanceOf(vaultRouter.address);
      contractBalanceEth = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
      expect(contractBalanceEth).to.equal(ethers.constants.Zero);

      balance0Before = balance0After;
      balance1Before = balance1After;
      balanceArrakisV1Before = balanceArrakisV1After;

      // removeLiquidityETH

      await rakisTokenW.approve(vaultRouter.address, balanceArrakisV1Before);
      await vaultRouter.removeLiquidityETH(
        arrakisWethVault.address,
        balanceArrakisV1Before,
        0,
        0,
        await wallet.getAddress()
      );
      balance0After = await token0.balanceOf(await wallet.getAddress());
      balance1After = await wallet.provider?.getBalance(
        await wallet.getAddress()
      );
      balanceArrakisV1After = await rakisTokenW.balanceOf(
        await wallet.getAddress()
      );

      expect(balance0After).to.be.gt(balance0Before);
      expect(balance1After).to.be.gt(balance1Before);
      expect(balanceArrakisV1Before).to.be.gt(balanceArrakisV1After);
      expect(balanceArrakisV1After).to.equal(ethers.constants.Zero);

      contractBalance0 = await token0W.balanceOf(vaultRouter.address);
      contractBalance1 = await token1W.balanceOf(vaultRouter.address);
      contractBalanceG = await rakisTokenW.balanceOf(vaultRouter.address);
      contractBalanceEth = await wallet.provider?.getBalance(
        vaultRouter.address
      );

      expect(contractBalance0).to.equal(ethers.constants.Zero);
      expect(contractBalance1).to.equal(ethers.constants.Zero);
      expect(contractBalanceG).to.equal(ethers.constants.Zero);
      expect(contractBalanceEth).to.equal(ethers.constants.Zero);
    });
  });
});
