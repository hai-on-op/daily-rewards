module.exports = {
  roots: ["<rootDir>/src"],
  testMatch: [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)",
  ],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/src/legacy/"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
};
