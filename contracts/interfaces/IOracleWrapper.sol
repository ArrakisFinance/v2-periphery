// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

interface IOracleWrapper {
    function getPrice0() external view returns (uint256 price0);

    function getPrice1() external view returns (uint256 price1);
}
