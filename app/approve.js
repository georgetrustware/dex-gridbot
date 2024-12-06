const { config } = require("./helpers/config.helper");
const { ethers } = require('ethers');
const tokenAbi = require("./abi/token.json");
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC);
const wallet = new ethers.Wallet(config.PRIVATE_KEY);
const account = wallet.connect(provider);
const baseTokenContract = new ethers.Contract(config.BASE_TOKEN, tokenAbi, account);
const targetTokenContract = new ethers.Contract(config.TARGET_TOKEN, tokenAbi, account);

const approve = async () => {
    try {
        const tx1 = await baseTokenContract.approve(config.ROUTER, ethers.constants.MaxUint256);
        console.log(`🎯  Max Approve Base Token Spend: ${tx1.hash}`);
        await tx1.wait();
        const tx2 = await targetTokenContract.approve(config.ROUTER, ethers.constants.MaxUint256);
        console.log(`🎯  Max Approve Target Token Spend: ${tx2.hash}`);
    } catch(e) {
        console.log(e);
        process.exit();
    }
}

approve();