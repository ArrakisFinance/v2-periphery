// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    IUniswapV3Factory
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {
    IArrakisV2,
    Range,
    Rebalance
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
import {
    FullMath,
    IDecimals,
    IUniswapV3Pool,
    Twap
} from "../../libraries/Twap.sol";
import {
    hundredPercent
} from "@arrakisfi/v2-core/contracts/constants/CArrakisV2.sol";

/// @notice IMPORTANT - THIS MANAGER TEMPLATE IS ONLY "SAFE" GIVEN THE UNISWAP V3 TWAP
/// ORACLE IS DIFFICULT TO MANIPULATE - NOT TRUE FOR MANY POOLS. MANY UNISWAP POOL TWAPS
/// ARE TRIVIAL TO MANIPULATE - OR COULD BECOME SO IF/WHEN LIQUIDITY EXITS THE POOL.

/// @notice Simple ArrakisV2 Manager implementation with TWAP checks on rebalances.
/// Delegate ArrakisV2 `manager` role to this contract, so that contract owner can
/// actively manage liquidity, with checks to avoid `manager` siphoning value from vault
/// PROVIDED TWAP(s) FOR UNDERLYING POOL(s) CANNOT BE MANIPULATED (not guaranteed, see above)
contract SimpleManagerTWAP is Ownable {
    using SafeERC20 for IERC20;

    struct VaultInfo {
        IUniswapV3Pool twapOracle;
        int24 twapDeviation;
        uint24 twapDuration;
        uint24 maxSlippage;
        bool checkSwap;
    }

    struct SetupParams {
        address vault;
        uint24 twapFeeTier;
        int24 twapDeviation;
        uint24 twapDuration;
        uint24 maxSlippage;
        bool checkSwap;
    }

    IUniswapV3Factory public immutable uniFactory;
    uint16 public immutable managerFeeBPS;

    mapping(address => VaultInfo) public vaults;

    event RebalanceVault(address vault, address caller);

    modifier onlyVaultOwner(address vault) {
        require(msg.sender == IArrakisV2(vault).owner(), "NO");
        _;
    }

    constructor(IUniswapV3Factory uniFactory_, uint16 managerFeeBPS_) {
        uniFactory = uniFactory_;
        managerFeeBPS = managerFeeBPS_;
    }

    function initManagement(SetupParams calldata params)
        external
        onlyVaultOwner(params.vault)
    {
        require(params.twapDeviation > 0, "DN");
        require(params.maxSlippage < hundredPercent, "MS");
        require(address(this) == IArrakisV2(params.vault).manager(), "NM");
        require(address(vaults[params.vault].twapOracle) == address(0), "AV");
        IUniswapV3Pool pool = IUniswapV3Pool(
            _getPool(
                address(IArrakisV2(params.vault).token0()),
                address(IArrakisV2(params.vault).token1()),
                params.twapFeeTier
            )
        );

        vaults[params.vault] = VaultInfo({
            twapOracle: pool,
            twapDeviation: params.twapDeviation,
            twapDuration: params.twapDuration,
            maxSlippage: params.maxSlippage,
            checkSwap: params.checkSwap
        });
    }

    // solhint-disable-next-line function-max-lines
    function rebalance(address vault_, Rebalance calldata rebalanceParams_)
        external
        onlyOwner
    {
        VaultInfo memory vaultInfo = vaults[vault_];
        require(address(vaultInfo.twapOracle) != address(0), "NV");

        // check twap deviation for all uniswap pools
        _checkTWAPs(
            IArrakisV2(vault_),
            vaultInfo.twapDuration,
            vaultInfo.twapDeviation
        );

        // check expectedMinReturn on rebalance swap against twap
        // may be unnecessary/redundant if all whitelisted swap routers have built-in checks
        if (vaultInfo.checkSwap && rebalanceParams_.swap.amountIn > 0) {
            _checkMinReturn(
                rebalanceParams_,
                vaultInfo.twapOracle,
                vaultInfo.twapDuration,
                vaultInfo.maxSlippage,
                IDecimals(address(IArrakisV2(vault_).token0())).decimals(),
                IDecimals(address(IArrakisV2(vault_).token1())).decimals()
            );
        }

        IArrakisV2(vault_).rebalance(rebalanceParams_);

        emit RebalanceVault(vault_, msg.sender);
    }

    // solhint-disable-next-line code-complexity
    function withdrawAndCollectFees(
        IArrakisV2[] calldata vaults_,
        IERC20[] calldata tokens_,
        address target
    ) external onlyOwner {
        require(vaults_.length > 0, "ZV");
        require(target != address(0), "TZA");

        // #region withdraw from vaults.

        for (uint256 i; i < vaults_.length; i++) {
            require(vaults_[i].manager() == address(this), "NM");

            vaults_[i].withdrawManagerBalance();
        }

        // #endregion withdraw from vaults.

        // #region transfer token to target.

        for (uint256 i; i < tokens_.length; i++) {
            uint256 balance = IERC20(tokens_[i]).balanceOf(address(this));
            if (balance > 0) IERC20(tokens_[i]).safeTransfer(target, balance);
        }

        // #endregion transfer token to target.
    }

    function _checkTWAPs(
        IArrakisV2 vault_,
        uint24 twapDuration,
        int24 twapDeviation
    ) internal view {
        address[] memory pools = vault_.getPools();
        for (uint256 i; i < pools.length; i++) {
            Twap.checkDeviation(
                IUniswapV3Pool(pools[i]),
                twapDuration,
                twapDeviation
            );
        }
    }

    function _checkMinReturn(
        Rebalance memory rebalanceParams_,
        IUniswapV3Pool twapOracle,
        uint24 twapDuration,
        uint24 maxSlippage,
        uint8 decimals0,
        uint8 decimals1
    ) internal view {
        if (rebalanceParams_.swap.zeroForOne) {
            require(
                FullMath.mulDiv(
                    rebalanceParams_.swap.expectedMinReturn,
                    10**decimals0,
                    rebalanceParams_.swap.amountIn
                ) >
                    FullMath.mulDiv(
                        Twap.getPrice0(twapOracle, twapDuration),
                        hundredPercent - maxSlippage,
                        hundredPercent
                    ),
                "S0"
            );
        } else {
            require(
                FullMath.mulDiv(
                    rebalanceParams_.swap.expectedMinReturn,
                    10**decimals1,
                    rebalanceParams_.swap.amountIn
                ) >
                    FullMath.mulDiv(
                        Twap.getPrice1(twapOracle, twapDuration),
                        hundredPercent - maxSlippage,
                        hundredPercent
                    ),
                "S1"
            );
        }
    }

    function _getPool(
        address token0,
        address token1,
        uint24 feeTier
    ) internal view returns (address pool) {
        pool = uniFactory.getPool(token0, token1, feeTier);

        require(pool != address(0), "NP");
    }
}
