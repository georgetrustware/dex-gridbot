require("dotenv").config();
const ethers = require("ethers");

function safeGetAddress(envVar, varName) {
    if (!envVar) {
        throw new Error(`❌ Missing environment variable: ${varName}`);
    }
    return ethers.utils.getAddress(envVar);
}

module.exports = {
    config: {
        BLOCK_DELTA: Number(process.env.BLOCK_DELTA) || 10,
        BASE_TOKEN: safeGetAddress(process.env.BASE_TOKEN, "BASE_TOKEN"),
        TARGET_TOKEN: safeGetAddress(process.env.TARGET_TOKEN, "TARGET_TOKEN"),
        FACTORYV3: safeGetAddress(process.env.FACTORYV3, "FACTORYV3"),
        FACTORYV2: safeGetAddress(process.env.FACTORYV2, "FACTORYV2"),
        SMART_ROUTER: safeGetAddress(process.env.SMART_ROUTER, "SMART_ROUTER"),
        GRID_TOTAL: ethers.utils.parseUnits(process.env.GRID_TOTAL, "ether"),
        GRID_AMOUNT: ethers.utils.parseUnits(process.env.GRID_AMOUNT, "ether"),
        GRID_PERCENT: Number(process.env.GRID_PERCENT),
        GRID_FEE: Number(process.env.GRID_FEE),
        PRIVATE_KEY: process.env.PRIVATE_KEY,
        POOL_FEE: Number(process.env.POOL_FEE) || 3500,
        WS: process.env.WS,
    },
};
