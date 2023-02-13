// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// solhint-disable func-name-mixedcase
interface IGauge is IERC20 {
    // solhint-disable var-name-mixedcase
    struct Reward {
        address token;
        address distributor;
        address ve;
        address veBoost_proxy;
        uint256 period_finish;
        uint256 rate;
        uint256 last_update;
        uint256 integral;
    }

    function initialize(address stakingToken, address admin) external;

    function deposit(uint256 value, address addr) external;

    function withdraw(uint256 value) external;

    function add_reward(
        address token,
        address distributor,
        address ve,
        address boost
    ) external;

    function set_reward_distributor(address token, address distributor)
        external;

    function set_reward_voting_escrow(
        address token,
        address ve,
        address boost
    ) external;

    function user_checkpoint(address addr) external returns (bool);

    function claim_rewards(address addr) external;

    function deposit_reward_token(address, uint256) external;

    function claimable_reward(address addr, address token)
        external
        view
        returns (uint256);

    function claimed_reward(address addr, address token)
        external
        view
        returns (uint256);

    function reward_count() external view returns (uint256);

    function reward_tokens(uint256 index) external view returns (address);

    function reward_data(address) external view returns (Reward memory);

    function staking_token() external view returns (address);

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function decimals() external view returns (uint8);
}
