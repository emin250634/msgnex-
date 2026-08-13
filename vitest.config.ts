const { defineConfig } = require("vitest/config")

module.exports = defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "server-only": "./src/test/shims/server-only.ts",
    },
  },
})
