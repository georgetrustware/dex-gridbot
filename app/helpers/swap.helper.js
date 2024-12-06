const { config } = require("./config.helper");
const { ethers } = require('ethers');
const SMART_ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];
const FACTORY_ABI = [
    "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
];

const POOL_ABI = [
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function liquidity() external view returns (uint128)"
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
        
        this.factory = new ethers.Contract(
            config.FACTORY,
            FACTORY_ABI,
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

    async getPool(tokenA, tokenB, fee) {
        const poolAddress = await this.factory.getPool(tokenA, tokenB, fee);
        if (poolAddress === ethers.constants.AddressZero) {
            throw new Error('Pool does not exist');
        }
        return new ethers.Contract(poolAddress, POOL_ABI, this.provider);
    }
    
    calculatePrices(sqrtPriceX96, decimalsA, decimalsB) {
        const price = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
        const directPrice = price * (10 ** (decimalsA - decimalsB));
        const invertedPrice = 1 / directPrice;
        
        return {
            directPrice,
            invertedPrice
        };
    }

    formatPrice(price) {
        if (price < 0.0001) {
            return price.toExponential(6);
        } else if (price < 1) {
            return price.toFixed(8);
        } else if (price < 1000) {
            return price.toFixed(2);
        } else {
            return price.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
    }
    
    async approveToken(tokenAddress, amount) {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
        const currentAllowance = await token.allowance(
            this.signer.address,
            config.SMART_ROUTER
        );
        
        if (currentAllowance.lt(amount)) {
            console.log('📗 Approving token spend');
            const approveTx = await token.approve(
                config.SMART_ROUTER,
                ethers.constants.MaxUint256
            );
            await approveTx.wait();
            return approveTx;
        }
        return null;
    }
    
    async getQuote(tokenIn, tokenOut, amountIn, fee = config.POOL_FEE) {
        try {
            // Get pool and token information
            const pool = await this.getPool(tokenIn, tokenOut, fee);
            const [tokenInInfo, tokenOutInfo] = await Promise.all([
                this.getTokenInfo(tokenIn),
                this.getTokenInfo(tokenOut)
            ]);
            
            // Get pool state
            const [slot0, liquidity, token0] = await Promise.all([
                pool.slot0(),
                pool.liquidity(),
                pool.token0()
            ]);
            
            const sqrtPriceX96 = slot0.sqrtPriceX96;
            
            // Check if tokenIn is token0
            const isToken0 = tokenIn.toLowerCase() === token0.toLowerCase();
            
            // Calculate prices
            const { directPrice, invertedPrice } = this.calculatePrices(
                sqrtPriceX96,
                tokenInInfo.decimals,
                tokenOutInfo.decimals
            );
            
            // Calculate expected output
            const amountInDecimal = Number(ethers.utils.formatUnits(amountIn, tokenInInfo.decimals));
            let expectedOutput;
            
            if (isToken0) {
                expectedOutput = amountInDecimal * directPrice;
            } else {
                expectedOutput = amountInDecimal / invertedPrice;
            }
            
            const amountOut = ethers.utils.parseUnits(
                expectedOutput.toFixed(tokenOutInfo.decimals),
                tokenOutInfo.decimals
            );

            // Format prices for display
            const formattedDirectPrice = this.formatPrice(directPrice);
            const formattedInvertedPrice = this.formatPrice(invertedPrice);

            return {
                amountOut,
                sqrtPriceX96,
                prices: {
                    // Price of 1 tokenIn in terms of tokenOut
                    [tokenInInfo.symbol]: `1 ${tokenInInfo.symbol} = ${formattedDirectPrice} ${tokenOutInfo.symbol}`,
                    // Price of 1 tokenOut in terms of tokenIn
                    [tokenOutInfo.symbol]: `1 ${tokenOutInfo.symbol} = ${formattedInvertedPrice} ${tokenInInfo.symbol}`,
                    raw: {
                        direct: directPrice,
                        inverted: invertedPrice
                    }
                },
                liquidity: liquidity.toString(),
                tokenInInfo,
                tokenOutInfo
            };
            
        } catch (error) {
            console.error('Error getting quote:', error);
            throw error;
        }
    }
    
    async executeSwap(tokenIn, tokenOut, amountIn, recipient) {
        try {
            const quote = await this.getQuote(tokenIn, tokenOut, amountIn);
            await this.approveToken(tokenIn, amountIn);
            const params = {
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: config.POOL_FEE,
                recipient: recipient,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            };
            const tx = await this.smartRouter.exactInputSingle(params);
            const receipt = await tx.wait();
            return receipt;
        } catch (error) {
            console.error('Error executing swap:', error);
            throw error;
        }
    }
}
module.exports = SwapHelper;
