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
    let diamond = {}

    for await (const facet of facets) {
      const address = facet[0]

      const sourcify = new SourcifyJS.default()

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
        diamond[fn] = name
      })
    }

    return {
      diamond,
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
    const sourcify = new SourcifyJS.default('https://sourcify.dev')
    const result = await sourcify.verify(chaindId, contracts, buffer)

    return result;
  },

  createDiamondFileFromSources() {

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
        type: 'local',
        path: `contracts/facets/${name}.sol` // TODO: fix this
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
}