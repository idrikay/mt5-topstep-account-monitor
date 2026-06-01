import { Injectable } from '@angular/core';
import { Account, DailyStats, Trade } from '../models';
import { BREAKEVEN_THRESHOLD } from '../constants/trading.const';

@Injectable({ providedIn: 'root' })
export class StatsService {

  calculateStats(accounts: Account[]): DailyStats {
    const trades = accounts.flatMap(acc => acc.trades ?? []);

    const closingTrades = trades.filter(t => {
      const pnl = this.getTradePnL(t);
      return pnl !== null && pnl !== undefined;
    });

    const winning   = closingTrades.filter(t => this.getTradePnL(t) >  BREAKEVEN_THRESHOLD);
    const losing    = closingTrades.filter(t => this.getTradePnL(t) < -BREAKEVEN_THRESHOLD);
    const breakeven = closingTrades.filter(t => Math.abs(this.getTradePnL(t)) < BREAKEVEN_THRESHOLD);

    const decided = winning.length + losing.length;

    const pnls       = trades.map(t => this.getTradePnL(t));
    const totalPnL   = sum(pnls);
    const totalFees  = sum(trades.map(t => this.getTradeFees(t)));
    const totalSwap  = sum(trades.map(t => t.swap ?? 0));

    const unrealizedPnL = accounts
      .filter(acc => acc.platform === 'mt5')
      .reduce((s, acc) => s + (acc.profit ?? 0), 0);

    return {
      totalExecutions: trades.length,
      roundTripTrades: closingTrades.length,
      winningTrades:   winning.length,
      losingTrades:    losing.length,
      breakevenTrades: breakeven.length,
      winRate:         decided > 0 ? (winning.length / decided) * 100 : 0,
      bestTrade:       pnls.length > 0 ? Math.max(...pnls) : 0,
      worstTrade:      pnls.length > 0 ? Math.min(...pnls) : 0,
      totalFees,
      totalPnL,
      netPnL:          totalPnL - totalFees,
      averageWin:      average(winning.map(t => this.getTradePnL(t))),
      averageLoss:     average(losing.map(t => this.getTradePnL(t))),
      totalSwap,
      unrealizedPnL,
    };
  }

  // ── Trade field accessors (normalise TopStepX / MT5 field names) ──────────────

  getTradePnL(trade: Trade): number {
    return trade.profitAndLoss ?? trade.profit ?? 0;
  }

  getTradeFees(trade: Trade): number {
    return (trade.fees ?? 0) + (trade.commission ?? 0) + (trade.swap ?? 0);
  }

  getTradeSymbol(trade: Trade): string {
    return trade.contractId ?? trade.symbol ?? 'N/A';
  }

  getTradeSize(trade: Trade): number {
    return trade.size ?? trade.volume ?? 0;
  }

  getTradeTimestamp(trade: Trade): string {
    return trade.creationTimestamp ?? trade.time ?? '';
  }

  // ── Account-level helpers ─────────────────────────────────────────────────────

  getAccountPnL(account: Account): number {
    return sum((account.trades ?? []).map(t => this.getTradePnL(t)));
  }

  getAccountFees(account: Account): number {
    return sum((account.trades ?? []).map(t => this.getTradeFees(t)));
  }

  getAccountNetPnL(account: Account): number {
    return this.getAccountPnL(account) - this.getAccountFees(account);
  }

  getAccountUnrealizedPnL(account: Account): number {
      if (account.platform === 'mt5') {
          // Sum position-level profits so this matches the position detail panel.
          // account.profit (equity - balance) can differ by ~$1 due to how MT5
          // accrues swap fees between the position and account level.
          return (account.positions ?? [])
              .reduce((sum, p) => sum + (p.profit ?? 0), 0);
      }
      return (account.positions ?? [])
          .reduce((sum, p) => sum + (p.unrealizedPnL ?? p.profit ?? 0), 0);
  }

  getAccountTotalPnL(account: Account): number {
    return this.getAccountNetPnL(account) + this.getAccountUnrealizedPnL(account);
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

function average(values: number[]): number {
  return values.length > 0 ? sum(values) / values.length : 0;
}