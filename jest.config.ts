export default {
  clearMocks: true,
  collectCoverage: true,
  coveragePathIgnorePatterns: ["/node_modules/", "/lib/", "/module/"],
  coverageProvider: "v8",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/lib/", "/module/"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
};
