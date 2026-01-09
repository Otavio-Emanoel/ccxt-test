import { NextResponse } from "next/server";
import * as ccxt from "ccxt"; // Importação padrão é mais segura

// ============================================================================
// CONFIGURAÇÃO GLOBAL
// ============================================================================
const exchangesMap: Record<string, ccxt.Exchange> = {
    binance: new ccxt.binance({ enableRateLimit: true }),
    kucoin: new ccxt.kucoin({ enableRateLimit: true }),
    bybit: new ccxt.bybit({ enableRateLimit: true }),
    okx: new ccxt.okx({ enableRateLimit: true }),
    gateio: new ccxt.gateio({ enableRateLimit: true }),
};

const priceCache: Record<string, any> = {};
let lastFetchTime = 0;
const CACHE_TTL = 2000; // 2 segundos

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        
        const symbolsParam = searchParams.get("symbols") || "BTC/USDT";
        const exchangesParam = searchParams.get("exchanges") || "binance,kucoin";
        const minQuoteVol = parseFloat(searchParams.get("minQuoteVol") || "0");
        // MUDANÇA: Default agora é -100 para mostrar TUDO (inclusive prejuízo)
        // Isso ajuda a saber se o sistema está funcionando
        const minSpread = parseFloat(searchParams.get("minSpread") || "-100"); 

        const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase());
        const selectedExchanges = exchangesParam.split(",").map(e => e.trim().toLowerCase());

        const now = Date.now();
        if (now - lastFetchTime > CACHE_TTL) {
            lastFetchTime = now;
            await updatePrices(selectedExchanges, symbols);
        }

        const opportunities = [];

        // Verifica quantos dados temos no cache para depuração
        let validPricesCount = 0;

        for (const symbol of symbols) {
            const prices = [];
            
            for (const exName of selectedExchanges) {
                const cacheKey = `${exName}:${symbol}`;
                const data = priceCache[cacheKey];
                
                if (data && (!minQuoteVol || data.quoteVolume >= minQuoteVol)) {
                    prices.push({ exchange: exName, ...data });
                    validPricesCount++;
                }
            }

            // Compara exchanges (Todos contra Todos)
            for (let i = 0; i < prices.length; i++) {
                for (let j = 0; j < prices.length; j++) {
                    if (i === j) continue; // Não compara com ela mesma

                    const buy = prices[i];  
                    const sell = prices[j]; 

                    // SEGREDO: Removemos a trava (buy.ask < sell.bid)
                    // Calculamos o spread real, mesmo que seja negativo
                    if (buy.ask && sell.bid) {
                        const spreadAbs = sell.bid - buy.ask;
                        const spreadPct = (spreadAbs / buy.ask) * 100;

                        if (spreadPct >= minSpread) {
                            opportunities.push({
                                symbol: symbol,
                                buyExchange: buy.exchange,
                                buyPrice: buy.ask,
                                sellExchange: sell.exchange,
                                sellPrice: sell.bid,
                                spreadAbs: spreadAbs,
                                spreadPct: spreadPct,
                                buyQuoteVol: buy.quoteVolume,
                                sellQuoteVol: sell.quoteVolume,
                                score: spreadPct, // Score simples
                                timestamp: Date.now()
                            });
                        }
                    }
                }
            }
        }

        opportunities.sort((a, b) => b.spreadPct - a.spreadPct);

        console.log(`[API] Arbitragem: ${opportunities.length} opps encontradas. (Cache Hits: ${validPricesCount})`);

        return NextResponse.json({
            timestamp: new Date().toISOString(),
            opportunities: opportunities
        });

    } catch (error) {
        console.error("Erro CRÍTICO na rota de arbitragem:", error);
        return NextResponse.json({ error: "Erro interno", opportunities: [] }, { status: 500 });
    }
}

async function updatePrices(exchangesList: string[], symbols: string[]) {
    const promises = exchangesList.map(async (exName) => {
        const exchange = exchangesMap[exName];
        if (!exchange) return;

        try {
            // Tenta buscar APENAS os símbolos pedidos (Rápido)
            let tickers = await exchange.fetchTickers(symbols);

            // Atualiza cache
            Object.values(tickers).forEach((t: any) => {
                if(!t) return;
                const key = `${exName}:${t.symbol}`;
                priceCache[key] = {
                    bid: t.bid || t.close, 
                    ask: t.ask || t.close,
                    last: t.last,
                    quoteVolume: t.quoteVolume || (t.baseVolume * t.last) || 0,
                    timestamp: Date.now()
                };
            });
            // console.log(`[${exName}] Atualizado com sucesso.`);
            
        } catch (err) {
            console.warn(`[${exName}] Falha ao buscar lista específica. Tentando buscar TUDO...`);
            try {
                // FALLBACK: Se falhar (ex: símbolo inválido), busca TUDO
                const tickers = await exchange.fetchTickers();
                // Filtra apenas o que queremos e salva
                Object.values(tickers).forEach((t: any) => {
                    if(!t || !symbols.includes(t.symbol)) return; // Só salva se for um dos nossos símbolos
                    const key = `${exName}:${t.symbol}`;
                    priceCache[key] = {
                        bid: t.bid || t.close,
                        ask: t.ask || t.close,
                        last: t.last,
                        quoteVolume: t.quoteVolume || 0,
                        timestamp: Date.now()
                    };
                });
                console.log(`[${exName}] Recuperado via Fallback (Busca completa).`);
            } catch (fatal) {
                const errorMessage = fatal instanceof Error ? fatal.message : String(fatal);
                console.error(`[${exName}] MORREU:`, errorMessage);
            }
        }
    });

    await Promise.all(promises);
}