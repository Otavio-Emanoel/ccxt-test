// app/page.tsx
'use client'; // Necessário pois vamos usar useEffect
import { useState, useEffect } from 'react';

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);


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
          <div key={ex.name} className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg hover:border-blue-500 transition">
            <h2 className="text-xl font-semibold text-gray-400">{ex.name}</h2>
            <p className="text-sm text-gray-500 mb-4">{ex.pair}</p>
            
            <div className="text-3xl font-bold text-green-400">
              {formatPrice(ex.price, ex.pair)}
            </div>
            
            <p className="mt-2 text-xs text-gray-500">Vol: {ex.vol?.toFixed(2)}</p>
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
    </div>
  );
}