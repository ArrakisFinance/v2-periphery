/* eslint-disable @typescript-eslint/naming-convention */
export interface Addresses {
  UniswapV3Factory: string;
  ArrakisV2: string;
  ArrakisV2Resolver: string;
  ArrakisV2Helper: string;
  ArrakisV2Factory: string;
  ArrakisDevAdmin: string;
  ArrakisDevOwner: string;
  ArrakisFeeTreasury: string;
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
        ArrakisV2: "0xb5C3B286dD591282Fe87Dfab0613488e1b6B09Ba",
        ArrakisV2Resolver: "0x4bc385b1dDf0121CC40A0715CfD3beFE52f905f5",
        ArrakisV2Helper: "0xccEe73eA4c7a42491c68FEa78B1BDDD1A35C8d9C",
        ArrakisV2Factory: "0x055B6d3919042Be29C5F044A55529933e1273A88",
        ArrakisDevAdmin: "",
        ArrakisDevOwner: "0xAa2E0c5c85ACb7717e58060AB3c96d2B184EE07C",
        ArrakisFeeTreasury: "0x2FF5D1da4985113F467BBBFF015e76ce8aB05F29",
        OneInchRouter: "0x1111111254fb6c44bac0bed2854e76f90643097d",
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
        ArrakisV2: "0xb5C3B286dD591282Fe87Dfab0613488e1b6B09Ba",
        ArrakisV2Resolver: "0x4bc385b1dDf0121CC40A0715CfD3beFE52f905f5",
        ArrakisV2Helper: "0xccEe73eA4c7a42491c68FEa78B1BDDD1A35C8d9C",
        ArrakisV2Factory: "0x055B6d3919042Be29C5F044A55529933e1273A88",
        ArrakisDevAdmin: "",
        ArrakisDevOwner: "0xAa2E0c5c85ACb7717e58060AB3c96d2B184EE07C",
        ArrakisFeeTreasury: "0x2FF5D1da4985113F467BBBFF015e76ce8aB05F29",
        OneInchRouter: "0x1111111254fb6c44bac0bed2854e76f90643097d",
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
        ArrakisV2: "0xd481437282B488abC9c6971e59f0737f391EBd17",
        ArrakisV2Resolver: "0x475BD9BF87d3B0580BE8BDD0CDBcF0c2B4865fF9",
        ArrakisV2Helper: "0x5B84571bf47E60FB35C467C65887aA853265bFeF",
        ArrakisV2Factory: "0xAA8af27C661618825C58b93Ea40d55bAcd005D25",
        ArrakisDevAdmin: "",
        ArrakisDevOwner: "0xAa2E0c5c85ACb7717e58060AB3c96d2B184EE07C",
        ArrakisFeeTreasury: "0xDEb4C33D5C3E7e32F55a9D6336FE06010E40E3AB",
        OneInchRouter: "",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
        DAI: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
        USDC: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
        faucetDai: "0x27F8D03b3a2196956ED754baDc28D73be8830A6e",
        faucetUSDC: "0x1a13F4Ca1d028320A707D99520AbFefca3998b7F",
        faucetWeth: "0x28424507fefb6f7f8e9d3860f56504e4e5f5f390",
      };
    case "optimism":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2: "",
        ArrakisV2Resolver: "0xd2Bb190dD88e7Af5DF176064Ec42f6dfA8672F40",
        ArrakisV2Helper: "",
        ArrakisV2Factory: "0x2845c6929d621e32B7596520C8a1E5a37e616F09",
        ArrakisDevAdmin: "",
        ArrakisDevOwner: "0xAa2E0c5c85ACb7717e58060AB3c96d2B184EE07C",
        ArrakisFeeTreasury: "",
        OneInchRouter: "",
        SwapRouter: "",
        WETH: "0x4200000000000000000000000000000000000006",
        DAI: "",
        USDC: "",
        faucetDai: "",
        faucetUSDC: "",
        faucetWeth: "",
      };
    case "local":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2: "0xb5C3B286dD591282Fe87Dfab0613488e1b6B09Ba",
        ArrakisV2Resolver: "0x4bc385b1dDf0121CC40A0715CfD3beFE52f905f5",
        ArrakisV2Helper: "0xccEe73eA4c7a42491c68FEa78B1BDDD1A35C8d9C",
        ArrakisV2Factory: "0x055B6d3919042Be29C5F044A55529933e1273A88",
        ArrakisDevAdmin: "",
        ArrakisDevOwner: "0xAa2E0c5c85ACb7717e58060AB3c96d2B184EE07C",
        ArrakisFeeTreasury: "0x2FF5D1da4985113F467BBBFF015e76ce8aB05F29",
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
