// const { ethers } = require("hardhat");
const axios = require('axios');
const SourcifyJS = require('sourcify-js');
const { promises } = require("fs");
const { diff } = require('json-diff');
const { getSelectors, FacetCutAction } = require('../scripts/libraries/diamond.js')
require('dotenv').config();

async function loupe(args) {
  const diamondLoupeFacet = await ethers.getContractAt('DiamondLoupeFacet', args.address)
  const facets = await diamondLoupeFacet.facets()

  let contracts = {}
  let diamond = {}

  for await (const facet of facets) {
    const address = facet[0]
    
    const sourcify = new SourcifyJS.default('https://sourcify.dev')

    let abi
    let name
    try {
      const result = await sourcify.filesTree(address, 4);
      const response = await axios.get(result.files[0])
      abi = response.data.output.abi
      name = Object.values(response.data.settings.compilationTarget)[0]
    } catch(e) {
      continue;
    }
    
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

// deploy contracts

// input files and verify validated

async function generateLightFile() {
  const buildInfo = 'artifacts/build-info'
  const files = await promises.readdir(buildInfo)

  const buffer = await promises.readFile(`${buildInfo}/${files[0]}`)
  const string = await buffer.toString()
  const json = JSON.parse(string)
  delete json.output.sources
  for (let path in json.output.contracts) {
      for (let contract in json.output.contracts[path]) {
          delete json.output.contracts[path][contract].abi
          delete json.output.contracts[path][contract].evm
      }
  }
  return json
}

async function inputFiles() {
  let json = await generateLightFile()
  const buffer = Buffer.from(JSON.stringify(json))
  const sourcify = new SourcifyJS.default('https://staging.sourcify.dev')
  const result = await sourcify.inputFiles(buffer)

  let contracts = []
  for (contract of result.contracts) {
    contracts.push({
      name: contract.name,
      verificationId: contract.verificationId,
    })
  }
  return contracts;
}

async function verifyValidated(inputs) {
  // get deployed.diamond.json
  let json = await promises.readFile('./deployed.diamond.json')
  json = JSON.parse(json)
  // match name to input
  let matches = json.map((item, i) => Object.assign({}, item, inputs[i]));
  for (const contract of matches) {
    delete contract.name
  }

  // const sourcify = new SourcifyJS.default('https://staging.sourcify.dev')
  // const result = await sourcify.verifyValidated(matches)

  return matches;

}

task("sourcify:verify", "input files to sourcify")
.setAction(async () => {
  await hre.run("clean")
  await hre.run("compile")

  
  let inputs = await inputFiles()
  let output = await verifyValidated(inputs)
  
  console.log(output)
})



module.exports = {};
