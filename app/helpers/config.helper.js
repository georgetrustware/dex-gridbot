require("dotenv").config();
const ethers = require("ethers");

module.exports = {
    "config": {
        BLOCK_DELTA: Number(process.env.BLOCK_DELTA) || 10,
        BASE_TOKEN: ethers.utils.getAddress(process.env.BASE_TOKEN),
        FACTORY: ethers.utils.getAddress(process.env.FACTORY),
        GRID_TOTAL: ethers.utils.parseUnits(process.env.GRID_TOTAL),
        GRID_AMOUNT: ethers.utils.parseUnits(process.env.GRID_AMOUNT),
        GRID_PERCENT: Number(process.env.GRID_PERCENT),
        GRID_FEE:  Number(process.env.GRID_FEE),
        PRIVATE_KEY: process.env.PRIVATE_KEY,
        POOL_FEE: Number(process.env.POOL_FEE) || 500,
        TARGET_TOKEN: ethers.utils.getAddress(process.env.TARGET_TOKEN),
        WS: process.env.WS,
        SMART_ROUTER: ethers.utils.getAddress(process.env.SMART_ROUTER),
    },
}
