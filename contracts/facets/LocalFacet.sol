// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Counter } from "../storage/Counter.sol";

contract LocalFacet {
    function local2Func3() external view returns (uint256) {
        Counter.CounterStorage storage ds = Counter.counterStorage();
        return ds.counter;
    }
    function local2Func7() external {}

    function local2Func12() external {}

    function test1Func2() external {}

}
