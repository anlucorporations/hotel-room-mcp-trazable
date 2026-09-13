import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Rampa inicial hacia 50 usuarios
    { duration: '2m', target: 200 },  // Rampa hasta 200 usuarios concurrentes
    { duration: '7m', target: 200 },  // Carga sostenida de 200 usuarios (SLA RNF-01)
    { duration: '1m', target: 0 },    // Rampa de bajada
  ],
  thresholds: {
    // 95% de las peticiones deben responder en < 500ms (SLA RNF-01)
    http_req_duration: ['p(95)<500'],
    // 0% de errores 5xx (tasa de fallos < 1%) (SLA RNF-02)
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // 1. Consulta del catálogo público de noches con paginación
  const catalogRes = http.get(`${BASE_URL}/api/nfts?status=AVAILABLE&limit=12&offset=0`);
  check(catalogRes, {
    'catalog status 200': (r) => r.status === 200,
    'catalog latency < 500ms': (r) => r.timings.duration < 500,
  });

  // 2. Consulta del histórico de ventas
  const historyRes = http.get(`${BASE_URL}/api/sales/history?limit=10&offset=0`);
  check(historyRes, {
    'history status 200': (r) => r.status === 200,
    'history latency < 500ms': (r) => r.timings.duration < 500,
  });

  // 3. Health check de readiness
  const healthRes = http.get(`${BASE_URL}/health/ready`);
  check(healthRes, {
    'health ready status 200': (r) => r.status === 200,
  });

  sleep(1);
}
