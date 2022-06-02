import fetch from "node-fetch";

const approveTokenData = async (
  networkId: string,
  tokenAddress: string,
  amount: string
): Promise<{ to: string; data: string }> => {
  try {
    const apiResponse = (await (
      await fetch(
        `https://api.1inch.io/v4.0/${networkId}/approve/transaction?amount=${amount}&tokenAddress=${tokenAddress}`
      )
    ).json()) as unknown as {
      data: string;
      gasPrice: string;
      to: string;
      value: string;
    };

    return {
      to: apiResponse.to,
      data: apiResponse.data,
    };
  } catch (error) {
    console.log(
      `1Inch approve data call failed, for ${amount} amount of ${tokenAddress}. Error : ${error}`
    );
    throw new Error(`approveTokenData: 1Inch approve data call failed.`);
  }
};

const swapTokenData = async (
  networkId: string,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  fromAddress: string,
  slippage: string
): Promise<{ to: string; data: string }> => {
  try {
    const apiResponse = (await (
      await fetch(
        `https://api.1inch.io/v4.0/${networkId}/swap?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}&fromAddress=${fromAddress}&slippage=${slippage}&disableEstimate=true&allowPartialFill=false&protocols=UNISWAP_V1,UNISWAP_V2,SUSHI,MOONISWAP,BALANCER,COMPOUND,CURVE,CURVE_V2_SPELL_2_ASSET,CURVE_V2_SGT_2_ASSET,CURVE_V2_THRESHOLDNETWORK_2_ASSET,CHAI,OASIS,KYBER,AAVE,IEARN,BANCOR,PMM1,CREAMSWAP,SWERVE,BLACKHOLESWAP,DODO,DODO_V2,VALUELIQUID,SHELL,DEFISWAP,SAKESWAP,LUASWAP,MINISWAP,MSTABLE,PMM2,SYNTHETIX,AAVE_V2,ST_ETH,ONE_INCH_LP,ONE_INCH_LP_1_1,LINKSWAP,S_FINANCE,PSM,POWERINDEX,PMM3,XSIGMA,CREAM_LENDING,SMOOTHY_FINANCE,SADDLE,PMM4,KYBER_DMM,BALANCER_V2,SETH_WRAPPER,CURVE_V2,CURVE_V2_EURS_2_ASSET,CURVE_V2_EURT_2_ASSET,CURVE_V2_XAUT_2_ASSET,CURVE_V2_ETH_CRV,CURVE_V2_ETH_CVX,CONVERGENCE_X,ONE_INCH_LIMIT_ORDER,ONE_INCH_LIMIT_ORDER_V2,DFX_FINANCE,FIXED_FEE_SWAP,DXSWAP,CLIPPER,SHIBASWAP,UNIFI,PSM_PAX,WSTETH,DEFI_PLAZA,FIXED_FEE_SWAP_V3,SYNTHETIX_WRAPPER,SYNAPSE,CURVE_V2_YFI_2_ASSET,CURVE_V2_ETH_PAL,POOLTOGETHER,ETH_BANCOR_V3,ELASTICSWAP,BALANCER_V2_WRAPPER`
      )
    ).json()) as unknown as {
      tx: {
        from: string;
        to: string;
        data: string;
        value: string;
        gasPrice: string;
        gas: string;
      };
    };

    return {
      to: apiResponse.tx.to,
      data: apiResponse.tx.data,
    };
  } catch (error) {
    console.log(
      `1Inch swap data call failed, wanted to swap ${amount} amount of ${fromTokenAddress} to ${toTokenAddress}, from ${fromAddress} with a slippage of ${slippage} . Error : ${error}`
    );
    throw new Error(`swapTokenData: 1Inch swap data call failed.`);
  }
};

const quote1Inch = async (
  networkId: string,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string
): Promise<string> => {
  try {
    const apiResponse = (await (
      await fetch(
        `https://api.1inch.io/v4.0/${networkId}/quote?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}&protocols=UNISWAP_V1,UNISWAP_V2,SUSHI,MOONISWAP,BALANCER,COMPOUND,CURVE,CURVE_V2_SPELL_2_ASSET,CURVE_V2_SGT_2_ASSET,CURVE_V2_THRESHOLDNETWORK_2_ASSET,CHAI,OASIS,KYBER,AAVE,IEARN,BANCOR,PMM1,CREAMSWAP,SWERVE,BLACKHOLESWAP,DODO,DODO_V2,VALUELIQUID,SHELL,DEFISWAP,SAKESWAP,LUASWAP,MINISWAP,MSTABLE,PMM2,SYNTHETIX,AAVE_V2,ST_ETH,ONE_INCH_LP,ONE_INCH_LP_1_1,LINKSWAP,S_FINANCE,PSM,POWERINDEX,PMM3,XSIGMA,CREAM_LENDING,SMOOTHY_FINANCE,SADDLE,PMM4,KYBER_DMM,BALANCER_V2,SETH_WRAPPER,CURVE_V2,CURVE_V2_EURS_2_ASSET,CURVE_V2_EURT_2_ASSET,CURVE_V2_XAUT_2_ASSET,CURVE_V2_ETH_CRV,CURVE_V2_ETH_CVX,CONVERGENCE_X,ONE_INCH_LIMIT_ORDER,ONE_INCH_LIMIT_ORDER_V2,DFX_FINANCE,FIXED_FEE_SWAP,DXSWAP,CLIPPER,SHIBASWAP,UNIFI,PSM_PAX,WSTETH,DEFI_PLAZA,FIXED_FEE_SWAP_V3,SYNTHETIX_WRAPPER,SYNAPSE,CURVE_V2_YFI_2_ASSET,CURVE_V2_ETH_PAL,POOLTOGETHER,ETH_BANCOR_V3,ELASTICSWAP,BALANCER_V2_WRAPPER`
      )
    ).json()) as unknown as {
      toTokenAmount: string;
    };

    return apiResponse.toTokenAmount;
  } catch (error) {
    console.log(
      `1Inch quote call failed, wanted to quote swap of ${amount} amount of ${fromTokenAddress} to ${toTokenAddress}. Error : ${error}`
    );
    throw new Error(`quote1Inch: 1Inch swap data call failed.`);
  }
};

export { swapTokenData, quote1Inch, approveTokenData };
