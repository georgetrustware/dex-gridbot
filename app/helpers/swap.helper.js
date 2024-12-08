const { config } = require("./config.helper");
const { ethers } = require("ethers");

const SMART_ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];

const FACTORYV3_ABI = [
    "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
];

const FACTORYV2_ABI = [
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

const POOLV3_ABI = [
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)"
];

const PAIRV2_ABI = [
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)"
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)"
];

class SwapHelper {
    constructor(provider, signer) {
        this.provider = provider;
        this.signer = signer;

        this.smartRouter = new ethers.Contract(
            config.SMART_ROUTER,
            SMART_ROUTER_ABI,
            signer
        );

        this.factoryV3 = new ethers.Contract(
            config.FACTORYV3,
            FACTORYV3_ABI,
            provider
        );

        this.factoryV2 = new ethers.Contract(
            config.FACTORYV2,
            FACTORYV2_ABI,
            provider
        );
    }

    async getTokenContract(tokenAddress) {
        return new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    }

    async getTokenInfo(tokenAddress) {
        const token = await this.getTokenContract(tokenAddress);
        const [decimals, symbol, balance] = await Promise.all([
            token.decimals(),
            token.symbol(),
            token.balanceOf(this.signer.address)
        ]);
        return { decimals, symbol, balance };
    }

    async getV3Pool(tokenA, tokenB) {
        const feeTiers = [100, 500, 3000, 10000];
        for (let fee of feeTiers) {
            console.log(`🔍 Checking V3 pool for tokens:\n  TokenA: ${tokenA}\n  TokenB: ${tokenB}\n  Fee Tier: ${fee}`);
            const poolAddress = await this.factoryV3.getPool(tokenA, tokenB, fee);
            if (poolAddress !== ethers.constants.AddressZero) {
                console.log(`✅ V3 Pool found with fee tier ${fee}: ${poolAddress}`);
                return new ethers.Contract(poolAddress, POOLV3_ABI, this.provider);
            }
        }
        return null;
    }

    async getV2Pair(tokenA, tokenB) {
        console.log(`🔍 Checking V2 pair for tokens:\n  TokenA: ${tokenA}\n  TokenB: ${tokenB}`);
        const pairAddress = await this.factoryV2.getPair(tokenA, tokenB);
        if (pairAddress !== ethers.constants.AddressZero) {
            console.log(`✅ V2 Pair found: ${pairAddress}`);
            return new ethers.Contract(pairAddress, PAIRV2_ABI, this.provider);
        }
        return null;
    }

    async getPoolOrPair(tokenA, tokenB) {
        let pool = await this.getV3Pool(tokenA, tokenB);
        if (pool) return { type: 'V3', contract: pool };

        let pair = await this.getV2Pair(tokenA, tokenB);
        if (pair) return { type: 'V2', contract: pair };

        throw new Error("❌ No V2 or V3 pool/pair found for these tokens.");
    }

    calculatePrices(sqrtPriceX96, decimalsA, decimalsB) {
        if (!sqrtPriceX96 || sqrtPriceX96.eq(0)) {
            throw new Error("❌ Invalid sqrtPriceX96 value.");
        }

        const price = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
        const directPrice = price * 10 ** (decimalsA - decimalsB);
        const invertedPrice = directPrice !== 0 ? 1 / directPrice : 0;

        return {
            directPrice,
            invertedPrice
        };
    }

    async getQuote(tokenIn, tokenOut, amountIn) {
    const poolData = await this.getPoolOrPair(tokenIn, tokenOut);

    if (poolData.type === 'V3') {
        const pool = poolData.contract;
        const [tokenInInfo, tokenOutInfo] = await Promise.all([
            this.getTokenInfo(tokenIn),
            this.getTokenInfo(tokenOut)
        ]);

        const slot0 = await pool.slot0();
        const sqrtPriceX96 = slot0.sqrtPriceX96;
        const { directPrice, invertedPrice } = this.calculatePrices(
            sqrtPriceX96,
            tokenInInfo.decimals,
            tokenOutInfo.decimals
        );

        const amountInDecimal = Number(ethers.utils.formatUnits(amountIn, tokenInInfo.decimals));
        const amountOutValue = amountInDecimal * directPrice;
        const amountOut = ethers.utils.parseUnits(
            amountOutValue.toFixed(tokenOutInfo.decimals),
            tokenOutInfo.decimals
        );

        return {
            amountOut,
            prices: { direct: directPrice, inverted: invertedPrice },
            tokenInInfo,
            tokenOutInfo
        };
    } else if (poolData.type === 'V2') {
        const pair = poolData.contract;
        const reserves = await pair.getReserves();
        const token0 = await pair.token0();
        const [tokenInInfo, tokenOutInfo] = await Promise.all([
            this.getTokenInfo(tokenIn),
            this.getTokenInfo(tokenOut)
        ]);

        let reserveIn, reserveOut;
        if (tokenIn.toLowerCase() === token0.toLowerCase()) {
            reserveIn = reserves.reserve0;
            reserveOut = reserves.reserve1;
        } else {
            reserveIn = reserves.reserve1;
            reserveOut = reserves.reserve0;
        }

        console.log(`🔍 Reserves: reserveIn=${reserveIn.toString()}, reserveOut=${reserveOut.toString()}`);

        // Convert reserves to BigNumber with correct decimals
        const reserveInBN = ethers.BigNumber.from(reserveIn);
        const reserveOutBN = ethers.BigNumber.from(reserveOut);

        // Apply 0.3% fee for Uniswap V2
        const amountInWithFee = amountIn.mul(997);
        const numerator = amountInWithFee.mul(reserveOutBN);
        const denominator = reserveInBN.mul(1000).add(amountInWithFee);
        const amountOut = numerator.div(denominator);

        console.log(`🔍 Calculated amountOut: ${amountOut.toString()}`);

        return {
            amountOut,
            prices: { 
                direct: parseFloat(ethers.utils.formatUnits(amountOut, tokenOutInfo.decimals)) / 
                        parseFloat(ethers.utils.formatUnits(amountIn, tokenInInfo.decimals)) 
            },
            tokenInInfo,
            tokenOutInfo
        };
    }

    throw new Error("❌ Unsupported pool type.");
}


    async approveToken(tokenAddress, amount) {
        const token = await this.getTokenContract(tokenAddress);
        const currentAllowance = await token.allowance(this.signer.address, config.SMART_ROUTER);

        if (currentAllowance.lt(amount)) {
            console.log("📗 Approving token spend");
            const approveTx = await token.approve(config.SMART_ROUTER, ethers.constants.MaxUint256);
            await approveTx.wait();
        }
    }
}

module.exports = SwapHelper;

