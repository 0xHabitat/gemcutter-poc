/* global ethers */
/* eslint prefer-const: "off" */
const SourcifyJS = require('sourcify-js');
const axios = require('axios');

const DIAMOND_ADDRESS = '0xAE8EB302aF6765e91e6c639236Ac8a9F1aec7cc9'
const CHAIN_ID = '4'

const { getSelectors, FacetCutAction } = require('./libraries/diamond.js')
const { promises } = require("fs");

async function loupe(sourcify, address, chainId) {
  
  // const habitatDiamond = await sourcify.filesTree(address, chainId);
  // let files = await axios.get(`https://sourcify.dev/server/files/${chainId}/${address}`);
  // let sourcecode;
  // for (const url of habitatDiamond.files) {
  //   const filename = url.substring(url.lastIndexOf('/')+1);
  //   sourcecode = ethers.getContractAt(filename[2])
  // }

  // let metadata = files.data[0]
  // const tokenArtifact = await artifacts.readArtifact("Token");
  // const token = new ethers.Contract(address, tokenArtifact.abi, ethers.provider);

  // const diamond = ethers.getContractAt()
  // return sourcecode;

}


async function main () {
  const sourcify = new SourcifyJS.default('https://sourcify.dev')
  const accounts = await ethers.getSigners()
  const contractOwner = accounts[0]

  const newDiamondName = 'myDiamond';

  const d = await ethers.getContractAt('Diamond', DIAMOND_ADDRESS);

  console.log(d)

  const diamond = new ethers.Contract( DIAMOND_ADDRESS , d.abi , contractOwner )
  console.log(diamond)
  diamond.attach( newDiamondName )

  return newDiamondName

  // get habitat diamond and facets
  // const d = await loupe(sourcify, DIAMOND_ADDRESS, CHAIN_ID);
  // console.log(d)
  
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error)
      process.exit(1)
    })
}

exports.main = main
