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
    lastUpdated?: number; // Opcional: para saber quão velho é o dado
}

// =================================================================
// 2. CACHE INTELIGENTE (INCREMENTAL)
// =================================================================
// Usamos um Objeto/Mapa onde a chave é única (Ex: "Binance:BTC/USDT")
// Isso garante que nunca teremos duplicatas e podemos atualizar individualmente.
const tickerMap: Record<string, FormattedTicker> = {};

let lastFetchTime = 0;
const CACHE_DURATION = 2000; // 2 segundos de proteção de Rate Limit

export async function GET() {
    try {
        const now = Date.now();

        // Proteção de Rate Limit:
        // Se faz menos de 2s que buscamos E já temos dados, retorna o que tem na memória.
        // Isso evita ser banido pelas exchanges.
        if (now - lastFetchTime < CACHE_DURATION && Object.keys(tickerMap).length > 0) {
            return buildResponse();
        }

        // 3. Atualiza o timestamp da tentativa
        lastFetchTime = now;

        // Busca em paralelo com allSettled
        const results = await Promise.allSettled([
            binance.fetchTickers(TARGET_SYMBOLS),
            kucoin.fetchTickers(TARGET_SYMBOLS)
        ]);

        // Processa Binance (Se sucesso, ATUALIZA o mapa. Se falha, mantem o antigo)
        if (results[0].status === 'fulfilled') {
            const tickers = results[0].value;
            Object.values(tickers).forEach((ticker: any) => {
                updateCache(ticker, "Binance");
            });
        } else {
            console.warn("Binance falhou, mantendo dados antigos:", results[0].reason);
        }

        // Processa Kucoin (Se sucesso, ATUALIZA o mapa. Se falha, mantem o antigo)
        if (results[1].status === 'fulfilled') {
            const tickers = results[1].value;
            Object.values(tickers).forEach((ticker: any) => {
                updateCache(ticker, "KuCoin");
            });
        } else {
            console.warn("KuCoin falhou, mantendo dados antigos:", results[1].reason);
        }

        return buildResponse();

    } catch (error) {
        console.error("Erro Crítico na API:", error);
        // Mesmo no pior erro, tenta devolver o que tem na memória
        if (Object.keys(tickerMap).length > 0) {
            return buildResponse();
        }
        return NextResponse.json({ error: "Erro interno e sem cache" }, { status: 500 });
     }
}

// Helper para atualizar o mapa global
function updateCache(ticker: any, exchangeName: string) {
    const formatted = formatTicker(ticker, exchangeName);
    
    // CRIA UMA CHAVE ÚNICA: Ex: "Binance:BTC/USDT"
    const uniqueKey = `${exchangeName}:${formatted.pair}`;
    
    // Salva/Sobrescreve no mapa global
    tickerMap[uniqueKey] = formatted;
}

// Helper para montar a resposta final para o Front
function buildResponse() {
    // Converte o Mapa (Objeto) de volta para um Array
    const allExchanges = Object.values(tickerMap);

    return NextResponse.json({
        timestamp: new Date().toISOString(),
        exchanges: allExchanges
    });
}

// Função de formatação (mantida igual, só adicionei tipagem)
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
        lastUpdated: Date.now()
    };
}