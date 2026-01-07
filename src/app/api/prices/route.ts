import { NextResponse } from "next/server";
import ccxt, { exchanges } from "ccxt";
import { timeStamp } from "console";

export async function GET() {
    try {

        // instancia as exchanges
        const binance = new ccxt.binance();
        const kucoin = new ccxt.kucoin();

        // define o par de moedas
        const [binanceTicker, kucoinTicker] = await Promise.all([
            binance.fetchTicker("BTC/USDT"),
            kucoin.fetchTicker("BTC/USDT"),
        ]);

        // Função para calcular variação percentual
        const getChangePercent = (open: number, last: number) => {
            if (!open || !last) return 0;
            return ((last - open) / open) * 100;
        };

        // monta a resposta com os preços e parâmetros profissionais
        const data = {
            timestamp: new Date().toISOString(),
            exchanges: [
                {
                    name: "Binance",
                    pair: "BTC/USDT",
                    price: binanceTicker.last,
                    vol: binanceTicker.baseVolume,
                    high: binanceTicker.high, // preço máximo 24h
                    low: binanceTicker.low,   // preço mínimo 24h
                    open: binanceTicker.open, // preço de abertura 24h
                    changePercent: getChangePercent(binanceTicker.open ?? 0, binanceTicker.last ?? 0), // variação % 24h
                    quoteVolume: binanceTicker.quoteVolume, // volume em USDT negociado
                },
                {
                    name: "KuCoin",
                    pair: "BTC/USDT",
                    price: kucoinTicker.last,
                    vol: kucoinTicker.baseVolume,
                    high: kucoinTicker.high,
                    low: kucoinTicker.low,
                    open: kucoinTicker.open,
                    changePercent: getChangePercent(kucoinTicker.open ?? 0, kucoinTicker.last ?? 0),
                    quoteVolume: kucoinTicker.quoteVolume,
                },
            ]
        };
        return NextResponse.json(data);

    } catch (error) {
        console.error("erro ao buscar preços:", error);
        return NextResponse.json({ error: "Erro ao buscar cotações" }, { status: 500 });
     }
}