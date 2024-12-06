const { config } = require("./helpers/config.helper");
const { ethers } = require('ethers');
const SwapHelper = require("./helpers/swap.helper");

let provider;
let wallet;
let account;
let swapHelper;
let grid; 
let lastGridPrice;
let gridMovement;
let gridHigherPrice;
let gridLowerPrice;
let init = 0;

async function connect() {
    provider = new ethers.providers.WebSocketProvider(config.WS);
    wallet = new ethers.Wallet(config.PRIVATE_KEY);
    account = wallet.connect(provider);
    swapHelper = new SwapHelper(provider, account);
    let keepAliveInterval;
    let pingTimeout;

    provider._websocket.on("open", () => {
        keepAliveInterval = setInterval(() => {
          provider._websocket.ping();
          // Use `WebSocket#terminate()`, which immediately destroys the connection,
          // instead of `WebSocket#close()`, which waits for the close timer.
          // Delay should be equal to the interval at which your server
          // sends out pings plus a conservative assumption of the latency.
          pingTimeout = setTimeout(() => {
            provider._websocket.terminate();
          }, 30000);
        }, 15000);
      });
      provider._websocket.on("close", async (error) => {
        console.log("☢️ WebSocket Closed...Terminating...");
        console.log(error);
        clearInterval(keepAliveInterval);
        clearTimeout(pingTimeout);
        process.exit();
      });
      provider._websocket.on("error", async (error) => {
        console.log("☢️ Error. Terminating...");
        console.log(error);
        clearInterval(keepAliveInterval);
        clearTimeout(pingTimeout);
        process.exit()
      });
      provider._websocket.on("pong", () => {
        clearInterval(pingTimeout);
      });
}

const run = async () => {
    const base = await GetBaseBalance();
    const startingPrice = await GetTokenPrice();
    const token = await GetTokenBalance();
    const holding = await GetHoldingAmount();
    if (!init) {
        grid = await GetGridAmount();
        lastGridPrice = Number(startingPrice.value);
        gridMovement = lastGridPrice * process.env.GRID_PERCENT / 100;
        gridHigherPrice = lastGridPrice + gridMovement + config.GRID_FEE;
        gridLowerPrice = lastGridPrice - gridMovement - config.GRID_FEE;
        if (Number(token.value) < Number(holding.value)) {
            console.log(`☢️  Wallet to swap into at least ${holding.value} ${holding.symbol}`);
            process.exit();
        }
        init = true;
    } 
    console.log("--------- 💎💎 Grid Bot 💎💎 ---------");
    console.log(`💰 ${base.symbol} Balance: ${base.value}`);
    console.log(`📒 ${token.symbol} Balance: ${token.value}`);
    console.log(`💰 ${holding.symbol} Held: ${holding.value}`);
    console.log(`🏆 ${grid.symbol} Per Grid: ${grid.value}`);
    console.log(`📕 Sell at Price: \$${gridHigherPrice}`);
    console.log(`📗 Buy at Price: \$${gridLowerPrice}`);
    provider.on("block", async (block) => {
        let mod = block % config.BLOCK_DELTA;
        if (mod === 0) {
            const tokenPrice = await GetTokenPrice();
            const currentPrice = Number(tokenPrice.value);
            console.log(`💵 Current ${tokenPrice.symbol} Price \$${currentPrice}`);
            if (currentPrice <= gridLowerPrice) {
                gridLowerPrice = currentPrice - gridMovement - config.GRID_FEE;
                console.log(`💰 Bought at: \$${currentPrice}`);
                console.log(`📗 Next Buy at: \$${gridLowerPrice}`);
                await buyToken();
            } else if (currentPrice >= gridHigherPrice) {
                gridHigherPrice = currentPrice + gridMovement + config.GRID_FEE;
                console.log(`💰 Sold at: \$${currentPrice}`);
                console.log(`📕 Next Sell: \$${gridHigherPrice}`);
                await sellToken();
            }
        }
    });
}

const GetTokenPrice = async () => { 
    try {
      let amount = ethers.utils.parseUnits("1", "ether");
      const quote = await swapHelper.getQuote(config.BASE_TOKEN, config.TARGET_TOKEN, amount);
      return { 
        value: quote.prices.raw.inverted, 
        symbol: quote.tokenOutInfo.symbol 
      }
    } catch(e) {
      console.log(e);
    }
  }
  
  const GetTokenBalance = async () => { 
    try {
      const tokenInfo = await swapHelper.getTokenInfo(config.TARGET_TOKEN);
      return { 
        value: ethers.utils.formatUnits(tokenInfo.balance, tokenInfo.decimals),
        symbol: tokenInfo.symbol
      }
    } catch(e) {
      console.log(e);
    }
  }
  
  const GetBaseBalance = async () => { 
    try {
        const tokenInfo = await swapHelper.getTokenInfo(config.BASE_TOKEN);
        return { 
          value: ethers.utils.formatUnits(tokenInfo.balance, tokenInfo.decimals),
          symbol: tokenInfo.symbol
        }
    } catch(e) {
      console.log(e);
    }
  }
  
  const GetHoldingAmount = async () => { 
    try {
        const quote = await swapHelper.getQuote(config.BASE_TOKEN, config.TARGET_TOKEN, config.GRID_TOTAL.div(2));
        return { 
            value: ethers.utils.formatUnits(quote.amountOut, quote.tokenOutInfo.decimals), 
            symbol: quote.tokenOutInfo.symbol
        }
    } catch(e) {
        console.log(e);
    }
  }
  
  const GetGridAmount = async () => { 
    try {
        const quote = await swapHelper.getQuote(config.BASE_TOKEN, config.TARGET_TOKEN, config.GRID_AMOUNT);
        return { 
            value: ethers.utils.formatUnits(quote.amountOut, quote.tokenOutInfo.decimals), 
            symbol: quote.tokenOutInfo.symbol
        }
    } catch(e) {
      console.log(e);
    }
  }
  
  const buyToken = async () => {
      try {
            await swapHelper.executeSwap(config.BASE_TOKEN, config.TARGET_TOKEN, config.GRID_AMOUNT, account.address);
      } catch (e) {
            console.log(e);
      }
  };

  const sellToken = async () => {
    try {
            const sellAmount = ethers.utils.parseUnits(grid.value, grid.decimals);
            await swapHelper.executeSwap(config.TARGET_TOKEN, config.BASE_TOKEN, sellAmount, account.address);
    } catch (e) {
            console.log(e);
    }
};
  
connect().then(run());
