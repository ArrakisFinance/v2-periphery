// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.4;

interface IArrakisSwappersWhitelist {
    function addToWhitelist(address newAddress) external;

    function removeFromWhitelist(address oldAddress) external;

    function verify(address router) external view returns (bool whitelisted);
}
