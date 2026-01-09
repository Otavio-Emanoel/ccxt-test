import { NextResponse } from "next/server";
import ccxt from "ccxt";

// 1. Singleton Pattern básico
const binance = new ccxt.binance({ enableRateLimit: true });
const kucoin = new ccxt.kucoin({ enableRateLimit: true });

// Lista de moedas
const TARGET_SYMBOLS = [
    "BTC/USDT", 
    "ETH/USDT", 
    "SOL/USDT", 
    "DOGE/USDT",
    "XRP/USDT"
];

// Tipo para o ticker formatado
interface FormattedTicker {
    name: string;
    pair: string;
    price: number;
    vol: number;
    high: number;
    low: number;
    open: number;
    changePercent: number;
    quoteVolume: number;
}

// Cache simples em memória para evitar Rate Limit
let cache = {
    data: null as any,
    lastUpdated: 0
};

const CACHE_DURATION = 2000; // 2 segundos de cache

export async function GET() {
    try {
        const now = Date.now();

        // Se o cache for recente, retorna ele e nem bate nas exchanges
        if (cache.data && (now - cache.lastUpdated < CACHE_DURATION)) {
            return NextResponse.json(cache.data);
        }

        // 2. Busca tudo em paralelo, mas tratando erros individualmente
        // Usamos fetchTickers (plural) para pegar tudo em 1 request por exchange
        const results = await Promise.allSettled([
            binance.fetchTickers(TARGET_SYMBOLS),
            kucoin.fetchTickers(TARGET_SYMBOLS)
        ]);

        const exchangesData: FormattedTicker[] = [];

        // Processa Binance
        if (results[0].status === 'fulfilled') {
            const tickers = results[0].value;
            // Transforma o objeto de tickers em array
            Object.values(tickers).forEach((ticker: any) => {
                exchangesData.push(formatTicker(ticker, "Binance"));
            });
        } else {
            console.error("Erro Binance:", results[0].reason);
        }

        // Processa Kucoin
        if (results[1].status === 'fulfilled') {
            const tickers = results[1].value;
            Object.values(tickers).forEach((ticker: any) => {
                exchangesData.push(formatTicker(ticker, "KuCoin"));
            });
        } else {
            console.error("Erro Kucoin:", results[1].reason);
        }

        const responseData = {
            timestamp: new Date().toISOString(),
            exchanges: exchangesData
        };

        // Atualiza o cache
        cache = {
            data: responseData,
            lastUpdated: now
        };

        return NextResponse.json(responseData);

    } catch (error) {
        console.error("Erro geral na API:", error);
        // Se der erro, tenta devolver o cache antigo se existir, para não quebrar a tela
        if (cache.data) return NextResponse.json(cache.data);
        
        return NextResponse.json({ error: "Erro ao buscar cotações" }, { status: 500 });
    }
}

// Função auxiliar para padronizar o dado e evitar repetição de código
function formatTicker(ticker: any, exchangeName: string): FormattedTicker {
    const getChangePercent = (open: number, last: number) => {
        if (!open || !last) return 0;
        return ((last - open) / open) * 100;
    };

    return {
        name: exchangeName,
        pair: ticker.symbol,
        price: ticker.last,
        vol: ticker.baseVolume,
        high: ticker.high,
        low: ticker.low,
        open: ticker.open,
        changePercent: ticker.percentage || getChangePercent(ticker.open, ticker.last), 
        quoteVolume: ticker.quoteVolume,
    };
}