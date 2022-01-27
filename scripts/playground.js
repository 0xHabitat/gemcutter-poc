// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
// const hre = require("hardhat");


var request = require('request');
var fs = require('fs');

async function main() {
  var options = {
    'method': 'POST',
    'url': 'https://staging.sourcify.dev/server/input-files',
    'headers': {
    },
    formData: {
      'files': {
        'value': fs.createReadStream('./artifacts/build-info/301076d3e74df8298d7dfddc4f049a6b.json'),
        'options': {
          'filename': '301076d3e74df8298d7dfddc4f049a6b.json',
          'contentType': null
        }
      }
    }
  };
  request(options, function (error, response) {
    if (error) throw new Error(error);
    console.log(response.body);
    console.log(response)
  });
  
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
