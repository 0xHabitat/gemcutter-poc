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
      facet
    })
    console.log(`[OK] Facet '${contract.name}' deployed with address ${facet.address}`)
  }

  console.log('Starting verification process on Sourcify...')
  /**@notice verify contracts */
  let json = await generateLightFile()
  await verify(4, contracts, json)
  console.log('[OK] Deployed facets verified')
  return contracts
}

// deploy and verify new or changed facets
task("diamond:cut", "Compare the local diamond.json with the remote diamond")
  .addParam("address", "The diamond's address")
  .addOptionalParam("o", "The file to create", "diamond.json")
  .setAction(async (args, hre) => {
    await hre.run("clean")
    await hre.run("compile")

    /**@notice get contracts to deploy by comparing local and remote diamond.json */
    console.log('Louping diamond...')
    let output1 = await loupe(args)
    console.log('[OK] Diamond louped')
    let output2 = await fs.promises.readFile('./' + args.o)
    const differentiator = new DiamondDifferentiator(output1, JSON.parse(output2.toString()))
    const facetsToDeployAndVerify = differentiator.getContractsToDeploy();

    const verifiedFacets = await deployAndVerifyFacetsFromDiff(facetsToDeployAndVerify)

    const facetsToAdd = differentiator.getFunctionsFacetsToAdd()
    const facetsToRemove = differentiator.getFunctionsFacetsToRemove()
    const facetsToReplace = differentiator.getFunctionFacetsToReplace()

    /**@notice create functionSelectors for functions needed to add */
    let cut = []
    await facetsToAdd.forEach(async f => {

      let facetVerified = verifiedFacets.find(facet => facet.name === f.facet)
      let fnNamesSelectors = await getFunctionsNamesSelectorsFromFacet(facetVerified.facet)
      let fn = fnNamesSelectors.find(ns => ns.name === f.fn)

      let cutAddressIndex = cut.findIndex(c => c.facetAddress === facetVerified.facet.address && c.action === FacetCutAction.Add)
      if(cutAddressIndex === -1) {
        cut.push({
          facetAddress: facetVerified.facet.address,
          action: FacetCutAction.Add,
          functionSelectors: [fn.selector]
        })
      } else {
        cut[cutAddressIndex].functionSelectors.push(fn.selector)
      }
    })

    console.log(cut)

    /**@notice cut in facets */
    // TODO: get diamondInitAddress from somewhere else
    let diamondInitAddress;
    let deployments = await fs.promises.readFile('./deployments.json');
    deployments = JSON.parse(deployments)
    for (const deployed of deployments) {
      if (deployed.name === 'DiamondInit') {
        diamondInitAddress = deployed.address
      }
    }
    //get diamondInit interface
    let diamondInit = await hre.ethers.getContractFactory('DiamondInit')

    // do the cut
    //console.log('Diamond Cut:', cut)
    const diamondCut = await ethers.getContractAt('IDiamondCut', args.address)
    let tx
    let receipt
    // call to init function
    let functionCall = diamondInit.interface.encodeFunctionData('init')
    
    /* tx = await diamondCut.diamondCut(cut, diamondInitAddress, functionCall, {gasLimit: 10000000})
    console.log('Diamond cut tx: ', tx.hash)

    receipt = await tx.wait()
    if (!receipt.status) {
      throw Error(`Diamond upgrade failed: ${tx.hash}`)
    }
    console.log('Completed diamond cut') */

    // and input facet's address and type into diamond.json
  });

  async function getFunctionsNamesSelectorsFromFacet(contract) {
    const signatures = Object.keys(contract.interface.functions)
    const names = signatures.reduce((acc, val) => {
      if (val !== 'init(bytes)') {
        acc.push({
          name: val.substr(0, val.indexOf('(')),
          selector: contract.interface.getSighash(val)
        })
      }
      return acc
    }, [])
    return names
  }

  task("diamond:selector", "Compare the local diamond.json with the remote diamond")
  .setAction(async (args, hre) => {
    console.log(await getFunctionsNamesSelectorsFromAddress('LocalFacet', '0x3C75338A14c42a20440f4240f46839853131dFED'))
  });

module.exports = {};



/** 
 * TODOS:
 * verify DiamondInit contract - not verifying
 * include 'diamond' (w/ address and other info) in diamond.json
 */




