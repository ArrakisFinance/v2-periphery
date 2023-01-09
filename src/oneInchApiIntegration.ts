import fetch from "node-fetch";

type OneInchDataType = { to: string; data: string };

const approveTokenData = async (
  networkId: string,
  tokenAddress: string,
  amount: string
): Promise<OneInchDataType> => {
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
): Promise<OneInchDataType> => {
  try {
    const apiResponse = (await (
      await fetch(
        `https://api.1inch.io/v5.0/${networkId}/swap?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}&fromAddress=${fromAddress}&slippage=${slippage}&disableEstimate=true&allowPartialFill=false`
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
        `https://api.1inch.io/v5.0/${networkId}/quote?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}`
      )
    ).json()) as unknown as {
      toTokenAmount: string;
    };

    // console.log("network : ", networkId);
    // console.log("fromTokenAddress : ", fromTokenAddress);
    // console.log("toTokenAddress : ", toTokenAddress);
    // console.log("amount : ", amount);

    return apiResponse.toTokenAmount;
  } catch (error) {
    console.log(
      `1Inch quote call failed, wanted to quote swap of ${amount} amount of ${fromTokenAddress} to ${toTokenAddress}. Error : ${error}`
    );
    throw new Error(`quote1Inch: 1Inch swap data call failed.`);
  }
};

// Because we pin a blockNumber in the tests,
// using live 1inch api often causes as the price on current vs pinned block can vary
// we store valid payloads from 1inch api for the pinned block here to be used in the tests
type MockPayloadObj = {
  swapIn: string;
  swapOut: string;
  payload: string;
};

type MockPayloadScenario = {
  [index: string]: MockPayloadObj;
};

type MockPayloads = {
  [vaultAddress: string]: MockPayloadScenario;
};
/* eslint-disable @typescript-eslint/naming-convention */
const mockPayloads: MockPayloads = {
  "DAI/WETH": {
    // depositing 100k dai and 2 weth
    scenario1: {
      swapIn: "2508820956228242206032",
      swapOut: "1897690899443769682",
      payload:
        "0xe449022e00000000000000000000000000000000000000000000008800e28762f0356d500000000000000000000000000000000000000000000000000d2af9e8c96b30a90000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000100000000000000000000000060594a405d53811d3bc4766596efd80fd545a270cfee7c08",
    },

    // depositing 10 dai and 5 weth
    scenario2: {
      swapIn: "4999600049348033740",
      swapOut: "6604349467549982051056",
      payload:
        "0xe449022e000000000000000000000000000000000000000000000000456225c1806a3ccc0000000000000000000000000000000000000000000000b302e158b2607265780000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000200000000000000000000000011b815efb8f581194ae79006d24e0d814b7697f680000000000000000000000048da0965ab2d2cbf1c17c09cfb5cbe67ad5b1406cfee7c08",
    },

    // depositing 100k dai and 0 weth
    scenario3: {
      swapIn: "5020683944969903200000",
      swapOut: "3797266781738915633",
      payload:
        "0xe449022e0000000000000000000000000000000000000000000001102bfc8739fdeed7000000000000000000000000000000000000000000000000001a594d0275782b980000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000100000000000000000000000060594a405d53811d3bc4766596efd80fd545a270cfee7c08",
    },

    // depositing 0 dai and 5 weth
    scenario4: {
      swapIn: "4999999848603233970",
      swapOut: "6601846972158757333926",
      payload:
        "0xe449022e0000000000000000000000000000000000000000000000004563915f0500aeb20000000000000000000000000000000000000000000000b2f184058c097235d30000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000180000000000000000000000060594a405d53811d3bc4766596efd80fd545a270cfee7c08",
    },
  },
  "USDC/WETH": {
    // depositing 100k usdc and 2 weth
    scenario1: {
      swapIn: "62333053854",
      swapOut: "47150918036731533351",
      payload:
        "0xe449022e0000000000000000000000000000000000000000000000000000000e8356eb9e0000000000000000000000000000000000000000000000026da206a1984b708b0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000100000000000000000000000088e6a0c2ddd26feeb64f039a2c41296fcb3f5640cfee7c08",
    },

    // depositing 10 usdc and 5 weth
    scenario2: {
      swapIn: "4986948299687977203",
      swapOut: "6585576969",
      payload:
        "0xe449022e0000000000000000000000000000000000000000000000004535330e7c23e0f30000000000000000000000000000000000000000000000000000000174e788880000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000180000000000000000000000088e6a0c2ddd26feeb64f039a2c41296fcb3f5640cfee7c08",
    },

    // depositing 1000 usdc and 0 weth
    scenario3: {
      swapIn: "633061805",
      swapOut: "478735952490305040",
      payload:
        "0x0502b1c5000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000025bbc1ad000000000000000000000000000000000000000000000000064fc56bf5ec5b5c0000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000003b6d0340397ff1542f962076d0bfe58ea045ffa2d347aca0cfee7c08",
    },

    // depositing 0 usdc and 5 weth
    scenario4: {
      swapIn: "4999995060150237170",
      swapOut: "6602805986",
      payload:
        "0xe449022e00000000000000000000000000000000000000000000000045638d041ef677f20000000000000000000000000000000000000000000000000000000175e148560000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000180000000000000000000000088e6a0c2ddd26feeb64f039a2c41296fcb3f5640cfee7c08",
    },
  },
};

export {
  swapTokenData,
  quote1Inch,
  approveTokenData,
  mockPayloads,
  OneInchDataType,
  MockPayloads,
  MockPayloadScenario,
  MockPayloadObj,
};
