// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.13;

import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract GaugeMock is ERC20 {
    IERC20 public immutable stakingToken;
    mapping(address => address) public treasuryByRewardTkn;
    address[] public tokenRewards;

    constructor(IERC20 stakingToken_) ERC20("Gauge Token", "GTO") {
        stakingToken = stakingToken_;
    }

    function deposit(uint256 mintAmount_, address receiver_) external {
        stakingToken.transferFrom(msg.sender, address(this), mintAmount_);

        _mint(receiver_, mintAmount_);
    }

    // solhint-disable-next-line func-name-mixedcase
    function add_reward(address rewardToken_, address treasury_) external {
        treasuryByRewardTkn[rewardToken_] = treasury_;
        tokenRewards.push(rewardToken_);
    }

    // solhint-disable-next-line func-name-mixedcase
    function deposit_reward_token(address rewardToken_, uint256 amount_)
        external
    {
        require(treasuryByRewardTkn[rewardToken_] == msg.sender);

        IERC20(rewardToken_).transferFrom(msg.sender, address(this), amount_);
    }

    // solhint-disable-next-line func-name-mixedcase
    function claim_rewards(address account_) external {
        for (uint256 i = 0; i < tokenRewards.length; i++) {
            uint256 rewardTokenBalance = IERC20(tokenRewards[0]).balanceOf(
                address(this)
            );

            if (rewardTokenBalance != 0) {
                uint256 reward = (rewardTokenBalance * balanceOf(account_)) /
                    totalSupply();

                if (reward > 0) {
                    IERC20(tokenRewards[0]).transfer(account_, reward);
                }
            }
        }
    }

    function withdraw(uint256 burnAmount_) external {
        uint256 stakingTokenBalance = IERC20(stakingToken).balanceOf(
            address(this)
        );

        require(burnAmount_ <= balanceOf(msg.sender));

        uint256 stake = (stakingTokenBalance * burnAmount_) / totalSupply();

        if (stake > 0) {
            stakingToken.transfer(msg.sender, stake);
            _burn(msg.sender, burnAmount_);
        }
    }

    // solhint-disable-next-line func-name-mixedcase, no-unused-vars
    function claimable_reward(address account_, address rewardToken_)
        external
        view
        returns (uint256)
    {
        // if (IERC20(rewardToken_).balanceOf(address(this)) == 0) return 0;
        return balanceOf(account_);
    }

    // solhint-disable-next-line func-name-mixedcase
    function staking_token() external view returns (address) {
        return address(stakingToken);
    }
}
