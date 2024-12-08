const { config } = require("./helpers/config.helper");
const { ethers } = require('ethers');
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)"
];
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC);
const wallet = new ethers.Wallet(config.PRIVATE_KEY);
const account = wallet.connect(provider);
const baseTokenContract = new ethers.Contract(config.BASE_TOKEN, ERC20_ABI, account);
const targetTokenContract = new ethers.Contract(config.TARGET_TOKEN, ERC20_ABI, account);

const approve = async () => {
    try {
        const tx1 = await baseTokenContract.approve(config.SMART_ROUTER, ethers.constants.MaxUint256);
        console.log(`🎯  Max Approve Base Token Spend: ${tx1.hash}`);
        await tx1.wait();
        const tx2 = await targetTokenContract.approve(config.SMART_ROUTER, ethers.constants.MaxUint256);
        console.log(`🎯  Max Approve Target Token Spend: ${tx2.hash}`);
    } catch(e) {
        console.log(e);
        process.exit();
    }
}

approve();