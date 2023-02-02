// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    LiquidityAmounts
} from "@arrakisfi/v3-lib-0.8/contracts/LiquidityAmounts.sol";
import {TickMath} from "@arrakisfi/v3-lib-0.8/contracts/TickMath.sol";
import {
    IUniswapV3Pool
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
import {
    PositionLiquidity,
    InitializePayload,
    Rebalance
} from "@arrakisfi/v2-core/contracts/structs/SArrakisV2.sol";
import {InitializeStatic} from "./structs/SArrakisV2StaticDeployer.sol";
import {SetStaticVault} from "./structs/SStaticManager.sol";
import {InitializeGauge} from "./structs/SArrakisV2GaugeFactory.sol";
import {
    ArrakisV2StaticDeployerStorage
} from "./abstract/ArrakisV2StaticDeployerStorage.sol";

contract ArrakisV2StaticDeployer is ArrakisV2StaticDeployerStorage {
    using SafeERC20 for IERC20;

    constructor(
        address uniswapFactory_,
        address arrakisFactory_,
        address gaugeFactory_,
        address staticManager_
    )
        ArrakisV2StaticDeployerStorage(
            uniswapFactory_,
            arrakisFactory_,
            gaugeFactory_,
            staticManager_
        )
    {} // solhint-disable-line no-empty-blocks

    // solhint-disable-next-line function-max-lines
    function deployStaticVault(InitializeStatic calldata params_)
        external
        whenNotPaused
        returns (address vault, address gauge)
    {
        (uint256 init0, uint256 init1) = _getInits(
            params_.positions,
            params_.token0,
            params_.token1
        );

        require(
            init0 >= params_.minDeposit0 && init1 >= params_.minDeposit1,
            "slippage"
        );

        vault = arrakisFactory.deployVault(
            InitializePayload({
                feeTiers: params_.feeTiers,
                token0: params_.token0,
                token1: params_.token1,
                owner: address(this),
                init0: init0,
                init1: init1,
                manager: address(this),
                routers: new address[](0)
            }),
            true
        );

        IERC20(params_.token0).safeApprove(vault, init0);
        IERC20(params_.token0).safeApprove(vault, init1);
        IArrakisV2(vault).mint(1 ether, params_.receiver);

        Rebalance memory rebalance;
        rebalance.mints = params_.positions;
        IArrakisV2(vault).rebalance(rebalance);

        IArrakisV2(vault).setManager(address(staticManager));

        staticManager.setStaticVault(
            SetStaticVault({
                vault: vault,
                twapDeviation: params_.twapDeviation,
                twapDuration: params_.twapDuration,
                compoundEnabled: params_.compoundEnabled
            })
        );

        if (params_.hasGauge) {
            gauge = gaugeFactory.deployGauge(
                InitializeGauge({
                    stakingToken: vault,
                    rewardToken: params_.rewardToken,
                    rewardDistributor: params_.rewardDistributor,
                    rewardVE: params_.rewardVE,
                    rewardVEBoost: params_.rewardVEBoost
                })
            );
        }

        IArrakisV2(vault).renounceOwnership();

        emit CreateStaticVault(vault, gauge, msg.sender, init0, init1);
    }

    function managerFeeBPS() external view returns (uint16) {
        return staticManager.managerFeeBPS();
    }

    function _getInits(
        PositionLiquidity[] memory positions_,
        address token0_,
        address token1_
    ) internal view returns (uint256 init0, uint256 init1) {
        for (uint256 i; i < positions_.length; i++) {
            address pool = uniswapFactory.getPool(
                token0_,
                token1_,
                positions_[i].range.feeTier
            );
            (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();
            (uint256 in0, uint256 in1) = LiquidityAmounts
                .getAmountsForLiquidity(
                    sqrtPriceX96,
                    TickMath.getSqrtRatioAtTick(positions_[i].range.lowerTick),
                    TickMath.getSqrtRatioAtTick(positions_[i].range.upperTick),
                    positions_[i].liquidity
                );
            init0 += in0;
            init1 += in1;
        }
    }
}
