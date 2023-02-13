/* eslint-disable @typescript-eslint/naming-convention */
import { getAddresses as getCoreAddresses } from "@arrakisfi/v2-core";

export interface Addresses {
  UniswapV3Factory: string;
  ArrakisV2Resolver: string;
  ArrakisV2Helper: string;
  ArrakisV2Factory: string;
  GaugeImplementation: string;
  OneInchRouter: string;
  SwapRouter: string;
  DAI: string;
  USDC: string;
  WETH: string;
  faucetDai: string;
  faucetUSDC: string;
  faucetWeth: string;
  CRV: string;
  veCRV: string;
  veCRVBoost: string;
}

export const getAddresses = (network: string): Addresses => {
  const coreAddresses =
    network == "local" || network == "hardhat"
      ? getCoreAddresses("mainnet")
      : getCoreAddresses(network);
  switch (network) {
    case "hardhat":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "0x1111111254EEB25477B68fb85Ed929f73A960582",
        OneInchRouter: "0x1111111254EEB25477B68fb85Ed929f73A960582",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        faucetDai: "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8",
        faucetUSDC: "0x0a59649758aa4d66e25f08dd01271e891fe52199",
        faucetWeth: "0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e",
        CRV: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        veCRV: "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2",
        veCRVBoost: "0x8E0c00ed546602fD9927DF742bbAbF726D5B0d16",
      };
    case "mainnet":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "",
        OneInchRouter: "0x1111111254EEB25477B68fb85Ed929f73A960582",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        faucetDai: "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8",
        faucetUSDC: "0x0a59649758aa4d66e25f08dd01271e891fe52199",
        faucetWeth: "0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e",
        CRV: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        veCRV: "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2",
        veCRVBoost: "0x8E0c00ed546602fD9927DF742bbAbF726D5B0d16",
      };
    case "polygon":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "",
        OneInchRouter: "",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // IMPORTANT: must be WMATIC
        DAI: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
        USDC: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
        faucetDai: "0x27F8D03b3a2196956ED754baDc28D73be8830A6e",
        faucetUSDC: "0x1a13F4Ca1d028320A707D99520AbFefca3998b7F",
        faucetWeth: "0x28424507fefb6f7f8e9d3860f56504e4e5f5f390",
        CRV: "",
        veCRV: "",
        veCRVBoost: "",
      };
    case "optimism":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "",
        OneInchRouter: "",
        SwapRouter: "",
        WETH: "0x4200000000000000000000000000000000000006",
        DAI: "",
        USDC: "",
        faucetDai: "",
        faucetUSDC: "",
        faucetWeth: "",
        CRV: "",
        veCRV: "",
        veCRVBoost: "",
      };
    case "arbitrum":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "",
        OneInchRouter: "",
        SwapRouter: "",
        WETH: "",
        DAI: "",
        USDC: "",
        faucetDai: "",
        faucetUSDC: "",
        faucetWeth: "",
        CRV: "",
        veCRV: "",
        veCRVBoost: "",
      };
    case "local":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "",
        OneInchRouter: "0x1111111254fb6c44bac0bed2854e76f90643097d",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        faucetDai: "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8",
        faucetUSDC: "0x0a59649758aa4d66e25f08dd01271e891fe52199",
        faucetWeth: "0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e",
        CRV: "",
        veCRV: "",
        veCRVBoost: "",
      };
    default:
      throw new Error(`No addresses for Network: ${network}`);
  }
};
