const MetaApi = require('metaapi.cloud-sdk').default;
const express = require('express');
const app = express.Router();

class MT5ReportService {
  constructor(token) {
    this.api = new MetaApi(token);
  }

  async getAllAccountReports(startDate, endDate) {
    try {
      console.log(`\n=== Fetching MT5 Reports for ${startDate} to ${endDate} ===\n`);
      
      const accounts = await this.api.metatraderAccountApi.getAccountsWithInfiniteScrollPagination();
      console.log(`Total accounts found: ${accounts.length}`);
      
      // Log all accounts to debug
      accounts.forEach((acc, idx) => {
        console.log(`  [${idx + 1}] Name: ${acc.name}, Login: ${acc.login}, Type: ${acc.type}, Platform: ${acc.platform}, State: ${acc.state}`);
      });
      
      // Fix: Platform is undefined, so filter by type and state only
      const mt5Accounts = accounts.filter(acc => 
        acc.type.startsWith('cloud') && 
        acc.state === 'DEPLOYED'
        // Platform check removed since it's undefined
      );

      console.log(`\nFiltered accounts (DEPLOYED cloud accounts): ${mt5Accounts.length}`);
      mt5Accounts.forEach((acc, idx) => {
        console.log(`  [${idx + 1}] ${acc.name} (Login: ${acc.login}, State: ${acc.state})`);
      });
      
      const allReports = [];
      
      for (const account of mt5Accounts) {
        console.log(`\n--- Processing Account: ${account.name} (${account.login}) ---`);
        try {
          const report = await this.getAccountReport(
            account, 
            startDate, 
            endDate
          );
          
          console.log(`  ✓ Found ${report.length} trades for ${account.name}`);
          
          allReports.push({
            accountId: account.id,
            accountName: account.name,
            login: account.login,
            broker: account.broker,
            currency: account.currency,
            balance: account.accountInformation?.balance,
            report: report
          });
        } catch (error) {
          console.error(`  ✗ Error fetching report for account ${account.name}:`, error.message);
          console.error(`  Stack:`, error.stack);
        }
      }
      
      console.log(`\n=== Total Reports Generated: ${allReports.length} ===`);
      console.log(`Total Trades Found: ${allReports.reduce((sum, r) => sum + r.report.length, 0)}\n`);
      
      return allReports;
    } catch (error) {
      console.error('Error fetching accounts:', error);
      throw error;
    }
  }

  async getAccountReport(account, startDate, endDate) {
    try {
      const connection = account.getRPCConnection();
      
      console.log(`  Connecting to account...`);
      await connection.connect();
      
      console.log(`  Waiting for synchronization...`);
      await connection.waitSynchronized();

      console.log(`  Fetching history orders...`);
      const historyOrdersResponse = await connection.getHistoryOrdersByTimeRange(
        new Date(startDate),
        new Date(endDate)
      );

      console.log(`  Fetching deals...`);
      const dealsResponse = await connection.getDealsByTimeRange(
        new Date(startDate),
        new Date(endDate)
      );

      console.log(`  Response types:`, {
        orders: typeof historyOrdersResponse,
        deals: typeof dealsResponse
      });
      
      // Extract arrays from response objects
      let ordersArray = [];
      let dealsArray = [];
      
      if (historyOrdersResponse) {
        console.log(`  Orders response keys:`, Object.keys(historyOrdersResponse));
        
        // Response might be { orders: [...], synchronizing: false }
        // Or might have the array as indexed properties
        if (Array.isArray(historyOrdersResponse)) {
          ordersArray = historyOrdersResponse;
        } else if (historyOrdersResponse.orders) {
          ordersArray = historyOrdersResponse.orders;
        } else {
          // Extract numeric keys (array-like object)
          ordersArray = Object.keys(historyOrdersResponse)
            .filter(key => !isNaN(key))
            .map(key => historyOrdersResponse[key]);
        }
      }
      
      if (dealsResponse) {
        console.log(`  Deals response keys:`, Object.keys(dealsResponse));
        console.log(`  Deals response sample:`, JSON.stringify(Object.keys(dealsResponse).slice(0, 5)));
        
        // Response might be { deals: [...], synchronizing: false }
        // Or might have the array as indexed properties
        if (Array.isArray(dealsResponse)) {
          dealsArray = dealsResponse;
        } else if (dealsResponse.deals) {
          dealsArray = dealsResponse.deals;
        } else {
          // Extract numeric keys (array-like object)
          const numericKeys = Object.keys(dealsResponse)
            .filter(key => !isNaN(key))
            .sort((a, b) => parseInt(a) - parseInt(b));
          
          console.log(`  Found ${numericKeys.length} numeric keys`);
          
          dealsArray = numericKeys.map(key => dealsResponse[key]);
        }
      }

      console.log(`  History orders extracted: ${ordersArray.length}`);
      console.log(`  Deals extracted: ${dealsArray.length}`);
      
      if (dealsArray.length > 0) {
        console.log(`  Sample deal:`, JSON.stringify(dealsArray[0], null, 2));
        console.log(`  Deal entry types:`, [...new Set(dealsArray.map(d => d.entryType))]);
      }

      const trades = this.processTradesFromHistory(ordersArray, dealsArray);
      
      console.log(`  Processed trades: ${trades.length}`);
      
      await connection.close();
      
      return trades;
    } catch (error) {
      console.error(`  Error processing account ${account.name}:`, error);
      throw error;
    }
  }

processTradesFromHistory(orders, deals) {
  console.log(`\n  --- Processing Trades from History ---`);
  
  // Ensure we have arrays
  if (!Array.isArray(orders)) {
    console.log(`  WARNING: orders is not an array:`, orders);
    orders = [];
  }
  if (!Array.isArray(deals)) {
    console.log(`  WARNING: deals is not an array:`, deals);
    deals = [];
  }
  
  const trades = [];
  const positionMap = new Map();

  // Group deals by position ID
  deals.forEach(deal => {
    if (deal.positionId) {
      if (!positionMap.has(deal.positionId)) {
        positionMap.set(deal.positionId, {
          entryDeals: [],
          exitDeals: [],
          orders: []
        });
      }

      const position = positionMap.get(deal.positionId);
      
      if (deal.entryType === 'DEAL_ENTRY_IN') {
        position.entryDeals.push(deal);
      } else if (deal.entryType === 'DEAL_ENTRY_OUT' || 
                 deal.entryType === 'DEAL_ENTRY_OUT_BY') {
        position.exitDeals.push(deal);
      }
    }
  });

  console.log(`  Unique positions found: ${positionMap.size}`);
  
  let positionsWithEntry = 0;
  let positionsWithExit = 0;
  let completePositions = 0;
  
  positionMap.forEach((position, positionId) => {
    if (position.entryDeals.length > 0) positionsWithEntry++;
    if (position.exitDeals.length > 0) positionsWithExit++;
    if (position.entryDeals.length > 0 && position.exitDeals.length > 0) completePositions++;
  });
  
  console.log(`  Positions with entry: ${positionsWithEntry}`);
  console.log(`  Positions with exit: ${positionsWithExit}`);
  console.log(`  Complete positions (entry + exit): ${completePositions}`);

  // Match orders to positions
  orders.forEach(order => {
    if (order.positionId && positionMap.has(order.positionId)) {
      positionMap.get(order.positionId).orders.push(order);
    }
  });

  // Create trade records
  positionMap.forEach((position, positionId) => {
    if (position.entryDeals.length > 0 && position.exitDeals.length > 0) {
      const trade = this.createTradeRecord(
        position.entryDeals,
        position.exitDeals,
        position.orders
      );
      if (trade) {
        trades.push(trade);
      }
    }
  });

  console.log(`  Final trades created: ${trades.length}\n`);
  
  return trades;
}

  createTradeRecord(entryDeals, exitDeals, orders) {
    // Calculate aggregated entry values
    let totalEntryVolume = 0;
    let totalEntryValue = 0;
    let entryTime = null;
    let symbol = '';
    let tradeType = '';

    entryDeals.forEach(deal => {
      totalEntryVolume += deal.volume || 0;
      totalEntryValue += (deal.price * deal.volume);
      if (!entryTime || new Date(deal.time) < new Date(entryTime)) {
        entryTime = deal.time;
      }
      symbol = deal.symbol;
      tradeType = deal.type === 'DEAL_TYPE_BUY' ? 'LONG' : 'SHORT';
    });

    const avgEntryPrice = totalEntryVolume > 0 ? 
      totalEntryValue / totalEntryVolume : 0;

    // Calculate aggregated exit values
    let totalExitVolume = 0;
    let totalExitValue = 0;
    let exitTime = null;
    let totalCommission = 0;
    let totalSwap = 0;
    let totalProfit = 0;

    exitDeals.forEach(deal => {
      totalExitVolume += deal.volume || 0;
      totalExitValue += (deal.price * deal.volume);
      totalCommission += Math.abs(deal.commission || 0);
      totalSwap += deal.swap || 0;
      totalProfit += deal.profit || 0;
      if (!exitTime || new Date(deal.time) > new Date(exitTime)) {
        exitTime = deal.time;
      }
    });

    const avgExitPrice = totalExitVolume > 0 ? 
      totalExitValue / totalExitVolume : 0;

    const duration = this.calculateDuration(entryTime, exitTime);
    const fees = totalCommission + Math.abs(totalSwap);

    return {
      contractName: this.formatSymbol(symbol),
      enteredAt: this.formatDateTime(entryTime),
      exitedAt: this.formatDateTime(exitTime),
      entryPrice: avgEntryPrice.toFixed(5),
      exitPrice: avgExitPrice.toFixed(5),
      fees: fees.toFixed(2),
      pnl: totalProfit.toFixed(2),
      size: Math.max(totalEntryVolume, totalExitVolume).toFixed(2),
      type: tradeType,
      tradeDay: this.formatDate(entryTime),
      tradeDuration: duration,
      commissions: totalCommission.toFixed(2),
      swap: totalSwap.toFixed(2),
      symbol: symbol
    };
  }

  formatSymbol(symbol) {
    const symbolMap = {
      'XAUUSD': 'GOLD',
      'XAGUSD': 'SILVER',
      'EURUSD': 'EUR/USD',
      'GBPUSD': 'GBP/USD',
      'USDJPY': 'USD/JPY',
      'USDCAD': 'USD/CAD',
      'AUDUSD': 'AUD/USD',
      'NZDUSD': 'NZD/USD',
      'US500': 'S&P 500',
      'US30': 'DOW JONES',
      'NAS100': 'NASDAQ',
      'UK100': 'FTSE 100',
      'GER40': 'DAX 40',
      'BTCUSD': 'BITCOIN',
      'ETHUSD': 'ETHEREUM',
      'USOIL': 'CRUDE OIL',
      'UKOIL': 'BRENT OIL'
    };

    return symbolMap[symbol] || symbol;
  }

  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return 'N/A';
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Express endpoint
app.post('/api/mt5-reports', async (req, res) => {
  const { startDate, endDate } = req.body;
  
  try {
    const reportService = new MT5ReportService(process.env.METAAPI_TOKEN);
    const reports = await reportService.getAllAccountReports(startDate, endDate);
    
    res.json({
      success: true,
      data: reports,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating MT5 reports:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = { 
  MT5ReportService,
  app
};