// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    IArrakisV2Beacon
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Beacon.sol";
import {
    ITransparentUpgradeableProxy
} from "@arrakisfi/v2-core/contracts/interfaces/ITransparentUpgradeableProxy.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    EnumerableSet
} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title Arrakis Factory Storage Smart Contract
// solhint-disable-next-line max-states-count
abstract contract ArrakisV2GaugeFactoryStorage is OwnableUpgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;

    IArrakisV2Beacon public immutable arrakisGaugeBeacon;
    EnumerableSet.AddressSet internal _gauges;

    event InitFactory(address owner);
    event GaugeCreated(address deployer, address gauge);

    // #region constructor.

    constructor(address gaugeBeacon_) {
        arrakisGaugeBeacon = IArrakisV2Beacon(gaugeBeacon_);
    }

    // #endregion constructor.

    function initialize(address _owner_) external initializer {
        require(_owner_ != address(0), "owner is address zero");
        _transferOwnership(_owner_);
        emit InitFactory(_owner_);
    }

    // #region admin set functions
    /// @notice upgrade gauges instance using transparent proxy
    /// with the current implementation
    /// @param gauges_ the list of gauge.
    /// @dev only callable by owner
    function upgradeGauges(address[] memory gauges_) external onlyOwner {
        address implementation = arrakisGaugeBeacon.implementation();
        require(implementation != address(0), "implementation is address zero");
        for (uint256 i = 0; i < gauges_.length; i++) {
            ITransparentUpgradeableProxy(gauges_[i]).upgradeTo(implementation);
        }
    }

    /// @notice upgrade gauges instance using transparent proxy
    /// with the current implementation and call the instance
    /// @param gauges_ the list of gauge.
    /// @param datas_ payloads of instances call.
    /// @dev only callable by owner
    function upgradeGaugesAndCall(
        address[] memory gauges_,
        bytes[] calldata datas_
    ) external onlyOwner {
        address implementation = arrakisGaugeBeacon.implementation();
        require(implementation != address(0), "implementation is address zero");
        require(gauges_.length == datas_.length, "mismatching array length");
        for (uint256 i = 0; i < gauges_.length; i++) {
            ITransparentUpgradeableProxy(gauges_[i]).upgradeToAndCall(
                implementation,
                datas_[i]
            );
        }
    }

    /// @notice make the gauge immutable
    /// @param gauges_ the list of gauge.
    /// @dev only callable by owner
    function makeGaugesImmutable(address[] memory gauges_) external onlyOwner {
        for (uint256 i = 0; i < gauges_.length; i++) {
            ITransparentUpgradeableProxy(gauges_[i]).changeAdmin(address(1));
        }
    }

    // #endregion admin set functions

    // #region admin view call.

    /// @notice get gauge instance admin
    /// @param proxy instance of Arrakis V2.
    /// @return admin address of Arrakis V2 instance admin.
    function getProxyAdmin(address proxy) external view returns (address) {
        // We need to manually run the static call since the getter cannot be flagged as view
        // bytes4(keccak256("admin()")) == 0xf851a440
        (bool success, bytes memory returndata) = proxy.staticcall(
            hex"f851a440"
        );
        require(success, "PA");
        return abi.decode(returndata, (address));
    }

    /// @notice get gauge implementation
    /// @param proxy instance of Arrakis V2.
    /// @return implementation address of Arrakis V2 implementation.
    function getProxyImplementation(address proxy)
        external
        view
        returns (address)
    {
        // We need to manually run the static call since the getter cannot be flagged as view
        // bytes4(keccak256("implementation()")) == 0x5c60da1b
        (bool success, bytes memory returndata) = proxy.staticcall(
            hex"5c60da1b"
        );
        require(success, "PI");
        return abi.decode(returndata, (address));
    }

    // #endregion admin view call.
}
