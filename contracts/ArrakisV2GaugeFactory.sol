// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    BeaconProxy
} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {
    TransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {
    ArrakisV2GaugeFactoryStorage,
    EnumerableSet
} from "./abstract/ArrakisV2GaugeFactoryStorage.sol";
import {InitializeGauge} from "./structs/SArrakisV2GaugeFactory.sol";
import {IGauge} from "./interfaces/IGauge.sol";

/// @title ArrakisV2GaugeFactory factory for creating LiquidityGaugeV5 instances
contract ArrakisV2GaugeFactory is ArrakisV2GaugeFactoryStorage {
    using EnumerableSet for EnumerableSet.AddressSet;

    constructor(address gaugeBeacon_)
        ArrakisV2GaugeFactoryStorage(gaugeBeacon_)
    {} // solhint-disable-line no-empty-blocks

    /// @notice Deploys an instance of LiquidityGaugeV5 using BeaconProxy or TransparentProxy.
    /// @param params_ contains all data needed to create an instance of LiquidityGaugeV5.
    /// @param isBeacon_ boolean, if true the instance will be BeaconProxy or TransparentProxy.
    /// @return gauge the address of the LiquidityGaugeV5 instance created.
    function deployGauge(InitializeGauge calldata params_, bool isBeacon_)
        external
        returns (address gauge)
    {
        gauge = _deploy(params_.stakingToken, isBeacon_);
        IGauge(gauge).add_reward(
            params_.rewardToken,
            params_.rewardDistributor,
            params_.rewardVE,
            params_.rewardVEBoost
        );
        _gauges.add(gauge);
        emit GaugeCreated(msg.sender, gauge);
    }

    /// @notice add reward token to a gauge
    /// @param gauge_ address of Gauge to add reward to
    /// @param token_ address of reward token
    /// @param distributor_ address of distributor of token_ to gauge
    /// @param ve_ address of token_ "voting escrow" (pass address(0) if not ve)
    /// @param boost_ address of token_ "veBoost" (pass address(0) if not ve)
    /// @notice only owner can call
    function addGaugeReward(
        IGauge gauge_,
        address token_,
        address distributor_,
        address ve_,
        address boost_
    ) external onlyOwner {
        uint256 len = gauge_.reward_count();
        for (uint256 i; i < len; i++) {
            require(gauge_.reward_tokens(i) != token_, "AE");
        }
        gauge_.add_reward(token_, distributor_, ve_, boost_);
    }

    /// @notice set reward distributor of a Gauge reward token
    /// @param gauge_ address of Gauge to set distributor of
    /// @param token_ address of reward token to set distributor of
    /// @param distributor_ address of new reward distributor
    /// @notice only owner can call
    function setGaugeRewardDistributor(
        IGauge gauge_,
        address token_,
        address distributor_
    ) external onlyOwner {
        gauge_.set_reward_distributor(token_, distributor_);
    }

    /// @notice set reward voting escrow of a Gauge reward token
    /// @param gauge_ address of Gauge to set voting escrow of
    /// @param token_ address of reward token to set voting escrow of
    /// @param ve_ address of new reward voting escrow
    /// @param boost_ address of new reward voting escrow delegation proxy
    /// @notice only owner can call
    function setGaugeRewardVotingEscrow(
        IGauge gauge_,
        address token_,
        address ve_,
        address boost_
    ) external onlyOwner {
        gauge_.set_reward_voting_escrow(token_, ve_, boost_);
    }

    // #region public external view functions.

    /// @notice get a list of vaults created by this factory
    /// @param startIndex_ start index
    /// @param endIndex_ end index
    /// @return list of all created gauges.
    function gauges(uint256 startIndex_, uint256 endIndex_)
        external
        view
        returns (address[] memory)
    {
        require(
            startIndex_ < endIndex_,
            "start index is equal or greater than end index."
        );
        require(
            endIndex_ <= numGauges(),
            "end index is greater than gauges array length"
        );
        address[] memory vs = new address[](endIndex_ - startIndex_);
        for (uint256 i = startIndex_; i < endIndex_; i++) {
            vs[i] = _gauges.at(i);
        }

        return vs;
    }

    /// @notice numGauges counts the total number of gauges in existence
    /// @return result total number of gauges deployed
    function numGauges() public view returns (uint256 result) {
        return _gauges.length();
    }

    // #endregion public external view functions.

    // #region internal functions

    function _deploy(address stakingToken_, bool isBeacon_)
        internal
        returns (address gauge)
    {
        bytes memory data = abi.encodeWithSelector(
            IGauge.initialize.selector,
            stakingToken_,
            address(this)
        );

        bytes32 salt = keccak256(
            abi.encodePacked(tx.origin, block.number, data)
        );

        gauge = isBeacon_
            ? address(
                new BeaconProxy{salt: salt}(address(arrakisGaugeBeacon), data)
            )
            : address(
                new TransparentUpgradeableProxy{salt: salt}(
                    arrakisGaugeBeacon.implementation(),
                    address(this),
                    data
                )
            );
    }

    // #endregion internal functions
}
