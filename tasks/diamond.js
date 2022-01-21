//const { ethers } = require("hardhat");
require('dotenv').config();
const axios = require('axios');
const fs = require("fs");
const {diff} = require('json-diff')

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

    let output2 = await await fs.promises.readFile('./' + args.o)

    const d = diff(output1, JSON.parse(output2))

    console.log('\nDiamonds:')
    console.log('\tAdd: ', getFunctionsFacetsToAdd(d))
    console.log('\tRemove: ', getFunctionsFacetsToRemove(d))
    console.log('\tReplace: ', getFunctionFacetsToReplace(d))
    console.log('\nContracts to deploy:')
    console.log(getContractsToDeploy(d))


  });

module.exports = {};
