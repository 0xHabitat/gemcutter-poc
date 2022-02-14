const { diff } = require('json-diff');
const _CONTRACTS = 'contracts'
const _FUNCTIONS_SELECTOR = 'functionSelectors'
// TODO: use const to access diamond.json file

module.exports = class DiamondDifferentiator {
  constructor(o1, o2) {
    this.d = diff(o1, o2)
  }
  getFunctionsFacetsToAdd() {
    if (!this.d || !this.d[_FUNCTIONS_SELECTOR]) {
      return []
    }
    let functionsToAdd = Object.keys(this.d[_FUNCTIONS_SELECTOR]).filter(fn => {
      return fn.endsWith('__added')
    })

    let functionsFacetsToAdd = functionsToAdd.map(fn => {
      return {
        fn: `${fn.substring(0, fn.length - '__added'.length)}`,
        facet: this.d[_FUNCTIONS_SELECTOR][fn]
      }
    })

    return functionsFacetsToAdd
  }

  getFunctionsFacetsToRemove() {
    if (!this.d || !this.d[_FUNCTIONS_SELECTOR]) {
      return []
    }
    let functionsToAdd = Object.keys(this.d[_FUNCTIONS_SELECTOR]).filter(fn => {
      return fn.endsWith('__deleted')
    })

    let functionsFacetsToAdd = functionsToAdd.map(fn => {
      return {
        fn: `${fn.substring(0, fn.length - '__deleted'.length)}`,
        facet: this.d[_FUNCTIONS_SELECTOR][fn]
      }
    })

    return functionsFacetsToAdd
  }

  getFunctionFacetsToReplace() {
    if (!this.d || !this.d[_FUNCTIONS_SELECTOR]) {
      return []
    }
    let functionsToReplace = Object.keys(this.d[_FUNCTIONS_SELECTOR]).filter(fn => {
      const facet = this.d[_FUNCTIONS_SELECTOR][fn]
      return typeof facet === 'object'
    })

    let functionsFacetsToReplace = functionsToReplace.map(fn => {
      return {
        fn,
        facet: this.d[_FUNCTIONS_SELECTOR][fn].__new
      }
    })

    return functionsFacetsToReplace
  }

  getContractsToReplace() {
    if (!this.d || !this.d[_CONTRACTS]) {
      return []
    }
    let contractsToReplace = Object.keys(this.d[_CONTRACTS]).filter(fn => {
      return this.d[_CONTRACTS][fn].hasOwnProperty('address__deleted') && this.d[_CONTRACTS][fn].hasOwnProperty('path__added')
    })

    let contractsInfoToReplace = contractsToReplace.map(fn => {
      return {
        name: fn,
        type: 'local',
        path: this.d[_CONTRACTS][fn].path__added
      }
    })

    return contractsInfoToReplace
  }

  getContractsToDeploy() {
    if (!this.d || !this.d[_CONTRACTS]) {
      return []
    }
    let contractsToDeploy = Object.keys(this.d[_CONTRACTS]).filter(fn => {
      return (
        fn.endsWith('__added') && this.d[_CONTRACTS][fn].type === 'local' ||
        (this.d[_CONTRACTS][fn].type && this.d[_CONTRACTS][fn].type.__old === 'remote' && this.d[_CONTRACTS][fn].type.__new === 'local')
      )
    })

    let contractsInfoToDeploy = contractsToDeploy.map(fn => {
      if (this.d[_CONTRACTS][fn].type.__old === 'remote' && this.d[_CONTRACTS][fn].type.__new === 'local') {
        return {
          type: 'local',
          name: fn,
        }
      } else {
        return this.d[_CONTRACTS][fn]
      }
    })

    return contractsInfoToDeploy.concat(this.getContractsToReplace(this.d))
  }
}