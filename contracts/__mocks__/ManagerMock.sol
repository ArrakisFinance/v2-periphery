// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.13;

contract ManagerMock {
    uint16 private _fee = 4750;

    function managerFeeBPS() external view returns (uint16) {
        return _fee;
    }
}
