# Diamond Task

## Work in Progress
Everything you see is under development and it's just a prototype

## Introduction
The objective of this repository is to work on a Diamond Framework, that will allow developers to manage diamonds with a few command lines. We imagined a diamond.json file that rappresent the state of the diamond.

An object "functions" (right now is actually called "diamond") that contains the functionSelector and a list of contracts.
This file can be manually change, but we propose using hardhat's tasks to automate some processes.

This file is used by diamond:cut to upgrade the diamond. It compares the modified local file with the remote state of the diamond and processes the differences: add, replace, remove facets and deploy new contracts.

```json
{
  "functions": {
    "test1Func1": "Test1Facet",
    "test1Func10": "Test1Facet",
    "test1Func2": "Test1Facet"
  },
  "contracts": {
    "Test1Facet": {
      "name": "Test1Facet",
      "address": "0x056c69CAC8BF42309A477a85cc039F6E20a9CCe7",
      "type": "remote"
    }
  }
}
```

## Commands


### diamond:new
```bash
npx hardhat diamond:new [--from-sources] [--include-loupe] [--include-cut] [--include-ownership]
```
The diamond:new command is used to create a diamond from scratch, it creates an empty diamond.json file.

#### --from-sources parameter
Automatically scans the facet folder and add all the facets and their functions to the diamond

#### --include-x
Include in the diamond the standard facets (adding them as remote facets): loupe,cut,ownership.

### diamond:clone
```bash
npx hardhat diamond:clone --address [--o]
```
The diamond:clone call the loupe function on the diamond, then call sourcify to get informations about all the published facets. Finally writes the diamond.json file.

#### --address
The address of the diamond

#### --o
Specify a different name for the output file (default: diamond.json)

### diamond:status
```bash
npx hardhat diamond:status --address [--o]
```
The diamond:status outputs the actual differences between the local diamond.json file and the published diamond.

#### --address
The address of the diamond

#### --o
Specify a different name for the diamond file (default: diamond.json)

#### Example
```bash

Diamonds:
    Add:  [
        { test99Func0: 'Test99Facet' },
        { test99Func1: 'Test99Facet' },
        { test99Func2: 'Test99Facet' }
    ]
    Remove:  [
        { test2Func1: 'Test2Facet' },
        { test2Func10: 'Test2Facet' },
        { test2Func11: 'Test2Facet' }
    ]
    Replace:  []
Contracts to deploy:
    []
```

### diamond:cut
```bash
npx hardhat diamond:cut --address [--o]
```
The diamond:cut performs the actual cut based on the output of diamond:status

#### --address
The address of the diamond

#### --o
Specify a different name for the diamond file (default: diamond.json)

### diamond:add
```bash
npx hardhat diamond:add [--remote] [--address] [--local] [--name] [--o]
```
The diamond:add adds a new facet to the diamond.json file

#### --remote
If passing remote then --address is mandatory. Fetch information of a remote facet on sourcify and add all functions in the functionSelector in the diamond.json file
#### --address
The address of the facet(contract) to add

#### --local
If passing local then --name is mandatory. Add a local contract/facet and all its functions to the diamond.json file.

#### --o
Specify a different name for the diamond file (default: diamond.json)

