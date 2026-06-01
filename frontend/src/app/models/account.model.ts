import { Trade } from './trade.model';
import { Position } from './position.model';

export interface Order {
  id: number | string;
  symbol?: string;
  type?: string;
  volume?: number;
  openPrice?: number;
  currentPrice?: number;
  state?: string;
  magic?: number;
  comment?: string;
}

export interface Account {
  id: string | number;
  platform: 'topstep' | 'mt5';
  parentId?: string | number;
  parentName?: string;
  name: string;
  accountId: number | string;
  balance: number;
  equity?: number;
  profit?: number;      // MT5 unrealized P&L
  margin?: number;
  freeMargin?: number;
  marginLevel?: number;
  currency?: string;
  leverage?: number;
  trades: Trade[];
  positions: Position[];
  orders: Order[];
  lastUpdate?: string;
}