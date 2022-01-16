// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Counter } from "../storage/Counter.sol";

contract Test1Facet {
    event TestEvent(address something);

    function test1Func1() external payable {
        Counter.CounterStorage storage ds = Counter.counterStorage();
        ds.counter += 1;
    }

    function test1Func2() external {}

    function test1Func10() external pure returns (string memory) {
        return 'ciao';
    }
    /* function supportsInterface(bytes4 _interfaceID) external view returns (bool) {} */
}
