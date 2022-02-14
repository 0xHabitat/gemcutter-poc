// const { ethers } = require("hardhat");
const axios = require('axios');
const SourcifyJS = require('sourcify-js');
const fs = require("fs");
const { promises } = fs

const { getSelectors, FacetCutAction, getSelector } = require('../scripts/libraries/diamond.js')
const DiamondDifferentiator = require('./lib/DiamondDifferentiator.js')
const {
  loupe,
  generateLightFile,
  verify,
  createDiamondFileFromSources,
  getDiamondJson,
  setDiamondJson,
  getFunctionsNamesSelectorsFromFacet,
  getAddressFromArgs,
  getChainIdByNetworkName
} = require('./lib/utils.js')

require('dotenv').config();

task("diamond:deploy", "Deploy a new diamond")
  .addOptionalParam("o", "The diamond file to deploy", "diamond.json")
  .addFlag("new", "Deploy a new Diamond")
  .addFlag("excludeLoupe", "Exclude loupe facet from default address as remote facet")
  .addFlag("excludeOwnership", "Exclude cut facet from default address as remote facet")
  .setAction(async (args, hre) => {
    const CHAIN_ID = getChainIdByNetworkName(hre.config.defaultNetwork)

    await hre.run("clean")
    await hre.run("compile")
    
    console.log(`Deploying Diamond...`)
    let contractsToVerify = []

    let diamondJson
    if (args.new) {
      diamondJson = {
        functionSelectors: {},
        contracts: {},
      }
    } else {
      diamondJson = await getDiamondJson(args.o)
    }

    const accounts = await ethers.getSigners()
    const contractOwner = accounts[0]

    // deploy DiamondCutFacet
    let diamondCutFacetAddress
    if (args.new) {
      const DiamondCutFacet = await ethers.getContractFactory('DiamondCutFacet')
      const diamondCutFacet = await DiamondCutFacet.deploy()
      diamondCutFacetAddress = diamondCutFacet.address
      await diamondCutFacet.deployed()
  
      contractsToVerify.push({
        name: 'DiamondCutFacet',
        address: diamondCutFacetAddress
      })
    } else {
      diamondCutFacetAddress = diamondJson.contracts.DiamondCutFacet.address
    }

    // deploy Diamond
    const Diamond = await ethers.getContractFactory('Diamond')
    const diamond = await Diamond.deploy(contractOwner.address, diamondCutFacetAddress)
    await diamond.deployed()

    contractsToVerify.push({
      name: 'Diamond',
      address: diamond.address
    })
    
    let diamondInit
    /* if (args.new) { */
    const DiamondInit = await ethers.getContractFactory('DiamondInit')
    diamondInit = await DiamondInit.deploy()
    await diamondInit.deployed()

    diamondJson.contracts.DiamondInit = {
      "name": "DiamondInit",
      "address": diamondInit.address,
      "type": "remote"
    }
    contractsToVerify.push({
      name: 'DiamondInit',
      address: diamondInit.address
    })

    diamondJson.type = 'remote'
    diamondJson.address = diamond.address
    await setDiamondJson(diamondJson, args.o)

    console.log(`[OK] Diamond deployed at address: ${diamond.address}`)


    let diamondLoupeFacetAddress
    if (args.new) {
      const DiamondLoupeFacet = await ethers.getContractFactory('DiamondLoupeFacet')
      const diamondLoupeFacet = await DiamondLoupeFacet.deploy()
      diamondLoupeFacetAddress = diamondLoupeFacet.address
      await diamondLoupeFacet.deployed()
  
      contractsToVerify.push({
        name: 'DiamondLoupeFacet',
        address: diamondLoupeFacetAddress
      })
    } else {
      diamondLoupeFacetAddress = diamondJson.contracts.DiamondLoupeFacet.address
    }

    let ownershipFacetAddress
    if (args.new) {
      const OwnershipFacet = await ethers.getContractFactory('OwnershipFacet')
      const ownershipFacet = await OwnershipFacet.deploy()
      ownershipFacetAddress = ownershipFacet.address
      await ownershipFacet.deployed()
  
      contractsToVerify.push({
        name: 'OwnershipFacet',
        address: ownershipFacetAddress
      })
    } else {
      ownershipFacetAddress = diamondJson.contracts.OwnershipFacet.address
    }


    let json = await generateLightFile()
  
    const res = await verify(CHAIN_ID, contractsToVerify, json)
    
    console.log('[OK] Diamond verified')

    if (args.new) {
      await hre.run('diamond:add', {
        o: args.o,
        remote: true,
        address: diamondCutFacetAddress
      })
      await hre.run('diamond:add', {
        o: args.o,
        remote: true,
        address: diamondInit.address,
        skipFunctions: true
      })
    }


    const cut = []
    if (!args.excludeLoupe) {
      console.log('Adding Loupe Facet...')
      const facet = await ethers.getContractAt('DiamondLoupeFacet', diamondLoupeFacetAddress)
      cut.push({
        facetAddress: facet.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(facet)
      })
      if (args.new) {
        await hre.run('diamond:add', {
          o: args.o,
          remote: true,
          address: diamondLoupeFacetAddress
        })
      }
    }
    if (!args.excludeOwnership) {
      console.log('Adding Ownership Facet...')
      const facet = await ethers.getContractAt('OwnershipFacet', ownershipFacetAddress)
      cut.push({
        facetAddress: facet.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(facet)
      })
      if (args.new) {
        await hre.run('diamond:add', {
          o: args.o,
          remote: true,
          address: ownershipFacetAddress
        })
      }
    }

    if (!args.excludeLoupe || !args.excludeOwnership) {
      const diamondCut = await ethers.getContractAt('IDiamondCut', diamond.address)
      let tx
      let receipt
      // call to init function
      let functionCall = diamondInit.interface.encodeFunctionData('init')
      tx = await diamondCut.diamondCut(cut, diamondInit.address, functionCall)
      receipt = await tx.wait()
      if (!receipt.status) {
        throw Error(`[ERR] Diamond upgrade failed: ${tx.hash}`)
      }
      console.log(`[OK] Diamond cut complete`)  
    }

    await hre.run('diamond:cut', {
      o: args.o
    })

  })

task("diamond:clone", "Do stuff with diamonds")
  .addParam("address", "The diamond's address")
  .addOptionalParam("o", "The file to create", "diamond.json")
  .setAction(async (args, hre) => {
    const CHAIN_ID = getChainIdByNetworkName(hre.config.defaultNetwork)
    let output = await loupe(args.address, CHAIN_ID)

    if (args.o) {
      let filename = args.o
      await promises.writeFile('./' + filename, JSON.stringify(output, null, 2));
    } else {
      console.log(output)
    }
  });

task("diamond:status", "Compare the local diamond.json with the remote diamond")
  .addOptionalParam("address", "The diamond's address", "")
  .addOptionalParam("o", "The file to create", "diamond.json")
  .setAction(async (args) => {
    const CHAIN_ID = getChainIdByNetworkName(hre.config.defaultNetwork)
    let address = await getAddressFromArgs(args)

    let output1 = await loupe(address, CHAIN_ID)

    let output2 = await getDiamondJson(args.o)

    const differentiator = new DiamondDifferentiator(output1, output2)

    console.log('\nDiamonds:')
    console.log('\tAdd: ', differentiator.getFunctionsFacetsToAdd())
    console.log('\tRemove: ', differentiator.getFunctionsFacetsToRemove())
    console.log('\tReplace: ', differentiator.getFunctionFacetsToReplace())
    console.log('\nContracts to deploy:')
    console.log(differentiator.getContractsToDeploy())
  });


task("diamond:add", "Adds or replace facets and functions to diamond.json")
  .addFlag("remote", "Add remote facet")
  .addFlag("local", "Add local facet")
  .addOptionalParam("o", "The diamond file to output to", "diamond.json")
  .addOptionalParam("address", "The address of the remote facet to add")
  .addOptionalParam("name", "The name of the local facet to add")
  .addFlag("skipFunctions", "Only add contract")
  .setAction(
  async (args, hre) => {
    const CHAIN_ID = getChainIdByNetworkName(hre.config.defaultNetwork)
    if (args.remote && args.local) {
      return console.log('remote or local, not both')
    }
    const diamondJson = await getDiamondJson(args.o)
    if (args.remote) {
      const sourcify = new SourcifyJS.default('http://localhost:8990', 'http://localhost:5500')
      let {abi, name} = await sourcify.getABI(args.address, CHAIN_ID)
      diamondJson.contracts[name] = {
        name,
        address: args.address,
        type: "remote"
      }
      if (!args.skipFunctions) {
        for(let obj of abi) {
          if (obj.type === 'function') {
            diamondJson.functionSelectors[obj.name] = name
          }
        }
      }
      await setDiamondJson(diamondJson, args.o)
      console.log(`[OK] Add facet ${name} to ${args.o}`)
    } else if (args.local) {
      
      await hre.run("clean")
      await hre.run("compile")

      const FacetName = args.name
      const Facet = await ethers.getContractFactory(FacetName)

      const signatures = Object.keys(Facet.interface.functions)

      const functionSelectors = {}
      signatures.forEach(val => {
        functionSelectors[val.substr(0, val.indexOf('('))] = FacetName
      })
      
      diamondJson.contracts[FacetName] = {
        "name": FacetName,
        "type": "local"
      }

      diamondJson.functionSelectors = {...diamondJson.functionSelectors, ...functionSelectors}

      console.log(`[OK] Add facet ${FacetName} to ${args.o}`)
      await setDiamondJson(diamondJson, args.o)
    }
  });

// diamond:remove
task("diamond:remove", "Remove facets and functions to diamond.json")
  .addOptionalParam("o", "The diamond file to output to", "diamond.json")
  .addOptionalParam("name", "The name of the local facet to add")
  .setAction(
  async (args, hre) => {
    const FacetName = args.name
    const diamondJson = await getDiamondJson(args.o)
    
    let newFunctionSelectors = {}
    for (let fn in diamondJson.functionSelectors) {
      let facet = diamondJson.functionSelectors[fn]
      if (facet != FacetName) {
        newFunctionSelectors[fn] = facet
      }
    }
    diamondJson.functionSelectors = newFunctionSelectors
    console.log(`[OK] Remove facet ${FacetName} from ${args.o}`)
    await setDiamondJson(diamondJson, args.o)
  });

// diamond:replace

async function deployAndVerifyFacetsFromDiff(facetsToDeployAndVerify, CHAIN_ID) {
  /**@notice deploy new facets */
  if (facetsToDeployAndVerify.length === 0) {
    []
  }
  console.log('Deploying facets...')
  let contracts = []
  for (const contract of facetsToDeployAndVerify) {
    const FacetName = contract.name
    const Facet = await ethers.getContractFactory(FacetName)
    const facet = await Facet.deploy()
    await facet.deployed()
    contracts.push({
      name: contract.name,
      address: facet.address
    })
    console.log(`[OK] Facet '${contract.name}' deployed with address ${facet.address}`)
  }

  console.log('Starting verification process on Sourcify...')
  /**@notice verify contracts */
  let json = await generateLightFile()
  
  const res = await verify(CHAIN_ID, contracts, json)
  console.log('[OK] Deployed facets verified')
  return contracts
}

// deploy and verify new or changed facets
task("diamond:cut", "Compare the local diamond.json with the remote diamond")
  .addOptionalParam("address", "The diamond's address", "")
  .addOptionalParam("o", "The file to create", "diamond.json")
  .setAction(async (args, hre) => {
    const CHAIN_ID = getChainIdByNetworkName(hre.config.defaultNetwork)
    let address = await getAddressFromArgs(args)

    await hre.run("clean")
    await hre.run("compile")

    /**@notice get contracts to deploy by comparing local and remote diamond.json */
    console.log('Louping diamond...')
    let output1 = await loupe(address, CHAIN_ID)
    console.log('[OK] Diamond louped')
    
    const diamondJson = await getDiamondJson(args.o)
    const differentiator = new DiamondDifferentiator(output1, diamondJson)
    const facetsToDeployAndVerify = differentiator.getContractsToDeploy();

    const verifiedFacets = await deployAndVerifyFacetsFromDiff(facetsToDeployAndVerify, CHAIN_ID)

    const facetsToAdd = differentiator.getFunctionsFacetsToAdd()

    /**@notice create functionSelectors for functions needed to add */
    let cut = [];

    let diamondJsonContracts = {...diamondJson.contracts}
    verifiedFacets.forEach(vf => {
      diamondJsonContracts[vf.name] = {
        name: vf.name,
        address: vf.address,
        type: 'remote'
      }
    })
    // TOODO: let diamondJsonFunctionSelectors = {...diamondJson.functionSelectors}

    for (let f of facetsToAdd) {
      const sourcify = new SourcifyJS.default('http://localhost:8990', 'http://localhost:5500')
  
      let facetAddress
      if (diamondJson.contracts[f.facet].type === 'remote') {
        facetAddress = diamondJson.contracts[f.facet].address
      } else {
        facetAddress = verifiedFacets.find(vf => vf.name === f.facet).address
      }
      const {abi} = await sourcify.getABI(facetAddress, CHAIN_ID)
      const facet = new ethers.Contract(facetAddress, abi)
  
      let fnNamesSelectors = await getFunctionsNamesSelectorsFromFacet(facet)
      let fn = fnNamesSelectors.find(ns => ns.name === f.fn)
      let cutAddressIndex = cut.findIndex(c => c.facetAddress === facetAddress && c.action === FacetCutAction.Add)
      if(cutAddressIndex === -1) {
        cut.push({
          facetAddress: facetAddress,
          action: FacetCutAction.Add,
          functionSelectors: [fn.selector]
        })
      } else {
        cut[cutAddressIndex].functionSelectors.push(fn.selector)
      }
    }

    const facetsToReplace = differentiator.getFunctionFacetsToReplace()
    for (let f of facetsToReplace) {
      const sourcify = new SourcifyJS.default('http://localhost:8990', 'http://localhost:5500')
  
      let facetAddress
      if (diamondJson.contracts[f.facet].type === 'remote') {
        facetAddress = diamondJson.contracts[f.facet].address
      } else {
        facetAddress = verifiedFacets.find(vf => vf.name === f.facet).address
      }
      const {abi} = await sourcify.getABI(facetAddress, CHAIN_ID)
      const facet = new ethers.Contract(facetAddress, abi)
  
      let fnNamesSelectors = await getFunctionsNamesSelectorsFromFacet(facet)
      let fn = fnNamesSelectors.find(ns => ns.name === f.fn)
      let cutAddressIndex = cut.findIndex(c => c.facetAddress === facetAddress && c.action === FacetCutAction.Add)
      if(cutAddressIndex === -1) {
        cut.push({
          facetAddress: facetAddress,
          action: FacetCutAction.Replace,
          functionSelectors: [fn.selector]
        })
      } else {
        cut[cutAddressIndex].functionSelectors.push(fn.selector)
      }
    }
    
    const facetsToRemove = differentiator.getFunctionsFacetsToRemove()
    for (let f of facetsToRemove) {
      const sourcify = new SourcifyJS.default('http://localhost:8990', 'http://localhost:5500')
  
      let facetAddress
      if (diamondJson.contracts[f.facet].type === 'remote') {
        facetAddress = diamondJson.contracts[f.facet].address
      } else {
        facetAddress = verifiedFacets.find(vf => vf.name === f.facet).address
      }
      const {abi} = await sourcify.getABI(facetAddress, CHAIN_ID)
      const facet = new ethers.Contract(facetAddress, abi)
  
      let fnNamesSelectors = await getFunctionsNamesSelectorsFromFacet(facet)
      let fn = fnNamesSelectors.find(ns => ns.name === f.fn)
      let cutAddressIndex = cut.findIndex(c => c.facetAddress === facetAddress && c.action === FacetCutAction.Add)
      if(cutAddressIndex === -1) {
        cut.push({
          facetAddress: ethers.constants.AddressZero,
          action: FacetCutAction.Remove,
          functionSelectors: [fn.selector]
        })
      } else {
        cut[cutAddressIndex].functionSelectors.push(fn.selector)
      }
      if (cut[cutAddressIndex] && cut[cutAddressIndex].functionSelectors.length === fnNamesSelectors.length) {
        delete diamondJson.contracts[FacetName]
      }
    }

    /**@notice cut in facets */
    console.log(`Cutting Diamond's facets...`)
    // TODO: get diamondInitAddress from somewhere else
    let diamondInitAddress = diamondJson.contracts.DiamondInit.address
    //get diamondInit interface
    let diamondInit = await hre.ethers.getContractFactory('DiamondInit')

    // do the cut
    //console.log('Diamond Cut:', cut)
    const diamondCut = await ethers.getContractAt('IDiamondCut', address)
    let tx
    let receipt
    // call to init function
    let functionCall = diamondInit.interface.encodeFunctionData('init')
    
    tx = await diamondCut.diamondCut(cut, diamondInitAddress, functionCall, {gasLimit: 10000000})

    receipt = await tx.wait()
    if (!receipt.status) {
      throw Error(`Diamond upgrade failed: ${tx.hash}`)
    }

    diamondJson.contracts = diamondJsonContracts

    await setDiamondJson(diamondJson, args.o)

    console.log('[OK] Completed diamond cut')

    // and input facet's address and type into diamond.json
  });

module.exports = {};



/** 
 * TODOS:
 * verify DiamondInit contract - not verifying
 * include 'diamond' (w/ address and other info) in diamond.json
 */




