'use strict';

const { mapPosition, mapOrder, mapDeal } = require('../services/mt5/mappers');

describe('mapPosition', () => {
    const raw = {
        id: 'pos-1',
        symbol: 'EURUSD',
        type: 'POSITION_TYPE_BUY',
        volume: 0.1,
        openPrice: 1.085,
        currentPrice: 1.087,
        profit: 20,
        swap: -0.5,
        commission: -1,
        time: '2024-01-01T10:00:00.000Z',
        stopLoss: 1.08,
        takeProfit: 1.09,
        magic: 12345,
        comment: 'test',
    };

    it('maps all fields correctly', () => {
        const result = mapPosition(raw);
        expect(result.id).toBe('pos-1');
        expect(result.symbol).toBe('EURUSD');
        expect(result.type).toBe('POSITION_TYPE_BUY');
        expect(result.volume).toBe(0.1);
        expect(result.openPrice).toBe(1.085);
        expect(result.currentPrice).toBe(1.087);
        expect(result.profit).toBe(20);
        expect(result.swap).toBe(-0.5);
        expect(result.commission).toBe(-1);
        expect(result.openTime).toBe('2024-01-01T10:00:00.000Z');
        expect(result.stopLoss).toBe(1.08);
        expect(result.takeProfit).toBe(1.09);
        expect(result.magic).toBe(12345);
        expect(result.comment).toBe('test');
    });

    it('defaults numeric fields to 0 when absent', () => {
        const result = mapPosition({ id: 'x', symbol: 'GBPUSD', type: 'POSITION_TYPE_SELL' });
        expect(result.volume).toBe(0);
        expect(result.openPrice).toBe(0);
        expect(result.currentPrice).toBe(0);
        expect(result.profit).toBe(0);
        expect(result.swap).toBe(0);
        expect(result.commission).toBe(0);
    });
});

describe('mapOrder', () => {
    const raw = {
        id: 'ord-1',
        symbol: 'USDJPY',
        type: 'ORDER_TYPE_BUY_LIMIT',
        volume: 0.5,
        openPrice: 148.5,
        currentPrice: 149.0,
        time: '2024-01-01T09:00:00.000Z',
        stopLoss: 147.0,
        takeProfit: 150.0,
        state: 'ORDER_STATE_PLACED',
        magic: 0,
        comment: '',
    };

    it('maps all fields correctly', () => {
        const result = mapOrder(raw);
        expect(result.id).toBe('ord-1');
        expect(result.symbol).toBe('USDJPY');
        expect(result.type).toBe('ORDER_TYPE_BUY_LIMIT');
        expect(result.volume).toBe(0.5);
        expect(result.state).toBe('ORDER_STATE_PLACED');
    });

    it('defaults numeric fields to 0 when absent', () => {
        const result = mapOrder({ id: 'x', symbol: 'AUDUSD', type: 'ORDER_TYPE_SELL_LIMIT' });
        expect(result.volume).toBe(0);
        expect(result.openPrice).toBe(0);
        expect(result.currentPrice).toBe(0);
    });
});

describe('mapDeal', () => {
    const raw = {
        id: 'deal-1',
        orderId: 'ord-1',
        positionId: 'pos-1',
        symbol: 'EURUSD',
        type: 'DEAL_TYPE_BUY',
        volume: 0.1,
        price: 1.085,
        profit: 50,
        swap: -0.25,
        commission: -0.5,
        time: '2024-01-01T11:00:00.000Z',
        magic: 0,
        comment: 'close',
    };

    it('maps all fields correctly', () => {
        const result = mapDeal(raw);
        expect(result.id).toBe('deal-1');
        expect(result.orderId).toBe('ord-1');
        expect(result.positionId).toBe('pos-1');
        expect(result.symbol).toBe('EURUSD');
        expect(result.type).toBe('DEAL_TYPE_BUY');
        expect(result.volume).toBe(0.1);
        expect(result.price).toBe(1.085);
        expect(result.profit).toBe(50);
        expect(result.swap).toBe(-0.25);
        expect(result.commission).toBe(-0.5);
        expect(result.time).toBe('2024-01-01T11:00:00.000Z');
    });

    it('defaults profit, swap and commission to 0 when absent', () => {
        const result = mapDeal({ id: 'x', symbol: 'GBPUSD', type: 'DEAL_TYPE_SELL' });
        expect(result.profit).toBe(0);
        expect(result.swap).toBe(0);
        expect(result.commission).toBe(0);
    });
});