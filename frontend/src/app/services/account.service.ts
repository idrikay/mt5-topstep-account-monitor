import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Account, Order, Position, PositionSummary, Trade } from '../models';
import { MAX_TRADES_CACHED } from '../constants/trading.const';
import { SocketService } from './socket.service';

@Injectable({ providedIn: 'root' })
export class AccountService {

  private readonly socket = inject(SocketService);

  // ── State ────────────────────────────────────────────────────────────────────

  readonly accounts          = signal<Account[]>([]);
  readonly positionsSummary  = signal<PositionSummary[]>([]);
  /** Timestamp of the last accountListUpdate or initialData event. */
  readonly lastDataReceived  = signal<Date | null>(null);

  // ── Derived account lists ────────────────────────────────────────────────────

  readonly practiceAccounts = computed(() =>
    this.accounts().filter(acc => this.isPractice(acc))
  );

  readonly derivativesAccounts = computed(() =>
    this.accounts().filter(acc => this.isCombine(acc))
  );

  readonly realAccounts = computed(() =>
    this.accounts().filter(acc =>
      acc.platform === 'topstep' &&
      !this.isPractice(acc) &&
      !this.isCombine(acc)
    )
  );

  readonly mt5Accounts = computed(() =>
    this.accounts().filter(acc => acc.platform === 'mt5')
  );

  // ── Totals ───────────────────────────────────────────────────────────────────

  readonly totalBalance = computed(() =>
    this.accounts().reduce((sum, acc) => sum + acc.balance, 0)
  );

  readonly totalEquity = computed(() =>
    this.accounts().reduce((sum, acc) => sum + (acc.equity ?? acc.balance), 0)
  );

  readonly totalUnrealizedPnL = computed(() =>
    this.mt5Accounts().reduce((sum, acc) => sum + (acc.profit ?? 0), 0)
  );

  // ── Initialization ────────────────────────────────────────────────────────────

  constructor() {
    this.registerSocketListeners();
  }

  // ── Public helpers ────────────────────────────────────────────────────────────

  isPractice(account: Account): boolean {
    return account.platform === 'topstep' &&
           account.name.toUpperCase().includes('PRAC');
  }

  isCombine(account: Account): boolean {
    return account.name.toUpperCase().includes('EXPRESS');
  }

  // ── Socket listeners ──────────────────────────────────────────────────────────

  private registerSocketListeners(): void {
    this.socket.on<Account[]>('initialData')
      .pipe(takeUntilDestroyed())
      .subscribe(data => {
        this.accounts.set(data);
        this.lastDataReceived.set(new Date());
      });

    this.socket.on<Account[]>('accountListUpdate')
      .pipe(takeUntilDestroyed())
      .subscribe(data => {
        this.accounts.set(data);
        this.lastDataReceived.set(new Date());
      });

    this.socket.on<PositionSummary[]>('positionsSummary')
      .pipe(takeUntilDestroyed())
      .subscribe(data => this.positionsSummary.set(data));

    // ── TopStepX events ───────────────────────────────────────────────────────

    this.socket.on<{ accountId: string; subAccountId: number; data: Partial<Account> }>('accountUpdate')
      .pipe(takeUntilDestroyed())
      .subscribe(({ accountId, subAccountId, data }) => {
        const compositeId = `${accountId}-${subAccountId}`;
        this.patchAccount(
          acc => String(acc.id) === compositeId,
          { balance: data.balance ?? 0, ...(data.name ? { name: data.name } : {}) }
        );
      });

    this.socket.on<{ subAccountId: number; data: Trade }>('tradeUpdate')
      .pipe(takeUntilDestroyed())
      .subscribe(({ subAccountId, data }) => {
        this.updateAccountTrades(
          acc => acc.accountId === subAccountId,
          data
        );
      });

    this.socket.on<{ subAccountId: number; data: Position }>('positionUpdate')
      .pipe(takeUntilDestroyed())
      .subscribe(({ subAccountId, data }) => {
        this.updateAccountPositions(
          acc => acc.accountId === subAccountId,
          data
        );
      });

    // ── MT5 events ────────────────────────────────────────────────────────────

    this.socket.on<{ accountId: string; data: Partial<Account> }>('mt5AccountUpdate')
      .pipe(takeUntilDestroyed())
      .subscribe(({ accountId, data }) => {
        this.patchAccount(
          acc => acc.id === accountId,
          {
            balance:     data.balance,
            equity:      data.equity,
            profit:      data.profit,
            margin:      data.margin,
            freeMargin:  data.freeMargin,
            marginLevel: data.marginLevel,
          }
        );
      });

    this.socket.on<{ accountId: string; data: Position }>('mt5PositionUpdate')
      .pipe(takeUntilDestroyed())
      .subscribe(({ accountId, data }) => {
        this.updateAccountPositions(acc => acc.id === accountId, data);
      });

    this.socket.on<{ accountId: string; positionId: number | string }>('mt5PositionClosed')
      .pipe(takeUntilDestroyed())
      .subscribe(({ accountId, positionId }) => {
        this.accounts.update(list =>
          list.map(acc =>
            acc.id !== accountId ? acc :
            { ...acc, positions: acc.positions.filter(p => p.id !== positionId) }
          )
        );
      });

    this.socket.on<{ accountId: string; data: Order }>('mt5OrderUpdate')
      .pipe(takeUntilDestroyed())
      .subscribe(({ accountId, data }) => {
        this.accounts.update(list =>
          list.map(acc =>
            acc.id !== accountId ? acc :
            { ...acc, orders: upsertById(acc.orders, data) }
          )
        );
      });

    this.socket.on<{ accountId: string; orderId: number | string }>('mt5OrderCompleted')
      .pipe(takeUntilDestroyed())
      .subscribe(({ accountId, orderId }) => {
        this.accounts.update(list =>
          list.map(acc =>
            acc.id !== accountId ? acc :
            { ...acc, orders: acc.orders.filter(o => o.id !== orderId) }
          )
        );
      });

    this.socket.on<{ accountId: string; data: Trade }>('mt5DealUpdate')
      .pipe(takeUntilDestroyed())
      .subscribe(({ accountId, data }) => {
        this.updateAccountTrades(acc => acc.id === accountId, data);
      });
  }

  // ── Private state helpers ─────────────────────────────────────────────────────

  /** Merges `patch` into the first account matching `predicate`. */
  private patchAccount(
    predicate: (acc: Account) => boolean,
    patch: Partial<Account>
  ): void {
    this.accounts.update(list =>
      list.map(acc => predicate(acc) ? { ...acc, ...patch } : acc)
    );
  }

  /** Upserts or removes a position on the first account matching `predicate`. */
  private updateAccountPositions(
    predicate: (acc: Account) => boolean,
    position: Position
  ): void {
    const isClosed = position.size == null || position.size === 0;

    this.accounts.update(list =>
      list.map(acc => {
        if (!predicate(acc)) return acc;
        const positions = isClosed
          ? acc.positions.filter(p => p.id !== position.id)
          : upsertById(acc.positions, position);
        return { ...acc, positions };
      })
    );
  }

  /** Upserts a trade on the first account matching `predicate`. */
  private updateAccountTrades(
    predicate: (acc: Account) => boolean,
    trade: Trade
  ): void {
    this.accounts.update(list =>
      list.map(acc => {
        if (!predicate(acc)) return acc;
        const updated = upsertById(acc.trades, trade, /* prepend */ true);
        const trades  = updated.length > MAX_TRADES_CACHED
          ? updated.slice(0, MAX_TRADES_CACHED)
          : updated;
        return { ...acc, trades };
      })
    );
  }
}

// ─── Pure utility ─────────────────────────────────────────────────────────────

/** Returns a new array with `item` inserted or replaced by matching `id`. */
function upsertById<T extends { id: number | string }>(
  array: T[],
  item: T,
  prepend = false
): T[] {
  const idx = array.findIndex(el => el.id === item.id);
  if (idx >= 0) {
    return [...array.slice(0, idx), item, ...array.slice(idx + 1)];
  }
  return prepend ? [item, ...array] : [...array, item];
}