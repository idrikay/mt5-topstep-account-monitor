import { Pipe, PipeTransform } from '@angular/core';
import { BREAKEVEN_THRESHOLD } from '../constants/trading.const';

/** Returns a CSS class name based on the sign of a P&L value. */
@Pipe({ name: 'pnlClass', standalone: true, pure: true })
export class PnlClassPipe implements PipeTransform {
  transform(pnl: number): 'positive' | 'negative' | 'breakeven' {
    if (Math.abs(pnl) < BREAKEVEN_THRESHOLD) return 'breakeven';
    return pnl > 0 ? 'positive' : 'negative';
  }
}