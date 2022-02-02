// const { ethers } = require("hardhat");
const SourcifyJS = require('sourcify-js');
const { promises } = require("fs");
require('dotenv').config();

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

async function inputFiles(sourcify) {
  let json = await generateLightFile()
  const buffer = Buffer.from(JSON.stringify(json))
  const result = await sourcify.inputFiles(buffer)

  let contracts = []
  for (let contract of result.contracts) {
    contracts.push({
      name: contract.name,
      verificationId: contract.verificationId,
    })
  }
  return contracts;
}

async function verifyValidated(sourcify, inputs) {
  // get deployed.diamond.json
  let json = await promises.readFile('./deployed.diamond.json')
  json = JSON.parse(json)
  // match name to input
  let matches = json.map((item, i) => Object.assign({}, item, inputs[i]));
  for (let contract of matches) {
    delete contract.name
  }

  const result = await sourcify.verifyValidated(matches);

  return result;

}

task("sourcify:verify", "input files to sourcify")
.setAction(async () => {
  await hre.run("clean")
  await hre.run("compile")

  const sourcify = new SourcifyJS.default()

  let json = await generateLightFile()
  const buffer = Buffer.from(JSON.stringify(json))
  let diamondjson = await promises.readFile('./deployed.diamond.json')
  diamondjson = JSON.parse(diamondjson)
  const result = await sourcify.verify(4, diamondjson, buffer)

  // let inputs = await inputFiles(sourcify)
  // let output = await verifyValidated(sourcify, inputs)
  
  console.log(result)
})

task("sourcify:get", "input files to sourcify")
.setAction(async () => {

  const sourcify = new SourcifyJS.default()
  const result = await sourcify.getABI('0xcdbD9188d1788AFC260785B34A005e2ABadd7868', 4);

  console.log(JSON.stringify(result, null, 2))
})

module.exports = {};
