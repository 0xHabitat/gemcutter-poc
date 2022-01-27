// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Counter } from "../storage/Counter.sol";

contract Test2Facet {
    function test2Func1() external view returns (uint256) {
        Counter.CounterStorage storage ds = Counter.counterStorage();
        return ds.counter;
    }
    function test2Func10() external {}

    function test2Func11() external {}
}
