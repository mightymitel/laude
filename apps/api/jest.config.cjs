/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    testEnvironment: 'node',
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            { tsconfig: { module: 'CommonJS', moduleResolution: 'node', esModuleInterop: true, allowJs: true } },
        ],
    },
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@laude/([^/]+)$': '<rootDir>/../../packages/$1/src',
    },
};
