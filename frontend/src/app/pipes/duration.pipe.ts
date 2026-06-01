import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats the elapsed time since a position was opened.
 *
 * Pass the `tick` signal as a second argument so the pipe stays pure and
 * re-evaluates on every tick under OnPush change detection:
 *
 *   {{ position.openedAt | duration:tick() }}
 *
 * The `_tick` value itself is unused — it exists only to bust Angular's
 * pure-pipe cache. The pipe always calls Date.now() internally for accuracy.
 */
@Pipe({ name: 'duration', standalone: true, pure: true })
export class DurationPipe implements PipeTransform {
  transform(openedAt: string | undefined, _tick?: number): string {
    if (!openedAt) return 'N/A';

    const diffMs = Date.now() - new Date(openedAt).getTime();
    if (diffMs < 0) return 'N/A';

    const totalSeconds = Math.floor(diffMs / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours   = Math.floor(totalSeconds / 3600) % 24;
    const days    = Math.floor(totalSeconds / 86400);

    if (days > 0)    return `${days}d ${hours}h`;
    if (hours > 0)   return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }
}