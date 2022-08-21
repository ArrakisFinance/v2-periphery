// SPDX-License-Identifier: MIT
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

interface IManagerProxy {
    // ======= EXTERNAL FUNCTIONS =======
    function fundVaultBalance(address vault) external payable;
}
