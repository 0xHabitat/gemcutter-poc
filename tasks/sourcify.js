//const { ethers } = require("hardhat");
require('dotenv').config();
const axios = require('axios');
const {promises} = require("fs");

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

task("sourcify:prepare", "clone diamond")
  /* .addParam("address", "The diamond's address")
  .addOptionalParam("o", "The file to create", "") */
  .setAction(async (args, hre) => {
    await hre.run("clean")
    await hre.run("compile")
    let json = await generateLightFile()
    const buffer = Buffer.from(JSON.stringify(json))
    const sourcify = new SourcifyJS('https://staging.sourcify.dev')
    const result = await sourcify.verify(
    4, // chian Id
    [
        {
            name: 'Diamond',
            address: '0xcdbD9188d1788AFC260785B34A005e2ABadd7868'
        }
    ], // contracts to verify
    // buffer // file containing sources and metadata
)
  });

module.exports = {};