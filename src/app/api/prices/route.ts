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

        // monta a resposta com os preços
        const data = {
            timeStamp: new Date().toISOString(),
            exchanges: [
                { 
                    name: "Binance",
                    pair: "BTC/USDT",
                    price: binanceTicker.last,
                    vol: binanceTicker.baseVolume
                },
                { 
                    name: "KuCoin", 
                    pair: "BTC/USDT",
                    price: kucoinTicker.last,
                    vol: kucoinTicker.baseVolume
                },
            ]
        }
        return NextResponse.json(data);

    } catch (error) {
        console.error("erro ao buscar preços:", error);
        return NextResponse.json({ error: "Erro ao buscar cotações" }, { status: 500 });
     }
}