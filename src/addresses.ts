/* eslint-disable @typescript-eslint/naming-convention */
export interface Addresses {
  UniswapV3Factory: string;
  ArrakisV2Router: string;
  ArrakisV2Resolver: string;
  ArrakisV2Factory: string;
  WETH: string;
  ArrakisDevMultiSig: string;
  ArrakisFeeTreasury: string;
  ArrakisV2UsdcWethPool: string;
  ArrakisV2agEURWethPool: string;
  OneInchRouter: string;
  DAI: string;
  USDC: string;
}

export const getAddresses = (network: string): Addresses => {
  switch (network) {
    case "hardhat":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2Router: "",
        ArrakisV2Resolver: "",
        ArrakisV2Factory: "",
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        ArrakisDevMultiSig: "0xAa2E0c5c85ACb7717e58060AB3c96d2B184EE07C",
        ArrakisFeeTreasury: "0xDEb4C33D5C3E7e32F55a9D6336FE06010E40E3AB",
        ArrakisV2UsdcWethPool: "",
        ArrakisV2agEURWethPool: "",
        OneInchRouter: "0x1111111254fb6c44bac0bed2854e76f90643097d",
        DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      };
    case "mainnet":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2Router: "0x513E0a261af2D33B46F98b81FED547608fA2a03d",
        ArrakisV2Resolver: "0x0317650Af6f184344D7368AC8bB0bEbA5EDB214a",
        ArrakisV2Factory: "0xEA1aFf9dbFfD1580F6b81A3ad3589E66652dB7D9",
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        ArrakisDevMultiSig: "0xAa2E0c5c85ACb7717e58060AB3c96d2B184EE07C",
        ArrakisFeeTreasury: "0x2FF5D1da4985113F467BBBFF015e76ce8aB05F29",
        ArrakisV2UsdcWethPool: "",
        ArrakisV2agEURWethPool: "",
        OneInchRouter: "0x1111111254fb6c44bac0bed2854e76f90643097d",
        DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      };
    case "goerli":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2Router: "0xA1B50735e644fc2a00F76363246326bCCEaD085d",
        ArrakisV2Resolver: "0x78bfb478192bEFbb0D2ae01354d1362cF54F5D93",
        ArrakisV2Factory: "0x399cFce1F3f5AB74C46d9F0361BE18f87c23FCC3",
        WETH: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
        ArrakisDevMultiSig: "0xAabB54394E8dd61Dd70897E9c80be8de7C64A895",
        ArrakisFeeTreasury: "",
        ArrakisV2UsdcWethPool: "",
        ArrakisV2agEURWethPool: "",
        OneInchRouter: "",
        DAI: "",
        USDC: "",
      };
    case "polygon":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2Router: "0x477E509B9d08862baEb8Ab69e901Ae72b13efcA0",
        ArrakisV2Resolver: "0x3638fc820c22b9ecd631943Bc7d5591C0004C7b2",
        ArrakisV2Factory: "0x37265A834e95D11c36527451c7844eF346dC342a",
        WETH: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
        ArrakisDevMultiSig: "0xAa2E0c5c85ACb7717e58060AB3c96d2B184EE07C",
        ArrakisFeeTreasury: "0xDEb4C33D5C3E7e32F55a9D6336FE06010E40E3AB",
        ArrakisV2UsdcWethPool: "",
        ArrakisV2agEURWethPool: "",
        OneInchRouter: "",
        DAI: "",
        USDC: "",
      };
    case "optimism":
      return {
        UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        ArrakisV2Router: "0xc56f04EC20dAD27c0f4701b14977C2DbE85142BA",
        ArrakisV2Resolver: "0xd2Bb190dD88e7Af5DF176064Ec42f6dfA8672F40",
        ArrakisV2Factory: "0x2845c6929d621e32B7596520C8a1E5a37e616F09",
        WETH: "0x4200000000000000000000000000000000000006",
        ArrakisDevMultiSig: "0xAa2E0c5c85ACb7717e58060AB3c96d2B184EE07C",
        ArrakisFeeTreasury: "",
        ArrakisV2UsdcWethPool: "",
        ArrakisV2agEURWethPool: "",
        OneInchRouter: "",
        DAI: "",
        USDC: "",
      };
    default:
      throw new Error(`No addresses for Network: ${network}`);
  }
};
