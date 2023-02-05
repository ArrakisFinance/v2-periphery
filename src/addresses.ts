/* eslint-disable @typescript-eslint/naming-convention */
export interface Addresses {
  UniswapV3Factory: string;
  ArrakisV2: string;
  ArrakisV2Resolver: string;
  ArrakisV2Helper: string;
  ArrakisV2Factory: string;
  OneInchRouter: string;
  SwapRouter: string;
  DAI: string;
  USDC: string;
  WETH: string;
  faucetDai: string;
  faucetUSDC: string;
  faucetWeth: string;
}

export const getAddresses = (network: string): Addresses => {
  switch (network) {
    case "hardhat":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2: "0xAf0f96e8702cB1b8160e43c8c020C608cD7B134d",
        ArrakisV2Resolver: "0xb11bb8ad710579Cc5ED16b1C8587808109c1f193",
        ArrakisV2Helper: "0x07d2CeB4869DFE17e8D48c92A71eDC3AE564449f",
        ArrakisV2Factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
        OneInchRouter: "0x1111111254EEB25477B68fb85Ed929f73A960582",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        faucetDai: "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8",
        faucetUSDC: "0x0a59649758aa4d66e25f08dd01271e891fe52199",
        faucetWeth: "0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e",
      };
    case "mainnet":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2: "0xAf0f96e8702cB1b8160e43c8c020C608cD7B134d",
        ArrakisV2Resolver: "0xb11bb8ad710579Cc5ED16b1C8587808109c1f193",
        ArrakisV2Helper: "0x07d2CeB4869DFE17e8D48c92A71eDC3AE564449f",
        ArrakisV2Factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
        OneInchRouter: "0x1111111254EEB25477B68fb85Ed929f73A960582",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        faucetDai: "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8",
        faucetUSDC: "0x0a59649758aa4d66e25f08dd01271e891fe52199",
        faucetWeth: "0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e",
      };
    case "polygon":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2: "0xAf0f96e8702cB1b8160e43c8c020C608cD7B134d",
        ArrakisV2Resolver: "0xb11bb8ad710579Cc5ED16b1C8587808109c1f193",
        ArrakisV2Helper: "0x07d2CeB4869DFE17e8D48c92A71eDC3AE564449f",
        ArrakisV2Factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
        OneInchRouter: "",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", /// IMPORTANT: must be WMATIC
        DAI: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
        USDC: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
        faucetDai: "0x27F8D03b3a2196956ED754baDc28D73be8830A6e",
        faucetUSDC: "0x1a13F4Ca1d028320A707D99520AbFefca3998b7F",
        faucetWeth: "0x28424507fefb6f7f8e9d3860f56504e4e5f5f390",
      };
    case "optimism":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2: "0xAf0f96e8702cB1b8160e43c8c020C608cD7B134d",
        ArrakisV2Resolver: "0xb11bb8ad710579Cc5ED16b1C8587808109c1f193",
        ArrakisV2Helper: "0x07d2CeB4869DFE17e8D48c92A71eDC3AE564449f",
        ArrakisV2Factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
        OneInchRouter: "",
        SwapRouter: "",
        WETH: "0x4200000000000000000000000000000000000006",
        DAI: "",
        USDC: "",
        faucetDai: "",
        faucetUSDC: "",
        faucetWeth: "",
      };
    case "arbitrum":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2: "0xAf0f96e8702cB1b8160e43c8c020C608cD7B134d",
        ArrakisV2Resolver: "0xb11bb8ad710579Cc5ED16b1C8587808109c1f193",
        ArrakisV2Helper: "0x07d2CeB4869DFE17e8D48c92A71eDC3AE564449f",
        ArrakisV2Factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
        OneInchRouter: "",
        SwapRouter: "",
        WETH: "",
        DAI: "",
        USDC: "",
        faucetDai: "",
        faucetUSDC: "",
        faucetWeth: "",
      };
    case "local":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2: "0xAf0f96e8702cB1b8160e43c8c020C608cD7B134d",
        ArrakisV2Resolver: "0xb11bb8ad710579Cc5ED16b1C8587808109c1f193",
        ArrakisV2Helper: "0x07d2CeB4869DFE17e8D48c92A71eDC3AE564449f",
        ArrakisV2Factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
        OneInchRouter: "0x1111111254fb6c44bac0bed2854e76f90643097d",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        faucetDai: "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8",
        faucetUSDC: "0x0a59649758aa4d66e25f08dd01271e891fe52199",
        faucetWeth: "0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e",
      };
    default:
      throw new Error(`No addresses for Network: ${network}`);
  }
};
