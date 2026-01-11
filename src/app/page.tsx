'use client'; // Necessário pois usamos hooks do React (useState, useEffect)
import { useState, useEffect } from 'react';
import { 
  Chart as ChartJS, 
  LineElement, 
  PointElement, 
  LinearScale, 
  CategoryScale, 
  Tooltip, 
  Legend 
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Registra componentes do Chart.js
ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

export default function Dashboard() {
  // --- Estados de Cotação Geral ---
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // --- Estados do Modal e Gráfico ---
  const [selectedEx, setSelectedEx] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [candles, setCandles] = useState<any[]>([]);
  const [loadingCandles, setLoadingCandles] = useState(false);

  // --- Estados da Arbitragem ---
  const [arb, setArb] = useState<any>(null);
  const [arbLoading, setArbLoading] = useState(true);
  const [arbUpdating, setArbUpdating] = useState(false);
  
  // --- Filtros e Configurações ---
  const [symbols, setSymbols] = useState<string>("BTC/USDT,ETH/USDT,SOL/USDT,XRP/USDT,DOGE/USDT");
  const [exchanges, setExchanges] = useState<string>("binance,kucoin,bybit,gateio");
  const [minVol, setMinVol] = useState<number>(0);
  const [minSpread, setMinSpread] = useState<number>(-1.0); // Começa mostrando spreads levemente negativos para monitoramento
  const [search, setSearch] = useState("");
  const [refreshMs, setRefreshMs] = useState<number>(5000);

  // --- Ordenação (Padrão: Maior Spread) ---
  const [sortKey, setSortKey] = useState<string>("spreadPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Formata preços de forma inteligente (Fiat vs Cripto)
  const formatPrice = (price: number, pair: string) => {
    if (!price || !pair) return 'R$ 0,00';
    const currency = pair.split('/')[1];
    const acceptedCurrencies = ['BRL', 'USD', 'EUR', 'GBP'];
    
    if (acceptedCurrencies.includes(currency)) {
      return price.toLocaleString('pt-BR', { style: 'currency', currency: currency });
    } else {
      return `${price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${currency}`;
    }
  };

  // Busca cotações gerais (Cards)
  const fetchPrices = async () => {
    try {
      const res = await fetch('/api/prices');
      const json = await res.json();
      setData(json);
      setLoading(false);
    } catch (err) {
      console.error("Erro ao buscar preços:", err);
    }
  };

  // Busca oportunidades de arbitragem (Tabela)
  const fetchArbitrage = async () => {
    try {
      const hasData = !!arb;
      if (hasData) setArbUpdating(true);
      else setArbLoading(true);

      const params = new URLSearchParams({
        symbols,
        exchanges,
        minQuoteVol: String(minVol || 0),
        minSpread: String(minSpread), // Envia o filtro de spread para o backend
      }).toString();

      const res = await fetch(`/api/arbitrage?${params}`);
      const json = await res.json();
      setArb(json);
    } catch (err) {
      console.error("Erro ao buscar arbitragem:", err);
    } finally {
      if (arb) setArbUpdating(false);
      else setArbLoading(false);
    }
  };

  // Utilitário para pegar slug da exchange
  const getExchangeSlug = (name: string) => {
    const n = (name || '').toLowerCase();
    if (n.includes('binance')) return 'binance';
    if (n.includes('kucoin')) return 'kucoin';
    if (n.includes('bybit')) return 'bybit';
    if (n.includes('gate')) return 'gateio';
    return 'binance';
  };

  // Abre modal com gráfico de velas
  const openDetails = async (ex: any) => {
    try {
      setSelectedEx(ex);
      setIsModalOpen(true);
      setLoadingCandles(true);
      const exchange = getExchangeSlug(ex.name);
      const params = new URLSearchParams({
        exchange,
        pair: ex.pair,
        timeframe: '1h',
        limit: '120',
      }).toString();
      const res = await fetch(`/api/candles?${params}`);
      const json = await res.json();
      setCandles(json.candles || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCandles(false);
    }
  };

  const closeDetails = () => {
    setIsModalOpen(false);
    setSelectedEx(null);
    setCandles([]);
  };

  // Efeitos (Início e Intervalo)
  useEffect(() => {
    fetchPrices();
    fetchArbitrage();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      fetchPrices();
      fetchArbitrage();
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, symbols, exchanges, minVol, minSpread]); // Atualiza se mudar filtros

  // Controle de Ordenação da Tabela
  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // Lógica de Filtragem e Ordenação no Front-end
  const filteredOpps = (arb?.opportunities || [])
    .filter((o: any) =>
      !search ||
      o.symbol.toLowerCase().includes(search.toLowerCase()) ||
      o.buyExchange.toLowerCase().includes(search.toLowerCase()) ||
      o.sellExchange.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a: any, b: any) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Carregando sistema...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8 font-sans">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-linear-to-r from-blue-400 to-purple-500">
            Arbitragem Monitor <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded ml-2">BETA</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Monitoramento multi-exchange em tempo real</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          Última atualização: {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '--:--:--'}
        </div>
      </header>

      {/* --- BARRA DE CONTROLES --- */}
      <div className="mb-6 bg-gray-800/50 border border-gray-700 rounded-xl p-5 shadow-lg backdrop-blur-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 items-end">
          
          <div className="col-span-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Moedas (CSV)</label>
            <input 
              value={symbols} 
              onChange={e=>setSymbols(e.target.value)} 
              placeholder="BTC/USDT, ETH/USDT..." 
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-hidden transition"
            />
          </div>

          <div className="col-span-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Exchanges</label>
            <input 
              value={exchanges} 
              onChange={e=>setExchanges(e.target.value)} 
              placeholder="binance, kucoin..." 
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-hidden transition"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Min Spread %</label>
            <input 
              type="number" 
              value={minSpread} 
              onChange={e=>setMinSpread(Number(e.target.value))} 
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-hidden"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Min Vol (USDT)</label>
            <input 
              type="number" 
              value={minVol} 
              onChange={e=>setMinVol(Number(e.target.value))} 
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-hidden"
            />
          </div>

          <div className="col-span-1 md:col-span-2 lg:col-span-2">
             <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Filtrar por Nome</label>
             <div className="relative">
                <input 
                  value={search} 
                  onChange={e=>setSearch(e.target.value)} 
                  placeholder="Ex: BTC, Binance..." 
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-blue-500 outline-hidden"
                />
                <svg className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
             </div>
          </div>

          <div className="flex gap-2">
             <div className="grow">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Refresh (ms)</label>
                <input 
                  type="number" 
                  value={refreshMs} 
                  onChange={e=>setRefreshMs(Number(e.target.value))} 
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-center"
                />
             </div>
             <button 
               onClick={() => { fetchPrices(); fetchArbitrage(); }} 
               className="h-[38px] mt-auto px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
             >
               Atualizar
             </button>
          </div>
        </div>
        
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 border-t border-gray-700/50 pt-2">
           <span className={`w-2 h-2 rounded-full ${arbLoading ? 'bg-yellow-500 animate-pulse' : arbUpdating ? 'bg-blue-400 animate-pulse' : 'bg-green-500'}`}></span>
           <span>{arbLoading ? 'Conectando...' : arbUpdating ? 'Sincronizando dados...' : 'Sistema Online'}</span>
           <span className="hidden md:inline">•</span>
           <span className="hidden md:inline truncate max-w-md">Exchanges ativas: {arb?.exchanges?.join(', ') || '...'}</span>
        </div>
      </div>

      {/* --- CONTROLES DE ORDENAÇÃO --- */}
      <div className="mt-6 flex gap-2 flex-wrap items-center">
        <span className="text-sm font-semibold text-gray-400">Ordenar por:</span>
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={()=>toggleSort('spreadPct')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortKey === 'spreadPct' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Spread % {sortKey === 'spreadPct' && (sortDir === 'asc' ? '↑' : '↓')}
          </button>
          
          <button 
            onClick={()=>toggleSort('symbol')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortKey === 'symbol' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Nome {sortKey === 'symbol' && (sortDir === 'asc' ? 'A→Z' : 'Z→A')}
          </button>

          <button 
            onClick={()=>toggleSort('score')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortKey === 'score' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Score {sortKey === 'score' && (sortDir === 'asc' ? '↑' : '↓')}
          </button>

          <button 
            onClick={()=>toggleSort('buyExchange')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortKey === 'buyExchange' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Compra {sortKey === 'buyExchange' && (sortDir === 'asc' ? 'A→Z' : 'Z→A')}
          </button>

          <button 
            onClick={()=>toggleSort('sellExchange')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortKey === 'sellExchange' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Venda {sortKey === 'sellExchange' && (sortDir === 'asc' ? 'A→Z' : 'Z→A')}
          </button>
        </div>
      </div>

      {/* --- TABELA DE ARBITRAGEM (Desktop) --- */}
      <div className="hidden lg:block bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-xl mb-10 ring-1 ring-white/5 mt-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-800 text-gray-400 uppercase text-xs font-semibold tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Par</th>
                <th className="px-4 py-3 text-left">Compra</th>
                <th className="px-4 py-3 text-right">Preço</th>
                <th className="px-4 py-3 text-left pl-6">Venda</th>
                <th className="px-4 py-3 text-right">Preço</th>
                <th className="px-4 py-3 text-right">Spread %</th>
                <th className="px-4 py-3 text-right">Spread $</th>
                <th className="px-4 py-3 text-right text-gray-500">Vol 24h (USDT)</th>
                <th className="px-4 py-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {!arb && arbLoading ? (
                <tr><td className="px-4 py-8 text-center text-gray-500" colSpan={9}>Carregando oportunidades de arbitragem...</td></tr>
              ) : filteredOpps.length > 0 ? (
                filteredOpps.map((o: any) => (
                  <tr key={`${o.symbol}-${o.buyExchange}-${o.sellExchange}`} className="hover:bg-gray-800/60 transition-colors group">
                    <td className="px-4 py-3 font-bold text-gray-200">{o.symbol}</td>
                    
                    {/* Compra */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900/30 text-green-400 border border-green-900/50">
                        {o.buyExchange.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">
                      {o.buyPrice?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                    </td>

                    {/* Venda */}
                    <td className="px-4 py-3 pl-6">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-900/30 text-red-400 border border-red-900/50">
                        {o.sellExchange.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">
                      {o.sellPrice?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                    </td>

                    {/* Spread */}
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${o.spreadPct > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                        {o.spreadPct > 0 ? '+' : ''}{o.spreadPct.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400">
                      ${o.spreadAbs?.toFixed(4)}
                    </td>

                    <td className="px-4 py-3 text-right text-xs text-gray-500">
                      {Number(o.buyQuoteVol).toLocaleString('en-US', { notation: 'compact' })} / {Number(o.sellQuoteVol).toLocaleString('en-US', { notation: 'compact' })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                      {o.score.toFixed(1)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-12 text-center text-gray-500" colSpan={9}>
                    <div className="flex flex-col items-center justify-center">
                      <svg className="w-10 h-10 mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <p>Nenhuma oportunidade encontrada.</p>
                      <p className="text-xs mt-1">Tente reduzir o filtro de "Min Spread" ou adicionar mais exchanges.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-800/30 border-t border-gray-800 text-xs text-right text-gray-500">
           Exibindo {filteredOpps.length} de {arb?.count || 0} pares analisados
        </div>
      </div>

      {/* --- CARDS DE ARBITRAGEM (Mobile) --- */}
      <div className="lg:hidden space-y-3 mt-4 mb-10">
        {!arb && arbLoading ? (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center text-gray-500">
            Carregando oportunidades de arbitragem...
          </div>
        ) : filteredOpps.length > 0 ? (
          filteredOpps.map((o: any) => (
            <div key={`${o.symbol}-${o.buyExchange}-${o.sellExchange}`} className="bg-gray-900 border border-gray-700 rounded-xl p-4 shadow-lg ring-1 ring-white/5">
              {/* Header */}
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-800">
                <h3 className="text-lg font-bold text-gray-200">{o.symbol}</h3>
                <div className="text-right">
                  <div className={`text-lg font-bold ${o.spreadPct > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                    {o.spreadPct > 0 ? '+' : ''}{o.spreadPct.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-500">Spread</div>
                </div>
              </div>

              {/* Compra e Venda */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1 uppercase font-semibold">Comprar em</div>
                  <div className="mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900/30 text-green-400 border border-green-900/50">
                      {o.buyExchange.toUpperCase()}
                    </span>
                  </div>
                  <div className="font-mono text-sm text-gray-300">
                    ${o.buyPrice?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Vol: {Number(o.buyQuoteVol).toLocaleString('en-US', { notation: 'compact' })}
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1 uppercase font-semibold">Vender em</div>
                  <div className="mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-900/30 text-red-400 border border-red-900/50">
                      {o.sellExchange.toUpperCase()}
                    </span>
                  </div>
                  <div className="font-mono text-sm text-gray-300">
                    ${o.sellPrice?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Vol: {Number(o.sellQuoteVol).toLocaleString('en-US', { notation: 'compact' })}
                  </div>
                </div>
              </div>

              {/* Detalhes */}
              <div className="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-800">
                <div>
                  <span className="text-gray-400">Spread $:</span> ${o.spreadAbs?.toFixed(4)}
                </div>
                <div>
                  <span className="text-gray-400">Score:</span> {o.score.toFixed(1)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center">
            <svg className="w-10 h-10 mb-3 text-gray-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500">Nenhuma oportunidade encontrada.</p>
            <p className="text-xs mt-1 text-gray-600">Tente reduzir o filtro de "Min Spread" ou adicionar mais exchanges.</p>
          </div>
        )}
        <div className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs text-center text-gray-500">
          Exibindo {filteredOpps.length} de {arb?.count || 0} pares analisados
        </div>
      </div>

      {/* --- CARDS DE PREÇO (INDIVIDUAIS) --- */}
      <h2 className="text-xl font-bold mb-4 text-gray-300 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        Monitoramento Individual
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {data?.exchanges?.map((ex: any) => (
          <div 
            // CORREÇÃO: Chave única combinando nome + par para evitar erro do React
            key={`${ex.name}-${ex.pair}`} 
            className="bg-gray-800/40 rounded-xl p-5 border border-gray-700/50 hover:border-blue-500/50 hover:bg-gray-800/60 transition duration-200 group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
               <button onClick={() => openDetails(ex)} className="bg-blue-600 p-1.5 rounded-lg text-white hover:bg-blue-500 shadow-lg">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
               </button>
            </div>

            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-lg font-bold text-gray-200">{ex.name}</h3>
                <span className="text-xs font-mono text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded">{ex.pair}</span>
              </div>
              <div className={`text-sm font-bold ${ex.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                 {ex.changePercent > 0 ? '+' : ''}{ex.changePercent?.toFixed(2)}%
              </div>
            </div>

            <div className="text-2xl font-bold text-white mb-4 tracking-tight">
              {formatPrice(ex.price, ex.pair)}
            </div>

            <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-xs text-gray-400">
              <div className="flex justify-between"><span>Máx:</span> <span className="text-gray-300">{formatPrice(ex.high, ex.pair)}</span></div>
              <div className="flex justify-between"><span>Mín:</span> <span className="text-gray-300">{formatPrice(ex.low, ex.pair)}</span></div>
              <div className="flex justify-between col-span-2 pt-2 border-t border-gray-700/50 mt-1">
                 <span>Vol:</span> 
                 <span className="text-gray-300 font-mono">
                   {ex.quoteVolume 
                     ? ex.quoteVolume.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }) 
                     : ex.vol?.toFixed(2)}
                 </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* --- MODAL DE DETALHES --- */}
      {isModalOpen && selectedEx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeDetails} />
          <div className="relative z-10 w-full max-w-4xl bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                   {selectedEx.name} <span className="text-gray-500">/</span> {selectedEx.pair}
                </h3>
                <p className="text-gray-400 text-sm mt-1">Preço Atual: <span className="text-white font-mono text-base">{formatPrice(selectedEx.price, selectedEx.pair)}</span></p>
              </div>
              <button onClick={closeDetails} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full transition text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="h-[350px] w-full bg-gray-800/30 rounded-xl border border-gray-700/50 p-4 mb-6">
              {loadingCandles ? (
                <div className="h-full flex items-center justify-center text-gray-400 flex-col gap-3">
                   <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                   <span>Carregando dados históricos...</span>
                </div>
              ) : candles.length > 0 ? (
                <Line
                  data={{
                    labels: candles.map(c => new Date(c.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })),
                    datasets: [
                      {
                        label: 'Preço',
                        data: candles.map(c => c.close),
                        borderColor: '#3b82f6',
                        backgroundColor: (context) => {
                          const ctx = context.chart.ctx;
                          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
                          gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
                          return gradient;
                        },
                        borderWidth: 2,
                        fill: true,
                        tension: 0.1, // Linha um pouco mais reta para precisão
                        pointRadius: 0, // Remove bolinhas para visual mais limpo
                        pointHoverRadius: 4,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                      mode: 'index',
                      intersect: false,
                    },
                    plugins: {
                      legend: { display: false },
                      tooltip: { 
                         enabled: true,
                         backgroundColor: 'rgba(17, 24, 39, 0.9)',
                         titleColor: '#fff',
                         bodyColor: '#ccc',
                         borderColor: '#374151',
                         borderWidth: 1,
                         padding: 10,
                         displayColors: false,
                      },
                    },
                    scales: {
                      x: { 
                         display: true, 
                         grid: { display: false },
                         ticks: { color: '#6b7280', maxTicksLimit: 8 } 
                      },
                      y: { 
                         display: true, 
                         position: 'right',
                         grid: { color: 'rgba(255,255,255,0.05)' },
                         ticks: { color: '#6b7280' } 
                      },
                    },
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Dados de gráfico indisponíveis para este par.
                </div>
              )}
            </div>
            
            <div className="flex justify-end">
               <button onClick={closeDetails} className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition font-medium">
                 Fechar
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}