import { Injectable, OnDestroy, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {

  readonly status = signal<ConnectionStatus>('connecting');

  private readonly socket: Socket;

  constructor() {
    this.socket = io(environment.backendUrl);

    this.socket.on('connect',    () => this.status.set('connected'));
    this.socket.on('disconnect', () => this.status.set('disconnected'));
  }

  /**
   * Returns a typed Observable for the given socket event.
   * The subscription is automatically torn down when unsubscribed.
   */
  on<T>(event: string): Observable<T> {
    return new Observable<T>(observer => {
      const handler = (data: T) => observer.next(data);
      this.socket.on(event, handler);
      return () => this.socket.off(event, handler);
    });
  }

  emit(event: string, data?: unknown): void {
    this.socket.emit(event, data);
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
  }
}