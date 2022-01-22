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

function convert(args) {
  const facetsPath = "/contracts/facets/";
  let files = fs.readdirSync("." + facetsPath);

  let contracts = {}
  let diamond = {}

  for (const file of files) {
      const name = file.replace(".sol", "");
      const abi = hre.artifacts.readArtifactSync(name).abi

      let functions = []

      for (const obj of abi) {
      if (obj.type === 'function') {
          functions.push(obj.name)
      }
      // if (obj.type === 'event') {
      //   events.push(obj.name)
      // }
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
  .addOptionalParam("o", "The file to create", "")
  .setAction(async (args) => {
    
    let output = await loupe(args)

    if (args.o) {
      let filename = args.o
      await fs.promises.writeFile('./' + filename, JSON.stringify(output, null, 2));
    } else {
      console.log(output)
    }

  });

task("diamond:status", "clone diamond")
  .addParam("address", "The diamond's address")
  .addOptionalParam("o", "The file to create", "")
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


task("diamond:compile", "Compares local .diamond to deployed .diamond")
// .addParam("address", "The diamond's address")
.addOptionalParam("o", "The file to create", "")
.setAction(
  async (args, hre) => {
    await hre.run("compile");

    await hre.run("convert", args) // converts facet artifacts to .diamond format
    
    // await hre.run("status", args);  // get differences local/remote

    // await hre.run("loupe", args);

  }
);

subtask(
  "convert", "Converts facet artificats to local .diamond.json file"
).setAction(async (args) => {
  let output = convert(args)

  if (args.o) {
    let filename = args.o
    await fs.promises.writeFile('./' + filename, JSON.stringify(output, null, 2));
  } else {
    console.log(output)
  }

});


// deploy and verify new or changed facets
task("diamond:upgrade", "Deploys diamond's changed facets and uploads sourcecode")
.addParam("address", "The diamond's address")
// .addOptionalParam("o", "The file to create", "")
.setAction(
  async (args, hre) => {
    // find new facets in difference

    // deploy facets to diamond using DiamondCut

    // await hre.run("scan", args);
  }
);

subtask("scan", "verifies contract by sending source code to Etherscan")
  .setAction(async (args) => {

    //call diamond loupe function on diamond to get facet addresses

    //verify all facet addresses: https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html#using-programmatically
    //for (const facetAddress of facetAddresses) { vvv }
    await hre.run("verify:verify", {
      address: facetAddress,
      // constructorArguments: [
      //   50,
      //   "a string argument",
      //   {
      //     x: 10,
      //     y: 5,
      //   },
      //   "0xabcdef",
      // ],
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
- 0x3e9208957675D6acaB47778e6e9A3365ED604F61
- 

*/
