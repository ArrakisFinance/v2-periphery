// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {InitializePayload} from "../structs/SVaultV2.sol";

interface IVaultV2Factory {
    event VaultCreated(address indexed manager, address indexed vault);

    event InitFactory(address implementation);

    event UpdateVaultImplementation(
        address previousImplementation,
        address newImplementation
    );

    function initialize(address implementation_, address _owner_) external;

    function deployVault(InitializePayload calldata params_)
        external
        returns (address vault);

    // #region view functions

    function version() external view returns (string memory);

    function vaultImplementation() external view returns (address);

    function deployer() external view returns (address);

    function index() external view returns (uint256);

    function numVaultsByDeployer(address deployer_)
        external
        view
        returns (uint256);

    function getVaultsByDeployer(address deployer_)
        external
        view
        returns (address[] memory);

    // #endregion view functions
}
