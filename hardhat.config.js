require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require('dotenv').config();


//tasks
require("./tasks/diamond.js");
require("./tasks/sourcify.js");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
// task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
//   const accounts = await hre.ethers.getSigners();

//   for (const account of accounts) {
//     console.log(account.address);
//   }
// });

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

module.exports = {
  solidity: "0.8.4",
  defaultNetwork: "localhost",
  networks: {
    ropsten: {
      url: `${process.env.ALCHEMY_ROPSTEN_URL}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
    rinkeby: {
      url: `${process.env.ALCHEMY_RINKEBY_URL}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
    mainnet: {
      url: `${process.env.ALCHEMY_MAINNET_URL}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
    localhost: {
      url: "http://localhost:8545",
      /*      
        uses account 0 of the hardhat node to deploy
      */
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
