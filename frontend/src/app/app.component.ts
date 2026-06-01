import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';

import { MT5ReportComponent } from './components/mt5-report/mt5-report.component';
import { DurationPipe } from './pipes/duration.pipe';
import { InstrumentNamePipe } from './pipes/instrument-name.pipe';
import { PnlClassPipe } from './pipes/pnl-class.pipe';
import { AccountService } from './services/account.service';
import { SocketService } from './services/socket.service';
import { StatsService } from './services/stats.service';
import { Position, PositionSummary } from './models';
import { BREAKEVEN_THRESHOLD, DURATION_REFRESH_INTERVAL_MS } from './constants/trading.const';

type PanelKey =
  | 'positions'
  | 'accounts'
  | 'practiceStats'
  | 'realStats'
  | 'derivativesStats'
  | 'mt5Stats'
  | 'totalStats';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    MT5ReportComponent,
    DurationPipe,
    InstrumentNamePipe,
    PnlClassPipe,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {

  // ── Services ──────────────────────────────────────────────────────────────────

  protected readonly accountService = inject(AccountService);
  protected readonly statsService   = inject(StatsService);
  private  readonly socketService   = inject(SocketService);

  // ── Connection ────────────────────────────────────────────────────────────────

  protected readonly connectionStatus = this.socketService.status;

  protected readonly connectionStatusLabel = computed(() => {
    const s = this.connectionStatus();
    if (s === 'connected')    return 'Connected';
    if (s === 'disconnected') return 'Disconnected';
    return 'Connecting…';
  });

  // ── Tick: drives DurationPipe re-evaluation under OnPush ──────────────────────

  protected readonly tick = toSignal(
    interval(DURATION_REFRESH_INTERVAL_MS),
    { initialValue: 0 }
  );

  // ── Panel visibility ──────────────────────────────────────────────────────────

  protected readonly panelVisibility = signal<Record<PanelKey, boolean>>({
    positions:        true,
    accounts:         true,
    practiceStats:    true,
    realStats:        true,
    derivativesStats: true,
    mt5Stats:         true,
    totalStats:       true,
  });

  togglePanel(panel: PanelKey): void {
    this.panelVisibility.update(v => ({ ...v, [panel]: !v[panel] }));
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────

  protected readonly totalStats = computed(() =>
    this.statsService.calculateStats(this.accountService.accounts())
  );

  protected readonly practiceStats = computed(() =>
    this.statsService.calculateStats(this.accountService.practiceAccounts())
  );

  protected readonly derivativesStats = computed(() =>
    this.statsService.calculateStats(this.accountService.derivativesAccounts())
  );

  protected readonly realStats = computed(() =>
    this.statsService.calculateStats(this.accountService.realAccounts())
  );

  protected readonly mt5Stats = computed(() =>
    this.statsService.calculateStats(this.accountService.mt5Accounts())
  );

  // ── Positions total P&L ───────────────────────────────────────────────────────

  protected readonly totalPositionsPnL = computed(() =>
    this.accountService.positionsSummary()
      .reduce((sum, pos) => sum + (pos.unrealizedPnL ?? pos.realizedPnL ?? 0), 0)
  );

  // ── Stale data indicator ─────────────────────────────────────────────────────
  // Re-evaluated on every tick so the "X minutes ago" label stays current
  // while the connection is down.

  protected readonly isDisconnected = computed(() =>
    this.connectionStatus() === 'disconnected'
  );

  protected readonly lastUpdatedLabel = computed(() => {
    this.tick(); // take a dependency on tick so this re-evaluates periodically
    const last = this.accountService.lastDataReceived();
    if (!last) return 'never';

    const diffMs  = Date.now() - last.getTime();
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours   = Math.floor(minutes / 60);

    if (hours > 0)   return `${hours}h ${minutes % 60}m ago`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s ago`;
    return `${seconds}s ago`;
  });

  // ── MT5 refresh ───────────────────────────────────────────────────────────────

  refreshMT5Data(): void {
    this.socketService.emit('refreshMT5');
  }

  // ── Position field accessors ──────────────────────────────────────────────────

  getPositionType(position: Position | PositionSummary): string {
    const t = position.type;
    if (typeof t === 'string') {
      if (t === 'POSITION_TYPE_BUY'  || t === 'Long')  return 'LONG';
      if (t === 'POSITION_TYPE_SELL' || t === 'Short') return 'SHORT';
      return t;
    }
    if (typeof t === 'number') return t === 0 || t === 1 ? 'LONG' : 'SHORT';
    return 'N/A';
  }

  getPositionSymbol(position: Position | PositionSummary): string {
    return position.symbol ?? (position as Position).contractId ?? 'N/A';
  }

  getPositionSize(position: Position | PositionSummary): number {
    return position.size ?? (position as Position).volume ?? 0;
  }

  getPositionEntryPrice(position: Position | PositionSummary): number {
    return (position as PositionSummary).entryPrice
        ?? (position as Position).averagePrice
        ?? (position as Position).openPrice
        ?? 0;
  }

  getPositionPnL(position: Position | PositionSummary): number {
    return (position as PositionSummary).unrealizedPnL
        ?? (position as Position).unrealizedPnL
        ?? (position as Position).profit
        ?? 0;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  isBreakeven(pnl: number): boolean {
    return Math.abs(pnl) < BREAKEVEN_THRESHOLD;
  }

  getPlatformClass(platformName: string): string {
    const p = platformName.toLowerCase();
    if (p.includes('topstep'))                         return 'platform-topstep';
    if (p.includes('mt5') || p.includes('metatrader')) return 'platform-mt5';
    if (p.includes('capital'))                         return 'platform-capital';
    if (p.includes('daytraders'))                      return 'platform-daytraders';
    if (p.includes('aquafutures'))                     return 'platform-aquafutures';
    return 'platform-default';
  }

  // ── Formatting ────────────────────────────────────────────────────────────────

  formatCurrency(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  }

  formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  formatDate(timestamp: string): string {
    return timestamp ? new Date(timestamp).toLocaleString() : 'N/A';
  }

  formatMarginLevel(level: number | undefined): string {
    return level != null ? `${level.toFixed(2)}%` : 'N/A';
  }

  formatLeverage(leverage: number | undefined): string {
    return leverage != null ? `1:${leverage}` : 'N/A';
  }
}