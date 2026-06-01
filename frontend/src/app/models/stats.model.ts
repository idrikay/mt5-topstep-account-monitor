export interface DailyStats {
  totalExecutions: number;
  roundTripTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
  totalFees: number;
  totalPnL: number;
  netPnL: number;
  averageWin: number;
  averageLoss: number;
  totalSwap: number;
  unrealizedPnL: number;
}