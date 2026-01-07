import { NextResponse } from "next/server";
import ccxt from "ccxt";

// GET /api/candles?exchange=binance&pair=BTC/USDT&timeframe=1h&limit=100
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const exchangeParam = (searchParams.get("exchange") || "binance").toLowerCase();
    const pair = searchParams.get("pair") || "BTC/USDT";
    const timeframe = searchParams.get("timeframe") || "1h";
    const limit = Number(searchParams.get("limit") || 100);

    let exchange: ccxt.Exchange | null = null;
    switch (exchangeParam) {
      case "binance":
        exchange = new ccxt.binance();
        break;
      case "kucoin":
        exchange = new ccxt.kucoin();
        break;
      default:
        return NextResponse.json({ error: "Exchange não suportada" }, { status: 400 });
    }

    // Alguns exchanges requerem carregamento de mercados para mapear símbolos
    await exchange.loadMarkets();

    // Busca OHLCV: [ timestamp, open, high, low, close, volume ]
    const ohlcv = await exchange.fetchOHLCV(pair, timeframe, undefined, limit);

    const candles = ohlcv.map((c) => ({
      time: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      exchange: exchangeParam,
      pair,
      timeframe,
      candles,
    });
  } catch (error) {
    console.error("erro ao buscar candles:", error);
    return NextResponse.json({ error: "Erro ao buscar candles" }, { status: 500 });
  }
}
