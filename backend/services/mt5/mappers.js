'use strict';

/**
 * Pure functions that map raw MetaApi objects to the leaner shapes used
 * internally.  Kept in their own module so both fetcher.js and streaming.js
 * can import them without creating a dependency between those two files.
 */

function mapPosition(pos) {
    return {
        id: pos.id,
        symbol: pos.symbol,
        type: pos.type,
        volume: pos.volume || 0,
        openPrice: pos.openPrice || 0,
        currentPrice: pos.currentPrice || 0,
        profit: pos.profit || 0,
        swap: pos.swap || 0,
        commission: pos.commission || 0,
        openTime: pos.time,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        magic: pos.magic,
        comment: pos.comment,
    };
}

function mapOrder(order) {
    return {
        id: order.id,
        symbol: order.symbol,
        type: order.type,
        volume: order.volume || 0,
        openPrice: order.openPrice || 0,
        currentPrice: order.currentPrice || 0,
        openTime: order.time,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        state: order.state,
        magic: order.magic,
        comment: order.comment,
    };
}

function mapDeal(deal) {
    return {
        id: deal.id,
        orderId: deal.orderId,
        positionId: deal.positionId,
        symbol: deal.symbol,
        type: deal.type,
        volume: deal.volume,
        price: deal.price,
        profit: deal.profit || 0,
        swap: deal.swap || 0,
        commission: deal.commission || 0,
        time: deal.time,
        magic: deal.magic,
        comment: deal.comment,
    };
}

module.exports = { mapPosition, mapOrder, mapDeal };