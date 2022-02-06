const SourcifyJS = require('sourcify-js');
const fs = require("fs");
const { promises } = fs

module.exports = {
  async getDiamondJson(file) {
    try {
      let diamondFile = await fs.promises.readFile(`./${file}`)
      return JSON.parse(diamondFile)
    } catch(e) {
      return false
    }
  },
  async setDiamondJson(json, filename) {
    try {
      await promises.writeFile('./' + filename, JSON.stringify(json, null, 2));
    } catch(e) {
      console.log(e)
      return false
    }
  },
  async loupe(args) {
    const diamondLoupeFacet = await ethers.getContractAt('DiamondLoupeFacet', args.address)
    const facets = await diamondLoupeFacet.facets()

    let contracts = {}
    let functionSelectors = {}

    for await (const facet of facets) {
      const address = facet[0]

      const sourcify = new SourcifyJS.default('http://localhost:8990')

      const {abi, name} = await sourcify.getABI(address, 4)

      
      let functions = []
      for (const obj of abi) {
        if (obj.type === 'function') {
          functions.push(obj.name)
        }
      }

      contracts[name] = {
        name,
        address,
        type: 'remote',
      }

      functions.forEach(fn => {
        functionSelectors[fn] = name
      })
    }

    return {
      address: args.address,
      chaindId: 4, // TODO: how to get chainId
      functionSelectors,
      contracts
    }

  },
  async generateLightFile() {
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
  },
  
  async verify(chaindId, contracts, json) {
    // let json = await this.generateLightFile()
    const buffer = Buffer.from(JSON.stringify(json))
    const sourcify = new SourcifyJS.default('http://localhost:8990')
    const result = await sourcify.verify(chaindId, contracts, buffer)

    return result;
  },

  createDiamondFileFromSources() {

    const facetsPath = "/contracts/facets/";
    let files = fs.readdirSync("." + facetsPath);

    let contracts = {}
    let functionSelectors = {}

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
        type: 'local',
      }

      functions.forEach(fn => {
        functionSelectors[fn] = name
      })

    }

    return {
      functionSelectors,
      contracts
    }
  },
  async getFunctionsNamesSelectorsFromFacet(contract) {
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
}