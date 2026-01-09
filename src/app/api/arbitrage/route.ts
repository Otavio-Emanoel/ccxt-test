import { NextResponse } from "next/server";
import * as ccxt from "ccxt";

type MarketType = "spot" | "swap";

type ExchangeSlug =
  | "binance"
  | "kucoin"
  | "bybit"
  | "okx"
  | "mexc";

const DEFAULT_SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];
const DEFAULT_EXCHANGES: ExchangeSlug[] = ["binance", "kucoin", "bybit"];

function createExchange(slug: ExchangeSlug, marketType: MarketType): ccxt.Exchange {
  // para simplificar, usamos classes padrão e setamos options quando possível.
  // Foco em "spot" agora; mantemos o parâmetro marketType para futura expansão.
  switch (slug) {
    case "binance":
      return new ccxt.binance({ options: { defaultType: marketType === "swap" ? "swap" : "spot" } });
    case "kucoin":
      return new ccxt.kucoin({ options: { defaultType: marketType === "swap" ? "swap" : "spot" } });
    case "bybit":
      return new ccxt.bybit({ options: { defaultType: marketType === "swap" ? "swap" : "spot" } });
    case "okx":
      return new ccxt.okx({ options: { defaultType: marketType === "swap" ? "swap" : "spot" } });
    case "mexc":
      return new ccxt.mexc({ options: { defaultType: marketType === "swap" ? "swap" : "spot" } });
    default:
      return new ccxt.binance();
  }
}

function parseList(param: string | null | undefined): string[] {
  if (!param) return [];
  return param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const marketType = (searchParams.get("marketType") || "spot") as MarketType;
    const symbols = parseList(searchParams.get("symbols"));
    const exchangesParam = parseList(searchParams.get("exchanges")) as ExchangeSlug[];
    const limit = Number(searchParams.get("limit") || 50);
    const minQuoteVol = Number(searchParams.get("minQuoteVol") || 0); // filtra oportunidades com baixa liquidez

    const usedSymbols = symbols.length ? symbols : DEFAULT_SYMBOLS;
    const usedExchanges = (exchangesParam.length ? exchangesParam : DEFAULT_EXCHANGES).filter(
      (e) => ["binance", "kucoin", "bybit", "okx", "mexc"].includes(e)
    ) as ExchangeSlug[];

    // Instancia e carrega mercados em paralelo
    const exchangesObjs = await Promise.all(
      usedExchanges.map(async (slug) => {
        const ex = createExchange(slug, marketType);
        ex.enableRateLimit = true;
        try {
          await ex.loadMarkets();
        } catch (_) {
          // segue mesmo assim; algumas exchanges podem estar indisponíveis
        }
        return { slug, ex } as { slug: ExchangeSlug; ex: ccxt.Exchange };
      })
    );

    // Busca tickers por exchange
    const perExchangeTickers = await Promise.all(
      exchangesObjs.map(async ({ slug, ex }) => {
        const supported: string[] = usedSymbols.filter((s) => ex.markets?.[s]);
        if (!supported.length) {
          return { slug, map: {} as Record<string, ccxt.Ticker> };
        }
        
        // Adiciona retry logic
        const maxRetries = 2;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const tickers = await ex.fetchTickers(supported);
            return { slug, map: tickers as Record<string, ccxt.Ticker> };
          } catch (err) {
            console.warn(`Falha ao buscar tickers de ${slug} (tentativa ${attempt + 1}/${maxRetries + 1}):`, err);
            if (attempt === maxRetries) {
              // última tentativa: busca individual
              const map: Record<string, ccxt.Ticker> = {};
              for (const s of supported) {
                try {
                  map[s] = await ex.fetchTicker(s);
                  await new Promise(resolve => setTimeout(resolve, 100)); // pequeno delay
                } catch (tickerErr) {
                  console.warn(`Erro ao buscar ${s} em ${slug}:`, tickerErr);
                }
              }
              return { slug, map };
            }
            // aguarda antes de retentar
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
        return { slug, map: {} as Record<string, ccxt.Ticker> };
      })
    );

    type Entry = {
      exchange: ExchangeSlug;
      symbol: string;
      last: number;
      baseVolume?: number;
      quoteVolume?: number;
      open?: number;
      high?: number;
      low?: number;
      changePercent?: number;
      taker?: number;
    };

    const book: Record<string, Entry[]> = {};

    // Normaliza dados
    for (const { slug, map } of perExchangeTickers) {
      const exObj = exchangesObjs.find((e) => e.slug === slug)!.ex;
      for (const sym of Object.keys(map)) {
        const t = map[sym];
        const market = exObj.markets?.[sym];
        if (!t?.last) continue;
        const open = t.open ?? undefined;
        const changePercent = open && t.last ? ((t.last - open) / open) * 100 : undefined;
        const entry: Entry = {
          exchange: slug,
          symbol: sym,
          last: t.last,
          baseVolume: t.baseVolume,
          quoteVolume: t.quoteVolume,
          open,
          high: t.high ?? undefined,
          low: t.low ?? undefined,
          changePercent,
          taker: (market as any)?.taker ?? (market as any)?.fees?.taker,
        };
        book[sym] ||= [];
        book[sym].push(entry);
      }
    }

    // Calcula oportunidades (todas combinações buy/sell por símbolo)
    type Opp = {
      symbol: string;
      buyExchange: ExchangeSlug;
      sellExchange: ExchangeSlug;
      buyPrice: number;
      sellPrice: number;
      spreadAbs: number;
      spreadPct: number;
      buyQuoteVol?: number;
      sellQuoteVol?: number;
      buyChangePct?: number;
      sellChangePct?: number;
      takerBuy?: number;
      takerSell?: number;
      score: number;
    };

    const opportunities: Opp[] = [];
    for (const sym of Object.keys(book)) {
      const entries = book[sym];
      for (let i = 0; i < entries.length; i++) {
        for (let j = 0; j < entries.length; j++) {
          if (i === j) continue;
          const buy = entries[i];
          const sell = entries[j];
          if (sell.last <= buy.last) continue;
          const spreadAbs = sell.last - buy.last;
          const spreadPct = (spreadAbs / buy.last) * 100;
          const liquidity = Math.min(buy.quoteVolume || 0, sell.quoteVolume || 0);
          if (minQuoteVol && liquidity < minQuoteVol) continue;
          const fees = (buy.taker || 0) + (sell.taker || 0);
          const netPct = spreadPct - fees * 100; // desconta taker
          const score = netPct * Math.log10(1 + (liquidity || 1));
          opportunities.push({
            symbol: sym,
            buyExchange: buy.exchange,
            sellExchange: sell.exchange,
            buyPrice: buy.last,
            sellPrice: sell.last,
            spreadAbs,
            spreadPct,
            buyQuoteVol: buy.quoteVolume,
            sellQuoteVol: sell.quoteVolume,
            buyChangePct: buy.changePercent,
            sellChangePct: sell.changePercent,
            takerBuy: buy.taker,
            takerSell: sell.taker,
            score,
          });
        }
      }
    }

    // Ordena por score e limita
    opportunities.sort((a, b) => b.score - a.score);
    const top = opportunities.slice(0, limit);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      marketType,
      exchanges: usedExchanges,
      symbols: usedSymbols,
      count: top.length,
      opportunities: top,
    });
  } catch (err) {
    console.error("erro em /api/arbitrage:", err);
    return NextResponse.json({ error: "Erro ao calcular arbitragem" }, { status: 500 });
  }
}
