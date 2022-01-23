// const { ethers } = require("hardhat");
const axios = require('axios');
const fs = require("fs");
const { diff } = require('json-diff');
require('dotenv').config();

async function loupe(args) {
  const diamondLoupeFacet = await ethers.getContractAt('DiamondLoupeFacet', args.address)
  const facets = await diamondLoupeFacet.facets()

  let contracts = {}
  let diamond = {}

  for await (const facet of facets) {
    const address = facet[0]
    const fullUrl = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${address}&apikey=${process.env.ETHERSCAN_API_KEY}`
    const resp = await axios.get(fullUrl)
    const abi = JSON.parse(resp.data.result[0].ABI)
    // const code = resp.data.result[0].SourceCode
    const name = resp.data.result[0].ContractName

    let functions = []
    let events = []
    for (const obj of abi) {
      if (obj.type === 'function') {
        functions.push(obj.name)
      }
      if (obj.type === 'event') {
        events.push(obj.name)
      }
    }
      
    contracts[name] = {
      name,
      address,
      type: 'remote',
    //functions,
      //events
    }

    functions.forEach(fn => {
      diamond[fn] = name
    })

      /**
       * 
       * {
              "diamond": {
                  "test1Func1": "Test1Facet",
                  "test3Func1": "Test1Facet"
              },
              "contracts": {
                  "Test1Facet": {
                      "name": "Test1Facet",
                      "type": "remote",
                      "address": "0x12301230912309..."
                  },
                  "Test3Facet": {
                      "name": "Test3Facet",
                      "type": "remote",
                      "address": "0x12301230912309..."
                  },
              }
          }
       */
    }

  return {
    diamond,
    contracts
  }

}

function init(args) {

  const facetsPath = "/contracts/facets/";
  let files = fs.readdirSync("." + facetsPath);

  let contracts = {}
  let diamond = {}

  for (const file of files) {
      const name = file.replace(".sol", "");
      const abi = hre.artifacts.readArtifactSync(name).abi

      let functions = []
      let events = []
      for (const obj of abi) {
      if (obj.type === 'function') {
          functions.push(obj.name)
      }
      if (obj.type === 'event') {
        events.push(obj.name)
      }
      }

      contracts[name] = {
        name,
        // abi,
        // address,
        // type: 'local',
        // functions,
        // events
      }

      functions.forEach(fn => {
        diamond[fn] = name
      })

  }

  return {
      diamond,
      contracts
  }
}

function getFunctionsFacetsToAdd(d) {

  let functionsToAdd = Object.keys(d.diamond).filter(fn => {
      return fn.endsWith('__added')
  })
  
  let functionsFacetsToAdd = functionsToAdd.map(fn => {
      let obj = {}
      obj[`${fn.substring(0, fn.length - '__added'.length)}`] = d.diamond[fn]
      return obj
  })
  
  return functionsFacetsToAdd
}

function getFunctionsFacetsToRemove(d) {

  let functionsToAdd = Object.keys(d.diamond).filter(fn => {
      return fn.endsWith('__deleted')
  })
  
  let functionsFacetsToAdd = functionsToAdd.map(fn => {
      let obj = {}
      obj[`${fn.substring(0, fn.length - '__deleted'.length)}`] = d.diamond[fn]
      return obj
  })
  
  return functionsFacetsToAdd
}

function getFunctionFacetsToReplace(d) {
  let functionsToReplace = Object.keys(d.diamond).filter(fn => {
      const facet = d.diamond[fn]
      return typeof facet === 'object'
  })

  let functionsFacetsToReplace = functionsToReplace.map(fn => {
      let obj = {}
      obj[fn] = d.diamond[fn].__new
      return obj
  })
  
  return functionsFacetsToReplace
}

function getContractsToReplace(d) {

  let contractsToReplace = Object.keys(d.contracts).filter(fn => {
      return d.contracts[fn].hasOwnProperty('address__deleted') && d.contracts[fn].hasOwnProperty('path__added')
  })
  
  let contractsInfoToReplace = contractsToReplace.map(fn => {
      let obj = {}
      obj[fn] = {
          name: fn,
          type: 'local',
          path: d.contracts[fn].path__added
      }
      return obj
  })
  
  return contractsInfoToReplace
}

function getContractsToDeploy(d) {

  let contractsToDeploy = Object.keys(d.contracts).filter(fn => {
      return fn.endsWith('__added') && d.contracts[fn].type === 'local'
  })
  
  let contractsInfoToDeploy = contractsToDeploy.map(fn => {
      let obj = {}
      obj[`${fn.substring(0, fn.length - '__added'.length)}`] = d.contracts[fn]
      return obj
  })
  
  return contractsInfoToDeploy.concat(getContractsToReplace(d))
}

task("diamond:loupe", "Do stuff with diamonds")
  .addParam("address", "The diamond's address")
  .addOptionalParam("o", "The file to create", "diamond.json")
  .setAction(async (args) => {
    
    /**@dev issues with getting ABI in loupe() function on a newly deployed and verified diamond */

    let output = await loupe(args)
    console.log(output)

    if (args.o) {
      let filename = args.o
      await fs.promises.writeFile('./' + filename, JSON.stringify(output, null, 2));
    } else {
      console.log(output)
    }

  });

task("diamond:status", "clone diamond")
  .addParam("address", "The diamond's address")
  .addOptionalParam("o", "The file to create", "diamond.json")
  .setAction(async (args) => {
    let output1 = await loupe(args)

    let output2 = await fs.promises.readFile('./' + args.o)

    const d = diff(output1, JSON.parse(output2))

    console.log('\nDiamonds:')
    console.log('\tAdd: ', getFunctionsFacetsToAdd(d))
    console.log('\tRemove: ', getFunctionsFacetsToRemove(d))
    console.log('\tReplace: ', getFunctionFacetsToReplace(d))
    console.log('\nContracts to deploy:')
    console.log(getContractsToDeploy(d))

  });

task("diamond:add", "Adds facets and functions to diamond.json")
  // .addParam("facets", "The changed facets to add")
  .addOptionalParam("o", "The diamond file to output to", "diamond.json")
  .setAction(
  async (args, hre) => {

    await hre.run("compare", args); // inits facet artifacts to .diamond format

  });

// diamond:remove

// diamond:update

subtask(
  "compare", "compiles contracts, inits facet artificats, and compares with diamond.json")
  .setAction(async (args, hre) => {
    await hre.run("compile");

    let diamond0 = init(args);

    let diamond1 = JSON.parse(fs.readFileSync(args.o));

    for (const obj of Object.entries(diamond1.contracts)) {
      delete obj[1].address
      delete obj[1].type
    }

    console.log(diamond0, diamond1)
  });




// deploy and verify new or changed facets
task("diamond:publish", "Deploys diamond's changed facets and uploads source code")
  .addParam("address", "The diamond address")
  .addOptionalParam("conceal", "Do not verify the sourcecode", "")
  .setAction(async (args, hre) => {

    if (!args.conceal) {
      await hre.run("sourcify", args);
    }

  });

subtask("sourcify", "verifies contracts by uploading sourcecode and ABI")
  .setAction(async (args) => {

    const accounts = await ethers.getSigners()

      
    // call loupe function on diamond to get facet addresses
  
    // verify all facet addresses: https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html#using-programmatically
    await hre.run("verify:verify", {
       address: args.address,
      // // address _contractOwner, address _diamondCutFacet
      constructorArguments: [
  
        `${accounts[0].address}`, // owner address
        '0x47a49B8F0985199F3d45679b70C1FB4dE3EB9978' // DiamondCutFacet address
  
  
      //   // 50,
      //   // "a string argument",
      //   // {
      //   //   x: 10,
      //   //   y: 5,
      //   // },
      //   // "0xabcdef",
      ]
      // libraries with undetectable addresses
      // libraries: {
      // SomeLibrary: "0x...",
      // }
    });
  });

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


