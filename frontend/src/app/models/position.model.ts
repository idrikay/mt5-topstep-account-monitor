export interface Position {
  id: number | string;
  accountId: number | string;
  contractId?: string;   // TopStepX
  symbol?: string;       // MT5
  side?: number;
  type?: string | number;
  size?: number;         // TopStepX
  volume?: number;       // MT5
  averagePrice?: number; // TopStepX
  openPrice?: number;    // MT5
  currentPrice?: number;
  unrealizedPnL?: number;
  profit?: number;       // MT5
  swap?: number;
  commission?: number;
  stopLoss?: number;
  takeProfit?: number;
  openTime?: string;
  creationTimestamp?: string;
}

export interface PositionSummary {
  positionId: number | string;
  platform: 'topstep' | 'mt5';
  platformName: string;
  accountName: string;
  accountId: number | string;
  symbol?: string;
  contractId?: string;
  type: string;
  size: number;
  entryPrice: number;
  currentPrice?: number;
  openedAt: string;
  realizedPnL?: number;
  unrealizedPnL: number | null;
  swap?: number;
  commission?: number;
  stopLoss?: number;
  takeProfit?: number;
}