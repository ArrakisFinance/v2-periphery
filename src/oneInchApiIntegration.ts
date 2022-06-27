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
        `https://api.1inch.io/v4.0/${networkId}/swap?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}&fromAddress=${fromAddress}&slippage=${slippage}&disableEstimate=true&allowPartialFill=false&protocols=UNISWAP_V2`
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
        `https://api.1inch.io/v4.0/${networkId}/quote?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}&protocols=UNISWAP_V2`
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
  "0xAbDDAfB225e10B90D798bB8A886238Fb835e2053": {
    // use A,B and swap A for B + use A,B and swap A for B and stake
    scenario1: {
      swapIn: "1848075258604769953925",
      swapOut: "1841470497",
      payload:
        "0x2e95b6c80000000000000000000000006b175474e89094c44da98b954eedeac495271d0f0000000000000000000000000000000000000000000000642f32402dbd7ac885000000000000000000000000000000000000000000000000000000006845adec0000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000003b6d0340ae461ca67b15dc8dc81ce7615e0320da1a9ab8d5cfee7c08",
    },

    // use A,B and swap B for A + use A,B and swap B for A and stake
    scenario2: {
      swapIn: "7152021949",
      swapOut: "7133497642501280506078",
      payload:
        "0x2e95b6c8000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000001aa4b31bd00000000000000000000000000000000000000000000016f5f4eeb6a96866c060000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000180000000000000003b6d0340ae461ca67b15dc8dc81ce7615e0320da1a9ab8d5cfee7c08",
    },

    // use only A, swap A for B + use only A, swap A for B and stake
    scenario3: {
      swapIn: "259151912834101875000",
      swapOut: "258233245",
      payload:
        "0x2e95b6c80000000000000000000000006b175474e89094c44da98b954eedeac495271d0f00000000000000000000000000000000000000000000000e0c748bad4ba31138000000000000000000000000000000000000000000000000000000000e9f4f6e0000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000003b6d0340ae461ca67b15dc8dc81ce7615e0320da1a9ab8d5cfee7c08",
    },

    // use only B, swap B for A + use only B, swap B for A and stake
    scenario4: {
      swapIn: "741054440",
      swapOut: "739221768198475351635",
      payload:
        "0x2e95b6c8000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000002c2b97e800000000000000000000000000000000000000000000002611d31f87f8f5b9350000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000180000000000000003b6d0340ae461ca67b15dc8dc81ce7615e0320da1a9ab8d5cfee7c08",
    },
  },
  "USDC/WETH": {
    // use A,B and swap A for B + (... and stake) + (... with native ETH) + (... with native ETH and stake)
    scenario1: {
      swapIn: "9983580511",
      swapOut: "5235085527190800873",
      payload:
        "0x2e95b6c8000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000025311595f0000000000000000000000000000000000000000000000004504d26c3c257c9d0000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000003b6d0340b4e16d0168e52d35cacd2c6185b44281ec28c9dccfee7c08",
    },

    // use only A, swap A for B + (... and stake) + (... with native ETH) + (... with native ETH and stake)
    scenario2: {
      swapIn: "9986210283",
      swapOut: "5236464330592196481",
      payload:
        "0x2e95b6c8000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000002533979eb000000000000000000000000000000000000000000000000450979bc88c103200000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000003b6d0340b4e16d0168e52d35cacd2c6185b44281ec28c9dccfee7c08",
    },
  },
  "0xF920baf4fF3e803244C680FFdd468677f50C07B7": {
    // same swap on all scenarios
    scenario1: {
      swapIn: "10000000000",
      swapOut: "5243695698734024152",
      payload:
        "0x2e95b6c8000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000002540be4000000000000000000000000000000000000000000000000004521e1c86d9ef8c00000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000003b6d0340b4e16d0168e52d35cacd2c6185b44281ec28c9dccfee7c08",
    },
  },
  "0xd14c67985F88368F66E71AD73ce97890F6636cdd": {
    // same swap for all scenarios
    scenario1: {
      swapIn: "10000000000000000000",
      swapOut: "18949515731",
      payload:
        "0x2e95b6c8000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000008ac7230489e8000000000000000000000000000000000000000000000000000000000004310154880000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000180000000000000003b6d0340b4e16d0168e52d35cacd2c6185b44281ec28c9dccfee7c08",
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
