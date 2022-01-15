const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const { getSelectors, FacetCutAction } = require('./libraries/diamond.js')

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

async function addFacet(facetName, diamondAddress) {
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
  return await ethers.getContractAt(facetName, diamondAddress)
}

describe("Diamond test", function () {
  let diamondAddress
  let test1FacetDiamond
  let test2FacetDiamond
  it("Should deploy Test1Facet and call test1Func10 returning 'ciao'", async function () {
    /* global ethers */
    /* eslint prefer-const: "off" */

    diamondAddress = await deployDiamond()

    test1FacetDiamond = await addFacet('Test1Facet', diamondAddress)
    const res = await test1FacetDiamond.test1Func10()

    assert.equal(res.toString(), 'ciao')

  });

  it("Facet1 should set value in DiamondStorage and Facet2 should read it", async function () {
    /* global ethers */
    /* eslint prefer-const: "off" */
    
    await test1FacetDiamond.test1Func1()

    await tx.wait()

    test2FacetDiamond = await addFacet('Test2Facet', diamondAddress)
    const res = await test2FacetDiamond.test2Func1()

    assert.equal(res.toString(), 1)

  });
});
