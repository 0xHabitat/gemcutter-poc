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
  getAddressFromArgs
} = require('./lib/utils.js')

require('dotenv').config();

task("diamond:deploy", "Deploy a new diamond")
  .addOptionalParam("o", "The diamond file to deploy", "diamond.json")
  .addFlag("excludeLoupe", "Include loupe facet from default address as remote facet")
  .addFlag("excludeOwnership", "Include cut facet from default address as remote facet")
  .setAction(async (args) => {
    await hre.run("clean")
    await hre.run("compile")
    
    console.log(`Deploying Diamond...`)
    let contractsToVerify = []
    const diamondJson = {
      functionSelectors: {},
      contracts: {},
    }

    const accounts = await ethers.getSigners()
    const contractOwner = accounts[0]

    // deploy DiamondCutFacet
    const DiamondCutFacet = await ethers.getContractFactory('DiamondCutFacet')
    const diamondCutFacet = await DiamondCutFacet.deploy()
    await diamondCutFacet.deployed()

    contractsToVerify.push({
      name: 'DiamondCutFacet',
      address: diamondCutFacet.address
    })

    // deploy Diamond
    const Diamond = await ethers.getContractFactory('Diamond')
    const diamond = await Diamond.deploy(contractOwner.address, diamondCutFacet.address)
    await diamond.deployed()

    contractsToVerify.push({
      name: 'Diamond',
      address: diamond.address
    })
    
    const DiamondInit = await ethers.getContractFactory('DiamondInit')
    const diamondInit = await DiamondInit.deploy()
    await diamondInit.deployed()

    contractsToVerify.push({
      name: 'DiamondInit',
      address: diamondInit.address
    })

    diamondJson.type = 'remote'
    diamondJson.address = diamond.address
    await setDiamondJson(diamondJson, args.o)
    console.log(`[OK] Diamond deployed at address: ${diamond.address}`)


    let json = await generateLightFile()
  
    const res = await verify(4, contractsToVerify, json)
    console.log('[OK] Diamond verified')

    await hre.run('diamond:add', {
      o: args.o,
      remote: true,
      address: diamondCutFacet.address
    })

    await hre.run('diamond:add', {
      o: args.o,
      remote: true,
      address: diamondInit.address,
      skipFunctions: true
    })

    const cut = []
    if (!args.excludeLoupe) {
      console.log('Adding Loupe Facet...')
      const facet = await ethers.getContractAt('DiamondLoupeFacet', '0xCb4392d595825a46D5e07A961FB4A27bd35bC3d4')
      cut.push({
        facetAddress: facet.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(facet)
      })
      await hre.run('diamond:add', {
        o: args.o,
        remote: true,
        address: "0xCb4392d595825a46D5e07A961FB4A27bd35bC3d4"
      })
    }
    if (!args.excludeOwnership) {
      console.log('Adding Ownership Facet...')
      const facet = await ethers.getContractAt('OwnershipFacet', '0x6e9B27a77eC19b2aF5A2da28AcD1434b3de4D6EE')
      cut.push({
        facetAddress: facet.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(facet)
      })
      await hre.run('diamond:add', {
        o: args.o,
        remote: true,
        address: "0x6e9B27a77eC19b2aF5A2da28AcD1434b3de4D6EE"
      })
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


  })

task("diamond:clone", "Do stuff with diamonds")
  .addParam("address", "The diamond's address")
  .addOptionalParam("o", "The file to create", "diamond.json")
  .setAction(async (args) => {
   
    let output = await loupe(args.address)

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
    let address = await getAddressFromArgs(args)

    let output1 = await loupe(address)

    let output2 = await getDiamondJson(args.o)

    const differentiator = new DiamondDifferentiator(output1, output2)

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
  .addFlag("skipFunctions", "Only add contract")
  .setAction(
  async (args, hre) => {
    if (args.remote && args.local) {
      return console.log('remote or local, not both')
    }
    const diamondJson = await getDiamondJson(args.o)
    if (args.remote) {
      const sourcify = new SourcifyJS.default('http://localhost:8990')
      let {abi, name} = await sourcify.getABI(args.address, 4)
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
    }
  });

// diamond:remove

// diamond:replace

async function deployAndVerifyFacetsFromDiff(facetsToDeployAndVerify) {
  /**@notice deploy new facets */
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
  
  const res = await verify(4, contracts, json)
  console.log('[OK] Deployed facets verified')
  return contracts
}

// deploy and verify new or changed facets
task("diamond:cut", "Compare the local diamond.json with the remote diamond")
  .addOptionalParam("address", "The diamond's address", "")
  .addOptionalParam("o", "The file to create", "diamond.json")
  .setAction(async (args, hre) => {
    let address = await getAddressFromArgs(args)

    await hre.run("clean")
    await hre.run("compile")

    /**@notice get contracts to deploy by comparing local and remote diamond.json */
    console.log('Louping diamond...')
    let output1 = await loupe(address)
    console.log('[OK] Diamond louped')
    
    const diamondJson = await getDiamondJson(args.o)
    const differentiator = new DiamondDifferentiator(output1, diamondJson)
    const facetsToDeployAndVerify = differentiator.getContractsToDeploy();

    const verifiedFacets = await deployAndVerifyFacetsFromDiff(facetsToDeployAndVerify)

    const facetsToAdd = differentiator.getFunctionsFacetsToAdd()

    /**@notice create functionSelectors for functions needed to add */
    let cut = [];
    for (let f of facetsToAdd) {
      const sourcify = new SourcifyJS.default('http://localhost:8990')
  
      let facetAddress
      if (diamondJson.contracts[f.facet].type === 'remote') {
        facetAddress = diamondJson.contracts[f.facet].address
      } else {
        facetAddress = verifiedFacets.find(vf => vf.name === f.facet).address
      }
      const {abi} = await sourcify.getABI(facetAddress, 4)
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
      const sourcify = new SourcifyJS.default('http://localhost:8990')
  
      let facetAddress
      if (diamondJson.contracts[f.facet].type === 'remote') {
        facetAddress = diamondJson.contracts[f.facet].address
      } else {
        facetAddress = verifiedFacets.find(vf => vf.name === f.facet).address
      }
      const {abi} = await sourcify.getABI(facetAddress, 4)
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
      const sourcify = new SourcifyJS.default('http://localhost:8990')
  
      let facetAddress
      if (diamondJson.contracts[f.facet].type === 'remote') {
        facetAddress = diamondJson.contracts[f.facet].address
      } else {
        facetAddress = verifiedFacets.find(vf => vf.name === f.facet).address
      }
      const {abi} = await sourcify.getABI(facetAddress, 4)
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
    console.log('[OK] Completed diamond cut')

    // and input facet's address and type into diamond.json
  });

module.exports = {};



/** 
 * TODOS:
 * verify DiamondInit contract - not verifying
 * include 'diamond' (w/ address and other info) in diamond.json
 */




