// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library Counter {
    bytes32 constant COUNTER_STORAGE_POSITION = keccak256("diamond.standard.counter.storage");

    struct CounterStorage {
        uint256 counter;
    }

    function counterStorage() internal pure returns (CounterStorage storage ds) {
        bytes32 position = COUNTER_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }
}