const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const { getSelectors, FacetCutAction, getSelector } = require('./libraries/diamond.js')

async function deployDiamond() {
  const accounts = await ethers.getSigners()
  const contractOwner = accounts[0]

  // deploy DiamondCutFacet
  const DiamondCutFacet = await ethers.getContractFactory('DiamondCutFacet')
  const diamondCutFacet = await DiamondCutFacet.deploy()
  await diamondCutFacet.deployed()

  // deploy Diamond
  const Diamond = await ethers.getContractFactory('Diamond')
  const diamond = await Diamond.deploy(contractOwner.address, diamondCutFacet.address)
  await diamond.deployed()
  console.log('Diamond deployed:', diamond.address)

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = await ethers.getContractFactory('DiamondInit')
  const diamondInit = await DiamondInit.deploy()
  await diamondInit.deployed()

  // deploy facets
  const FacetNames = [
    'DiamondLoupeFacet',
    'OwnershipFacet'
  ]
  const cut = []
  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName)
    const facet = await Facet.deploy()
    await facet.deployed()
    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet)
    })
  }

  // upgrade diamond with facets
  const diamondCut = await ethers.getContractAt('IDiamondCut', diamond.address)
  let tx
  let receipt
  // call to init function
  let functionCall = diamondInit.interface.encodeFunctionData('init')
  tx = await diamondCut.diamondCut(cut, diamondInit.address, functionCall)
  receipt = await tx.wait()
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`)
  }
  return diamond.address
}


async function addAllFacetFunctions(facetName, diamondAddress) {
  const diamondCutFacet = await ethers.getContractAt('DiamondCutFacet', diamondAddress)
  
  const Facet = await ethers.getContractFactory(facetName)
  const facet = await Facet.deploy()
  await facet.deployed()
  const selectors = getSelectors(facet)
  tx = await diamondCutFacet.diamondCut(
    [{
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: selectors
    }],
    ethers.constants.AddressZero, '0x', { gasLimit: 800000 })
  receipt = await tx.wait()
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`)
  }
  const diamondLoupeFacet = await ethers.getContractAt('DiamondLoupeFacet', diamondAddress)
  result = await diamondLoupeFacet.facetFunctionSelectors(facet.address)
  assert.sameMembers(result, selectors)

  console.log(`${facetName} facet added`)
  return {
    facet: await ethers.getContractAt(facetName, diamondAddress),
    address: facet.address
  }
}

async function removeFacetFunctions(facetName, functionsToRemove, diamondAddress) {
  const facet = await ethers.getContractAt(facetName, diamondAddress)
  const selectors = getSelectors(facet).get(functionsToRemove)

  const diamondCutFacet = await ethers.getContractAt('DiamondCutFacet', diamondAddress)
  const tx = await diamondCutFacet.diamondCut(
    [{
      facetAddress: ethers.constants.AddressZero,
      action: FacetCutAction.Remove,
      functionSelectors: selectors
    }],
    ethers.constants.AddressZero, '0x', { gasLimit: 800000 })
  const receipt = await tx.wait()
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`)
  }
}

describe("Diamond test", function () {
  let diamondAddress
  let test1Address
  let test1FacetDiamond
  let test2FacetDiamond
  it("Should deploy Test1Facet and call test1Func10 returning 'ciao'", async function () {
    /* global ethers */
    /* eslint prefer-const: "off" */

    diamondAddress = await deployDiamond()

    const { address, facet } = await addAllFacetFunctions('Test1Facet', diamondAddress)
    test1Address = address
    test1FacetDiamond = facet
    const res = await test1FacetDiamond.test1Func10()

    assert.equal(res.toString(), 'ciao')

  });

  it("Should set value in DiamondStorage from Facet1 and Facet2 should read it", async function () {
    /* global ethers */
    /* eslint prefer-const: "off" */

    await test1FacetDiamond.test1Func1()

    await tx.wait()

    const { facet } = await addAllFacetFunctions('Test2Facet', diamondAddress)
    test2FacetDiamond = facet
    console.log(getSelectors(facet))
    /* console.log(Object.keys(test2FacetDiamond.interface.functions).map(fn => {
      return getSelector(fn)
    })) */
    
    const res = await test2FacetDiamond.test2Func1()

    assert.equal(res.toString(), 1)

  });

  it('Should remove test1Func2 function', async () => {

    await removeFacetFunctions('Test1Facet', ['test1Func2()'], diamondAddress)

    const diamondLoupeFacet = await ethers.getContractAt('DiamondLoupeFacet', diamondAddress)
    const result = await diamondLoupeFacet.facetFunctionSelectors(test1Address)
    assert.equal(result.length, 2)
  })

});
