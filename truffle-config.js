module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",     // Ganache CLI runs here
      port: 8545,            // Default Ganache CLI port
      network_id: "*",       // Match any network ID
    },
  },

  mocha: {
    // timeout: 100000
  },

  compilers: {
    solc: {
      version: "0.8.21",    // Exact compiler version you're using
    }
  }
};
