// const { ethers } = require("hardhat");
const axios = require('axios');
const SourcifyJS = require('sourcify-js');
const fs = require("fs");
const { promises } = fs

const DiamondDifferentiator = require('./lib/DiamondDifferentiator.js')
const {
  loupe,
  generateLightFile,
  verify,
  createDiamondFileFromSources,
  getDiamondJson,
  setDiamondJson,
} = require('./lib/utils.js')

require('dotenv').config();

task("diamond:new", "Init diamond file from sources")
  .addFlag("fromSources", "Use the solidity files to initialize the diamond.json file")
  // .addFlag("includeLoupe", "Include loupe facet from default address as remote facet")
  // .addFlag("includeCut", "Include cut facet from default address as remote facet")
  .setAction(async (args, hre) => {
    if (args.fromSources) {
      console.log(createDiamondFileFromSources())
    } else {
      console.log({
        diamond: {},
        contracts: {},
      })
    }
    // write file to diamond.json
  });

task("diamond:clone", "Do stuff with diamonds")
  .addParam("address", "The diamond's address")
  .addOptionalParam("o", "The file to create", "diamond.json")
  .setAction(async (args) => {
   
    let output = await loupe(args)

    if (args.o) {
      let filename = args.o
      await promises.writeFile('./' + filename, JSON.stringify(output, null, 2));
    } else {
      console.log(output)
    }
  });

task("diamond:status", "Compare the local diamond.json with the remote diamond")
  .addParam("address", "The diamond's address")
  .addOptionalParam("o", "The file to create", "diamond.json")
  .setAction(async (args) => {
    let output1 = await loupe(args)

    let output2 = await fs.promises.readFile('./' + args.o)

    const differentiator = new DiamondDifferentiator(output1, JSON.parse(output2.toString()))

    console.log('\nDiamonds:')
    console.log('\tAdd: ', differentiator.getFunctionsFacetsToAdd())
    console.log('\tRemove: ', differentiator.getFunctionsFacetsToRemove())
    console.log('\tReplace: ', differentiator.getFunctionFacetsToReplace())
    console.log('\nContracts to deploy:')
    console.log(differentiator.getContractsToDeploy())
  });


task("diamond:add", "Adds facets and functions to diamond.json")
  .addFlag("remote", "Add remote facet")
  .addFlag("local", "Add local facet")
  .addOptionalParam("o", "The diamond file to output to", "diamond.json")
  .addOptionalParam("address", "The address of the facet to add")
  .setAction(
  async (args, hre) => {
    if (args.remote && args.local) {
      return console.log('remote or local, not both')
    }
    const diamondJson = await getDiamondJson(args.o)
    if (args.remote) {
      const sourcify = new SourcifyJS.default()
      let {abi, name} = await sourcify.getABI(args.address, 4)
      
      diamondJson.contracts[name] = {
        name,
        address: args.address,
        type: "remote"
      }
      for(let obj of abi) {
        if (obj.type === 'function') {
          diamondJson.diamond[obj.name] = name
        }
      }
      await setDiamondJson(diamondJson, args.o)
      console.log('ok :)')
    }
  });

// diamond:remove

// diamond:replace

// deploy and verify new or changed facets
task("diamond:cut", "Deploys diamond's changed facets and uploads source code")
  .addParam("address", "The diamond's address")
  .addOptionalParam("conceal", "Do not verify the sourcecode", "")
  .setAction(async (args, hre) => {

    await hre.run("status", args);
    // if (!args.conceal) {
    //   await hre.run("diamond:verify", args);
    // }

  });

task("diamond:verify", "Verifies contracts by submitting sourcecode to sourcify and updates contract type in diamond.json")
  .addParam("chainId", "The chainId of the deployed contract(s)") // TODO: set default chainId from hardhat.config
  .addOptionalParam("o", "The file to edit", "diamond.json")
  .setAction(async (args) => {
    await hre.run("clean")
    await hre.run("compile")
  
    const sourcify = new SourcifyJS.default()
  
    let json = await generateLightFile()
    const buffer = Buffer.from(JSON.stringify(json))

    let contracts = []

    // verify 'local' type contracts in diamond.json
    let diamondjson = await promises.readFile('./diamond.json')
    diamondjson = JSON.parse(diamondjson)
    for (const contract of Object.values(diamondjson.contracts)) {
      if (contract.type === 'local') {
        contracts.push({
          name: contract.name,
          address: contract.address,
        })
      }
    }
    const result = await sourcify.verify(args.chainId, contracts, buffer)

    // and change 'local' contract's type to 'remote'
    for (const verified of result.contracts) {
      if (verified.status === 'perfect') {
        for (const contract of Object.values(diamondjson.contracts)) {
          if (contract.type === 'local' && verified.address === contract.address) {
            Object.assign(contract, {
              name: verified.name,
              address: verified.address,
              type: 'remote'
            });
          }
        }
      }
    }

    let filename = args.o
    await promises.writeFile('./' + filename, JSON.stringify(diamondjson, null, 2));

  })

module.exports = {};



/*
DIAMOND ADDRESSES:

defaultNetwork: "mainnet",
- BarnBridge: 0x10e138877df69Ca44Fdc68655f86c88CDe142D7F
- PieDAO: 0x17525E4f4Af59fbc29551bC4eCe6AB60Ed49CE31
- Beanstalk: 0xC1E088fC1323b20BCBee9bd1B9fC9546db5624C5
- Gelato: 0x3CACa7b48D0573D793d3b0279b5F0029180E83b6
- Aavegotchi GHST: 0x93eA6ec350Ace7473f7694D43dEC2726a515E31A


defaultNetwork: "rinkeby",
DiamondCutFacet deployed: 0x47a49B8F0985199F3d45679b70C1FB4dE3EB9978
Diamond deployed: 0x2924caD980237dd0Bd6A701f23Bc3fCF5d10B359
DiamondInit deployed: 0x8158289Ed9513692024c9143A3d55030501ec6b8

Deploying facets
DiamondLoupeFacet deployed: 0x7c573A4753d620E9213cD621D739dD1B4d3E7b45
OwnershipFacet deployed: 0x16a32a181866c6e30A998E9A3BEE1D84DDB69d50


defaultNetwork: "ropsten",


*/


