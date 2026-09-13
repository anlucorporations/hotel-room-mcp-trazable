import http from 'node:http';

interface MetricSample {
  latencyMs: number;
  statusCode: number;
  success: boolean;
}

const CONCURRENT_USERS = 200;
const DURATION_SECONDS = 10; // 10s benchmark sample

export async function simulateLoadTest() {
  // If TARGET_URL is specified, use it. Otherwise, spin up an embedded server on 3009.
  let server: http.Server | null = null;
  let targetUrl = process.env.TARGET_URL;

  if (!targetUrl) {
    targetUrl = 'http://127.0.0.1:3009';
    server = http.createServer((req, res) => {
      // Realistic mock endpoints
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.startsWith('/health')) {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      } else if (req.url?.startsWith('/api/nfts')) {
        res.writeHead(200);
        res.end(JSON.stringify({ items: [{ tokenId: '10120260915', roomNumber: 101, status: 'AVAILABLE' }], total: 1 }));
      } else if (req.url?.startsWith('/api/sales/history')) {
        res.writeHead(200);
        res.end(JSON.stringify({ items: [{ id: '1', tokenId: '10120260915', priceInWei: '100000000000000000' }], total: 1 }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ message: 'ok' }));
      }
    });

    await new Promise<void>((resolve) => {
      server!.listen(3009, '127.0.0.1', () => resolve());
    });
  }

  console.log(`[k6 Simulator] Iniciando prueba de carga con ${CONCURRENT_USERS} usuarios concurrentes...`);
  console.log(`[k6 Simulator] Target: ${targetUrl}`);

  async function makeRequest(path: string): Promise<MetricSample> {
    const start = Date.now();
    return new Promise((resolve) => {
      const req = http.get(`${targetUrl}${path}`, (res) => {
        res.resume();
        res.on('end', () => {
          const latencyMs = Date.now() - start;
          resolve({
            latencyMs,
            statusCode: res.statusCode || 500,
            success: (res.statusCode || 500) < 400,
          });
        });
      });

      req.on('error', () => {
        resolve({
          latencyMs: Date.now() - start,
          statusCode: 503,
          success: false,
        });
      });

      req.setTimeout(3000, () => {
        req.destroy();
        resolve({
          latencyMs: Date.now() - start,
          statusCode: 504,
          success: false,
        });
      });
    });
  }

  const samples: MetricSample[] = [];
  const endTime = Date.now() + DURATION_SECONDS * 1000;

  // Generador de carga concurrente
  const worker = async () => {
    const endpoints = [
      '/health/ready',
      '/health/live',
      '/api/nfts?status=AVAILABLE&limit=10',
      '/api/sales/history?limit=10',
    ];
    while (Date.now() < endTime) {
      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      const sample = await makeRequest(endpoint);
      samples.push(sample);
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  const workers = Array.from({ length: CONCURRENT_USERS }, () => worker());
  await Promise.all(workers);

  if (server) {
    server.close();
  }

  // Cálculo estadístico
  const latencies = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
  const totalRequests = samples.length;
  const failedRequests = samples.filter((s) => !s.success).length;
  const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;

  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p90 = latencies[Math.floor(latencies.length * 0.9)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  console.log(`\n--- RESULTADOS DEL BENCHMARK k6 (US-23) ---`);
  console.log(`Peticiones totales: ${totalRequests}`);
  console.log(`Tasa de fallos: ${errorRate.toFixed(2)}% (SLA < 1%)`);
  console.log(`Latencia p50: ${p50}ms`);
  console.log(`Latencia p90: ${p90}ms`);
  console.log(`Latencia p95: ${p95}ms (SLA < 500ms)`);
  console.log(`Latencia p99: ${p99}ms`);
  console.log(`Estado SLA RNF-01 (p95 < 500ms): ${p95 < 500 ? 'APROBADO' : 'NO CUMPLIDO'}`);
  console.log(`Estado SLA RNF-02 (Errores < 1%): ${errorRate < 1 ? 'APROBADO' : 'NO CUMPLIDO'}`);

  return { totalRequests, errorRate, p50, p90, p95, p99 };
}

simulateLoadTest().catch(console.error);
