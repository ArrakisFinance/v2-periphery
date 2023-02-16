# @version 0.3.7
"""
@title Liquidity Gauge v4 Multi
@author Arrakis Finance
@license MIT
"""

# Original idea and credit:
# Curve Finance's LiquidityGaugeV4
# https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/gauges/LiquidityGaugeV4.vy
# Angle Protocol's LiquidityGaugeV4
# https://github.com/AngleProtocol/angle-core/blob/main/contracts/staking/LiquidityGaugeV4.vy
# 
# Angle Protocol also contributed to this LiquidityGaugeV4Multi implementation
#
# LiquidityGaugeV4Multi functions exactly like Angle's LiquidityGaugeV4 except that rewards tokens may
# independently set "ve" and "veBoost Delegation Proxy" addresses (for multiple boosted reward tokens)

from vyper.interfaces import ERC20

implements: ERC20

# We do low level calls to avoid blocking by misconfigured ve/veBoost on reward tokens
# thus interface definitions below are not needed, here for reference only
# interface VotingEscrow:
#     def user_point_epoch(addr: address) -> uint256: view
#     def user_point_history__ts(addr: address, epoch: uint256) -> uint256: view

# interface VotingEscrowBoost:
#     def adjusted_balance_of(_account: address) -> uint256: view

interface ERC20Extended:
    def symbol() -> String[26]: view
    def decimals() -> uint256: view


event Deposit:
    provider: indexed(address)
    value: uint256

event Withdraw:
    provider: indexed(address)
    value: uint256

event UpdateLiquidityLimit:
    token: address
    user: address
    original_balance: uint256
    original_supply: uint256
    working_balance: uint256
    working_supply: uint256

event CommitOwnership:
    admin: address

event ApplyOwnership:
    admin: address

event Transfer:
    _from: indexed(address)
    _to: indexed(address)
    _value: uint256

event Approval:
    _owner: indexed(address)
    _spender: indexed(address)
    _value: uint256

event RewardDataUpdate:
    _token: indexed(address)
    _amount: uint256

struct Reward:
    distributor: address
    period_finish: uint256
    rate: uint256
    last_update: uint256
    integral: uint256


MAX_REWARDS: constant(uint256) = 8
TOKENLESS_PRODUCTION: constant(uint256) = 40
WEEK: constant(uint256) = 604800

# Whether the reward token has a vote-escrowed model
is_boostable: public(HashMap[address, bool])
# Maps the reward token to its ve counterpart
voting_escrows: public(HashMap[address, address])
# Maps the reward token to its boost proxy
veBoost_proxies: public(HashMap[address, address])

staking_token: public(address)
decimal_staking_token: public(uint256)

balanceOf: public(HashMap[address, uint256])
totalSupply: public(uint256)
allowance: public(HashMap[address, HashMap[address, uint256]])

name: public(String[64])
symbol: public(String[32])

working_balances: public(HashMap[address, HashMap[address, uint256]])
working_supply: public(HashMap[address, uint256])

integrate_checkpoint_of: public(HashMap[address, HashMap[address, uint256]])

# For tracking external rewards
reward_count: public(uint256)
reward_boostable_count: public(uint256)
reward_tokens: public(address[MAX_REWARDS])
reward_tokens_boostable: public(address[MAX_REWARDS])

reward_data: public(HashMap[address, Reward])

# claimant -> default reward receiver
rewards_receiver: public(HashMap[address, address])

# reward token -> claiming address -> integral
reward_integral_for: public(HashMap[address, HashMap[address, uint256]])

# user -> [uint128 claimable amount][uint128 claimed amount]
claim_data: HashMap[address, HashMap[address, uint256]]

admin: public(address)
future_admin: public(address)

initialized: public(bool)


@external
def __init__():
    """
    @notice Contract constructor
    @dev The contract has an initializer to prevent the take over of the implementation
    """

    assert self.initialized == False #dev: contract is already initialized
    self.initialized = True

@external
def initialize(_staking_token: address, _admin: address):
    """
    @notice Contract initializer
    @param _staking_token Liquidity Pool contract address
    @param _admin Admin who can kill the gauge
    """
    assert self.initialized == False #dev: contract is already initialized
    self.initialized = True

    assert _admin != ZERO_ADDRESS

    self.admin = _admin
    self.staking_token = _staking_token
    self.decimal_staking_token = ERC20Extended(_staking_token).decimals()

    symbol: String[26] = ERC20Extended(_staking_token).symbol()
    self.name = concat(symbol, " Spice Harvester")
    self.symbol = concat("st", symbol)
    
@view
@external
def decimals() -> uint256:
    """
    @notice Get the number of decimals for this token
    @dev Implemented as a view method to reduce gas costs
    @return uint256 decimal places
    """
    return self.decimal_staking_token

@internal
def _revertable_balance_of(target:address, sig:Bytes[4], addr:address) -> uint256:
    """
    @notice func(address) -> uint256 staticcall, returns 0 on revert
    @param target contract address
    @param sig function signature
    @param addr function argument address
    """
    success: bool = False
    response: Bytes[32] = b""
    value: uint256 = 0
    success, response = raw_call(
        target,
        concat(sig, convert(addr, bytes32)),
        max_outsize=32,
        is_static_call=True,
        revert_on_failure=False,
    )
    if success:
        value = convert(response, uint256)
    return value

@internal
def _revertable_total_supply(target:address) -> uint256:
    """
    @notice totalSupply() staticcall, returns default value on revert
    @param veBoost veBoost contract address
    @param addr User address
    """
    success: bool = False
    response: Bytes[32] = b""
    value: uint256 = 0
    success, response = raw_call(
        target,
        method_id("totalSupply()"),
        max_outsize=32,
        is_static_call=True,
        revert_on_failure=False,
    )
    if success:
        value = convert(response, uint256)
    return value

@internal
def _update_liquidity_limit(token:address, addr: address, l: uint256, L: uint256):
    """
    @notice Calculate limits which depend on the amount of token per-user.
            Effectively it calculates working balances to apply amplification
            of token production by token
    @param token veToken address to update working balances
    @param addr User address
    @param l User's amount of liquidity (LP tokens)
    @param L Total amount of liquidity (LP tokens)
    """
    # To be called after totalSupply is updated
    response: Bytes[32] = b""
    voting_balance: uint256 = self._revertable_balance_of(
        self.veBoost_proxies[token],
        method_id("adjusted_balance_of(address)"),
        addr,
    )
    voting_total: uint256 = self._revertable_total_supply(self.voting_escrows[token])

    lim: uint256 = l * TOKENLESS_PRODUCTION / 100
    if voting_total > 0:
        lim += L * voting_balance / voting_total * (100 - TOKENLESS_PRODUCTION) / 100

    lim = min(l, lim)
    old_bal: uint256 = self.working_balances[token][addr]
    self.working_balances[token][addr] = lim
    _working_supply: uint256 = self.working_supply[token] + lim - old_bal
    self.working_supply[token] = _working_supply

    log UpdateLiquidityLimit(token, addr, l, L, lim, _working_supply)

@internal
def _update_liquidity_limits(tokens:address[MAX_REWARDS], addr: address, l: uint256, L: uint256):
    """
    @notice Calculate limits which depend on the amount of TOKEN token per-user.
            Effectively it calculates working balances to apply amplification
            of tokens production by tokens
    @param tokens veToken addresses to update working balances
    @param tokens Tokens to apply boost
    @param addr User address
    """
    for i in range(MAX_REWARDS):
        token: address = tokens[i]
        if token == ZERO_ADDRESS:
            break
        self._update_liquidity_limit(token, addr, l, L)

@internal
def _checkpoint_reward(_user: address, token: address, _total_supply: uint256, _user_balance: uint256, _claim: bool, receiver: address):
    """
    @notice Claim pending rewards and checkpoint rewards for a user
    """
    total_supply: uint256 = _total_supply
    user_balance: uint256 = _user_balance
    if self.is_boostable[token] : 
        total_supply = self.working_supply[token]
        user_balance = self.working_balances[token][_user]

    integral: uint256 = self.reward_data[token].integral
    last_update: uint256 = min(block.timestamp, self.reward_data[token].period_finish)
    duration: uint256 = last_update - self.reward_data[token].last_update
    if duration != 0:
        self.reward_data[token].last_update = last_update
        if total_supply != 0:
            integral += duration * self.reward_data[token].rate * 10**18 / total_supply
            self.reward_data[token].integral = integral

    if _user != ZERO_ADDRESS:
        integral_for: uint256 = self.reward_integral_for[token][_user]
        new_claimable: uint256 = 0

        if integral_for < integral:
            self.reward_integral_for[token][_user] = integral
            new_claimable = user_balance * (integral - integral_for) / 10**18

        claim_data: uint256 = self.claim_data[_user][token]
        total_claimable: uint256 = shift(claim_data, -128) + new_claimable
        if total_claimable > 0:
            total_claimed: uint256 = claim_data % 2**128
            if _claim:
                response: Bytes[32] = raw_call(
                    token,
                    concat(
                        method_id("transfer(address,uint256)"),
                        convert(receiver, bytes32),
                        convert(total_claimable, bytes32),
                    ),
                    max_outsize=32,
                )
                if len(response) != 0:
                    assert convert(response, bool)
                self.claim_data[_user][token] = total_claimed + total_claimable
            elif new_claimable > 0:
                self.claim_data[_user][token] = total_claimed + shift(total_claimable, 128)
    
    if self.is_boostable[token]: 
        self.integrate_checkpoint_of[token][_user] = block.timestamp
                
@internal
def _checkpoint_rewards(_user: address, _total_supply: uint256, _claim: bool, _receiver: address, checkpoints:address[MAX_REWARDS]):
    """
    @notice Claim pending rewards and checkpoint rewards for a user
    """

    receiver: address = _receiver
    user_balance: uint256 = 0
    if _user != ZERO_ADDRESS:
        user_balance = self.balanceOf[_user]
        if _claim and _receiver == ZERO_ADDRESS:
            # if receiver is not explicitly declared, check if a default receiver is set
            receiver = self.rewards_receiver[_user]
            if receiver == ZERO_ADDRESS:
                # if no default receiver is set, direct claims to the user
                receiver = _user

    if checkpoints[0]!=ZERO_ADDRESS:
        for i in range(MAX_REWARDS):
            token: address = checkpoints[i]
            if token == ZERO_ADDRESS:
                break
            self._checkpoint_reward(_user, token, _total_supply, user_balance, _claim, receiver)
    else:
        reward_count: uint256 = self.reward_count
        for i in range(MAX_REWARDS):
            if i == reward_count:
                break
            token: address = self.reward_tokens[i]
            self._checkpoint_reward(_user, token, _total_supply, user_balance, _claim, receiver)

@external
def user_checkpoint(tokens:address[MAX_REWARDS], addr: address) -> bool:
    """
    @notice Record a checkpoint for `addr`
    @param addr User address
    @return bool success
    """
    assert msg.sender == addr  # dev: unauthorized
    total_supply: uint256 = self.totalSupply

    # check that the tokens are indeed boostable
    for i in range(MAX_REWARDS):
        token: address = tokens[i]
        if token == ZERO_ADDRESS:
            break
        assert self.is_boostable[token] # dev: only pass boostable tokens

    self._checkpoint_rewards(addr, total_supply, False, ZERO_ADDRESS, tokens)
    self._update_liquidity_limits(tokens, addr, self.balanceOf[addr], total_supply)
    return True

@view
@external
def claimed_reward(_addr: address, _token: address) -> uint256:
    """
    @notice Get the number of already-claimed reward tokens for a user
    @param _addr Account to get reward amount for
    @param _token Token to get reward amount for
    @return uint256 Total amount of `_token` already claimed by `_addr`
    """
    return self.claim_data[_addr][_token] % 2**128


@view
@external
def claimable_reward(_user: address, _reward_token: address) -> uint256:
    """
    @notice Get the number of claimable reward tokens for a user
    @param _user Account to get reward amount for
    @param _reward_token Token to get reward amount for
    @return uint256 Claimable reward token amount
    """
    integral: uint256 = self.reward_data[_reward_token].integral
    total_supply: uint256 = self.totalSupply
    user_balance: uint256 = self.balanceOf[_user]
    if self.is_boostable[_reward_token] : 
        total_supply = self.working_supply[_reward_token]
        user_balance = self.working_balances[_reward_token][_user]
        
    if total_supply != 0:
        last_update: uint256 = min(block.timestamp, self.reward_data[_reward_token].period_finish)
        duration: uint256 = last_update - self.reward_data[_reward_token].last_update
        integral += (duration * self.reward_data[_reward_token].rate * 10**18 / total_supply)

    integral_for: uint256 = self.reward_integral_for[_reward_token][_user]
    new_claimable: uint256 = user_balance * (integral - integral_for) / 10**18

    return shift(self.claim_data[_user][_reward_token], -128) + new_claimable


@external
def set_rewards_receiver(_receiver: address):
    """
    @notice Set the default reward receiver for the caller.
    @dev When set to ZERO_ADDRESS, rewards are sent to the caller
    @param _receiver Receiver address for any rewards claimed via `claim_rewards`
    """
    self.rewards_receiver[msg.sender] = _receiver


@external
@nonreentrant('lock')
def claim_rewards(_addr: address = msg.sender, _receiver: address = ZERO_ADDRESS):
    """
    @notice Claim available reward tokens for `_addr`
    @param _addr Address to claim for
    @param _receiver Address to transfer rewards to - if set to
                     ZERO_ADDRESS, uses the default reward receiver
                     for the caller
    """
    if _receiver != ZERO_ADDRESS:
        assert _addr == msg.sender  # dev: cannot redirect when claiming for another user
    self._checkpoint_rewards(_addr, self.totalSupply, True, _receiver,empty(address[MAX_REWARDS]))

@internal
def _revertable_t_ve(target:address, addr:address, default_value:uint256) -> uint256:
    t_ve: uint256 = default_value
    success: bool = False
    response: Bytes[32] = b""
    success, response = raw_call(
        target,
        concat(
            method_id("user_point_epoch(address)"),
            convert(addr, bytes32)
        ),
        max_outsize=32,
        is_static_call=True,
        revert_on_failure=False,
    )
    epoch: uint256 = 0
    if success:
        epoch = convert(response, uint256)

    success = False
    success, response = raw_call(
        target,
        concat(
            method_id("user_point_history__ts(address,uint256)"),
            convert(addr, bytes32),
            convert(epoch, bytes32)
        ),
        max_outsize=32,
        is_static_call=True,
        revert_on_failure=False,
    )
    if success:
        t_ve = convert(response, uint256)
    return t_ve

@external
def kick(addr: address, token:address):
    """
    @notice Kick `addr` for abusing their boost
    @dev Only if either they had another voting event, or their voting escrow lock expired
    @param addr Address to kick
    @param token Boostable token to kick
    """
    assert self.is_boostable[token] # dev: kick not possible

    t_last: uint256 = self.integrate_checkpoint_of[token][addr]
    t_ve: uint256 = self._revertable_t_ve(self.voting_escrows[token], addr, t_last+1)
    ve_balance: uint256 = self._revertable_balance_of(
        self.voting_escrows[token],
        method_id("balanceOf(address)"),
        addr,
    )
    _balance: uint256 = self.balanceOf[addr]

    assert ve_balance == 0 or t_ve > t_last # dev: kick not allowed
    assert self.working_balances[token][addr] > _balance * TOKENLESS_PRODUCTION / 100  # dev: kick not needed

    total_supply: uint256 = self.totalSupply
    tokenToKick:address[MAX_REWARDS] = empty(address[MAX_REWARDS])
    tokenToKick[0] = token
    self._checkpoint_rewards(addr, total_supply, False, ZERO_ADDRESS, tokenToKick)

    self._update_liquidity_limit(token,addr, self.balanceOf[addr], total_supply)


@external
@nonreentrant('lock')
def deposit(_value: uint256, _addr: address = msg.sender, _claim_rewards: bool = False):
    """
    @notice Deposit `_value` LP tokens
    @dev Depositting also claims pending reward tokens
    @param _value Number of tokens to deposit
    @param _addr Address to deposit for
    """
    total_supply: uint256 = self.totalSupply
    tokensToCheckpoint: address[MAX_REWARDS] = self.reward_tokens_boostable

    if _value != 0:
        is_rewards: bool = self.reward_count != 0
        if is_rewards:
            self._checkpoint_rewards(_addr, total_supply, _claim_rewards, ZERO_ADDRESS, empty(address[MAX_REWARDS]))

        total_supply += _value
        new_balance: uint256 = self.balanceOf[_addr] + _value
        self.balanceOf[_addr] = new_balance
        self.totalSupply = total_supply

        self._update_liquidity_limits(tokensToCheckpoint,_addr, new_balance, total_supply)

        ERC20(self.staking_token).transferFrom(msg.sender, self, _value)
    else:
        self._checkpoint_rewards(_addr, total_supply, False, ZERO_ADDRESS, tokensToCheckpoint)

    log Deposit(_addr, _value)
    log Transfer(ZERO_ADDRESS, _addr, _value)


@external
@nonreentrant('lock')
def withdraw(_value: uint256, _claim_rewards: bool = False):
    """
    @notice Withdraw `_value` LP tokens
    @dev Withdrawing also claims pending reward tokens
    @param _value Number of tokens to withdraw
    """
    total_supply: uint256 = self.totalSupply
    tokensToCheckpoint: address[MAX_REWARDS] = self.reward_tokens_boostable

    if _value != 0:
        is_rewards: bool = self.reward_count != 0
        if is_rewards:
            self._checkpoint_rewards(msg.sender, total_supply, _claim_rewards, ZERO_ADDRESS, empty(address[MAX_REWARDS]))

        total_supply -= _value
        new_balance: uint256 = self.balanceOf[msg.sender] - _value
        self.balanceOf[msg.sender] = new_balance
        self.totalSupply = total_supply

        self._update_liquidity_limits(tokensToCheckpoint,msg.sender, new_balance, total_supply)

        ERC20(self.staking_token).transfer(msg.sender, _value)
    else:
        self._checkpoint_rewards(msg.sender, total_supply, False, ZERO_ADDRESS, tokensToCheckpoint)

    log Withdraw(msg.sender, _value)
    log Transfer(msg.sender, ZERO_ADDRESS, _value)


@internal
def _transfer(_from: address, _to: address, _value: uint256):
    total_supply: uint256 = self.totalSupply
    tokensToCheckpoint: address[MAX_REWARDS] = self.reward_tokens_boostable

    if _value != 0:
        is_rewards: bool = self.reward_count != 0
        if is_rewards:
            self._checkpoint_rewards(_from, total_supply, False, ZERO_ADDRESS,empty(address[MAX_REWARDS]))
        new_balance: uint256 = self.balanceOf[_from] - _value
        self.balanceOf[_from] = new_balance
        self._update_liquidity_limits(tokensToCheckpoint,_from, new_balance, total_supply)

        if is_rewards:
            self._checkpoint_rewards(_to, total_supply, False, ZERO_ADDRESS,empty(address[MAX_REWARDS]))
        new_balance = self.balanceOf[_to] + _value
        self.balanceOf[_to] = new_balance
        self._update_liquidity_limits(tokensToCheckpoint,_to, new_balance, total_supply)
    else:
        self._checkpoint_rewards(_from, total_supply, False, ZERO_ADDRESS, tokensToCheckpoint)
        self._checkpoint_rewards(_to, total_supply, False, ZERO_ADDRESS, tokensToCheckpoint)

    log Transfer(_from, _to, _value)


@external
@nonreentrant('lock')
def transfer(_to : address, _value : uint256) -> bool:
    """
    @notice Transfer token for a specified address
    @dev Transferring claims pending reward tokens for the sender and receiver
    @param _to The address to transfer to.
    @param _value The amount to be transferred.
    """
    self._transfer(msg.sender, _to, _value)

    return True


@external
@nonreentrant('lock')
def transferFrom(_from : address, _to : address, _value : uint256) -> bool:
    """
     @notice Transfer tokens from one address to another.
     @dev Transferring claims pending reward tokens for the sender and receiver
     @param _from address The address which you want to send tokens from
     @param _to address The address which you want to transfer to
     @param _value uint256 the amount of tokens to be transferred
    """
    _allowance: uint256 = self.allowance[_from][msg.sender]
    if _allowance != MAX_UINT256:
        self.allowance[_from][msg.sender] = _allowance - _value

    self._transfer(_from, _to, _value)

    return True


@external
def approve(_spender : address, _value : uint256) -> bool:
    """
    @notice Approve the passed address to transfer the specified amount of
            tokens on behalf of msg.sender
    @dev Beware that changing an allowance via this method brings the risk
         that someone may use both the old and new allowance by unfortunate
         transaction ordering. This may be mitigated with the use of
         {incraseAllowance} and {decreaseAllowance}.
         https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
    @param _spender The address which will transfer the funds
    @param _value The amount of tokens that may be transferred
    @return bool success
    """
    self.allowance[msg.sender][_spender] = _value
    log Approval(msg.sender, _spender, _value)

    return True


@external
def increaseAllowance(_spender: address, _added_value: uint256) -> bool:
    """
    @notice Increase the allowance granted to `_spender` by the caller
    @dev This is alternative to {approve} that can be used as a mitigation for
         the potential race condition
    @param _spender The address which will transfer the funds
    @param _added_value The amount of to increase the allowance
    @return bool success
    """
    allowance: uint256 = self.allowance[msg.sender][_spender] + _added_value
    self.allowance[msg.sender][_spender] = allowance

    log Approval(msg.sender, _spender, allowance)

    return True


@external
def decreaseAllowance(_spender: address, _subtracted_value: uint256) -> bool:
    """
    @notice Decrease the allowance granted to `_spender` by the caller
    @dev This is alternative to {approve} that can be used as a mitigation for
         the potential race condition
    @param _spender The address which will transfer the funds
    @param _subtracted_value The amount of to decrease the allowance
    @return bool success
    """
    allowance: uint256 = self.allowance[msg.sender][_spender] - _subtracted_value
    self.allowance[msg.sender][_spender] = allowance

    log Approval(msg.sender, _spender, allowance)

    return True

@internal
def _add_reward(_reward_token: address, _distributor: address):
    """
    @notice Set the active reward contract
    """
    reward_count: uint256 = self.reward_count
    assert reward_count < MAX_REWARDS
    assert _reward_token != ZERO_ADDRESS
    assert _distributor != ZERO_ADDRESS
    assert self.reward_data[_reward_token].distributor == ZERO_ADDRESS

    self.reward_data[_reward_token].distributor = _distributor
    self.reward_tokens[reward_count] = _reward_token
    self.reward_count = reward_count + 1

@external
def add_reward(_reward_token: address, _distributor: address):
    """
    @notice Set the active reward contract
    """
    assert msg.sender == self.admin  # dev: only owner
    self._add_reward(_reward_token,_distributor)

@external
def add_boostable_reward(_reward_token: address, _voting_escrow: address, _veBoost_proxy: address, _distributor: address):
    """
    @notice Set the active boostable reward contract
    """
    assert msg.sender == self.admin  # dev: only owner
    self._add_reward(_reward_token,_distributor)
    assert _voting_escrow != ZERO_ADDRESS
    assert _veBoost_proxy != ZERO_ADDRESS

    reward_boostable_count: uint256 = self.reward_boostable_count

    self.is_boostable[_reward_token] = True
    self.voting_escrows[_reward_token] = _voting_escrow
    self.veBoost_proxies[_reward_token] = _veBoost_proxy
    self.reward_tokens_boostable[reward_boostable_count] = _reward_token
    self.reward_boostable_count += 1

@external
def set_reward_distributor(_reward_token: address, _distributor: address):
    current_distributor: address = self.reward_data[_reward_token].distributor

    assert msg.sender == current_distributor or msg.sender == self.admin
    assert current_distributor != ZERO_ADDRESS
    assert _distributor != ZERO_ADDRESS

    self.reward_data[_reward_token].distributor = _distributor


@external
@nonreentrant("lock")
def deposit_reward_token(_reward_token: address, _amount: uint256):
    assert msg.sender == self.reward_data[_reward_token].distributor

    # tokenToDeposit:address[MAX_REWARDS] = empty(address[MAX_REWARDS])
    # if(self.is_boostable[_reward_token]):
    #     tokenToDeposit[0] = _reward_token
    
    self._checkpoint_rewards(ZERO_ADDRESS, self.totalSupply, False, ZERO_ADDRESS, empty(address[MAX_REWARDS]))

    response: Bytes[32] = raw_call(
        _reward_token,
        concat(
            method_id("transferFrom(address,address,uint256)"),
            convert(msg.sender, bytes32),
            convert(self, bytes32),
            convert(_amount, bytes32),
        ),
        max_outsize=32,
    )
    if len(response) != 0:
        assert convert(response, bool)

    period_finish: uint256 = self.reward_data[_reward_token].period_finish
    if block.timestamp >= period_finish:
        self.reward_data[_reward_token].rate = _amount / WEEK
    else:
        remaining: uint256 = period_finish - block.timestamp
        leftover: uint256 = remaining * self.reward_data[_reward_token].rate
        self.reward_data[_reward_token].rate = (_amount + leftover) / WEEK

    self.reward_data[_reward_token].last_update = block.timestamp
    self.reward_data[_reward_token].period_finish = block.timestamp + WEEK

    log RewardDataUpdate(_reward_token,_amount)

@external
def commit_transfer_ownership(addr: address):
    """
    @notice Transfer ownership of Gauge to `addr`
    @param addr Address to have ownership transferred to
    """
    assert msg.sender == self.admin  # dev: admin only
    assert addr != ZERO_ADDRESS  # dev: future admin cannot be the 0 address

    self.future_admin = addr
    log CommitOwnership(addr)


@external
def accept_transfer_ownership():
    """
    @notice Accept a pending ownership transfer
    """
    _admin: address = self.future_admin
    assert msg.sender == _admin  # dev: future admin only

    self.admin = _admin
    log ApplyOwnership(_admin)

@external
def recover_erc20(token: address, addr: address, amount: uint256):
    """
    @notice Recovers tokens sent or accruing to this contract
    @param token Token to be recovered
    @param addr Address to send the token to
    @param amount Amount of tokens to send
    """
    assert msg.sender == self.admin  # dev: only owner
    assert token != self.staking_token  # dev: invalid token
    if token == self: 
        self._transfer(self, addr, amount)
    else:
        ERC20(token).transfer(addr, amount)
