// app/page.tsx
'use client'; // Necessário pois vamos usar useEffect
import { useState, useEffect } from 'react';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEx, setSelectedEx] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [candles, setCandles] = useState<any[]>([]);
  const [loadingCandles, setLoadingCandles] = useState(false);


  // Função para formatar o preço sem quebrar
  const formatPrice = (price: number, pair: string) => {
    if (!price || !pair) return 'R$ 0,00';
    const currency = pair.split('/')[1]; // Pega o que vem depois da barra (BRL, USDT, etc)
    const acceptedCurrencies = ['BRL', 'USD', 'EUR', 'GBP']; // Moedas "Oficiais"
    if (acceptedCurrencies.includes(currency)) {
      // Se for Real ou Dólar, usa a formatação bonitinha com R$ ou $
      return price.toLocaleString('pt-BR', { style: 'currency', currency: currency });
    } else {
      // Se for USDT ou outra Cripto, formata o número e adiciona o nome no final
      // Ex: 100.00 USDT
      return `${price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${currency}`;
    }
  };

  // Função para buscar os dados
  const fetchPrices = async () => {
    try {
      const res = await fetch('/api/prices');
      const json = await res.json();
      setData(json);
      setLoading(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Mapeia nome da exchange para slug da API
  const getExchangeSlug = (name: string) => {
    const n = (name || '').toLowerCase();
    if (n.includes('binance')) return 'binance';
    if (n.includes('kucoin')) return 'kucoin';
    return 'binance';
  };

  // Buscar candles ao abrir modal
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

  useEffect(() => {
    fetchPrices();
    // Atualiza a cada 30 segundos (Poling simples)
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-10 text-white">Carregando cotações...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">Arbitragem Monitor (BETA)</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data?.exchanges.map((ex: any) => (
          <div key={ex.name} className="bg-linear-to-br from-gray-800 to-gray-900 p-6 rounded-2xl border border-gray-700 shadow-xl hover:shadow-2xl hover:border-blue-500 transition">
            <h2 className="text-xl font-semibold text-gray-400">{ex.name}</h2>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-500">{ex.pair}</span>
              <span className={`text-xs px-2 py-1 rounded-full ${ex.changePercent > 0 ? 'bg-green-500/20 text-green-400' : ex.changePercent < 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-300'}`}>{ex.changePercent?.toFixed(2)}%</span>
            </div>

            <div className="text-3xl font-bold text-green-400">
              {formatPrice(ex.price, ex.pair)}
            </div>

            <div className="mt-3 text-xs text-gray-300 grid grid-cols-2 gap-2">
              <div>Variação 24h: <span className={ex.changePercent > 0 ? 'text-green-400' : ex.changePercent < 0 ? 'text-red-400' : 'text-gray-400'}>{ex.changePercent?.toFixed(2)}%</span></div>
              <div>Máx 24h: {formatPrice(ex.high, ex.pair)}</div>
              <div>Mín 24h: {formatPrice(ex.low, ex.pair)}</div>
              <div>Abertura 24h: {formatPrice(ex.open, ex.pair)}</div>
              <div>Vol: {ex.vol?.toFixed(2)}</div>
              <div>Vol USDT: {ex.quoteVolume ? ex.quoteVolume.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</div>
            </div>

            <div className="mt-4 flex justify-end">
              <button onClick={() => openDetails(ex)} className="px-3 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-700">Detalhes</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-gray-800/50 rounded-lg">
        <p className="text-sm text-gray-400">
          Última atualização: {new Date(data?.timestamp).toLocaleTimeString()}
        </p>
        <button
          onClick={fetchPrices}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
        >
          Atualizar Agora
        </button>
      </div>

      {/* Modal de detalhes */}
      {isModalOpen && selectedEx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={closeDetails} />
          <div className="relative z-10 w-[95vw] max-w-4xl bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-2xl font-semibold text-white">{selectedEx.name} • {selectedEx.pair}</h3>
                <p className="text-sm text-gray-400">Preço atual: {formatPrice(selectedEx.price, selectedEx.pair)}</p>
              </div>
              <button onClick={closeDetails} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-800/60 rounded-lg p-3">
                <div className="text-xs text-gray-400">Abertura 24h</div>
                <div className="text-sm">{formatPrice(selectedEx.open, selectedEx.pair)}</div>
              </div>
              <div className="bg-gray-800/60 rounded-lg p-3">
                <div className="text-xs text-gray-400">Máx 24h</div>
                <div className="text-sm">{formatPrice(selectedEx.high, selectedEx.pair)}</div>
              </div>
              <div className="bg-gray-800/60 rounded-lg p-3">
                <div className="text-xs text-gray-400">Mín 24h</div>
                <div className="text-sm">{formatPrice(selectedEx.low, selectedEx.pair)}</div>
              </div>
            </div>

            <div className="bg-gray-800/40 rounded-lg p-4">
              {loadingCandles ? (
                <div className="text-gray-400">Carregando gráfico...</div>
              ) : candles.length > 0 ? (
                <Line
                  data={{
                    labels: candles.map(c => new Date(c.time).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })),
                    datasets: [
                      {
                        label: 'Preço de Fechamento',
                        data: candles.map(c => c.close),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        tension: 0.25,
                        pointRadius: 0,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { enabled: true },
                    },
                    scales: {
                      x: { display: true, grid: { display: false } },
                      y: { display: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                    },
                  }}
                  height={320}
                />
              ) : (
                <div className="text-gray-400">Sem dados de candles.</div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button onClick={closeDetails} className="px-4 py-2 text-sm rounded-md bg-gray-700 hover:bg-gray-600">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}