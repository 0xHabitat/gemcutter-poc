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

    function test1Func3() external {}

    function test1Func4() external {}

    function test1Func5() external {}

    function test1Func6() external {}

    function test1Func7() external {}

    function test1Func8() external {}

    function test1Func9() external {}

    function test1Func10() external pure returns (string memory) {
        return 'ciao';
    }

    function test1Func11() external {}

    function test1Func12() external {}

    function test1Func13() external {}

    function test1Func14() external {}

    function test1Func15() external {}

    function test1Func16() external {}

    function test1Func17() external {}

    function test1Func18() external {}

    function test1Func19() external {}

    function test1Func20() external {}

    /* function supportsInterface(bytes4 _interfaceID) external view returns (bool) {} */
}
