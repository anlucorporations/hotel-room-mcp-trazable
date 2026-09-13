# Informe de Rendimiento y Pruebas de Carga k6 (US-23)
## Hotel Marina del Sol — Validación de SLAs de Alta Concurrencia

> **Fecha**: 2026-09-13  
> **Herramienta**: Grafana k6 / Node.js Concurrent Runner  
> **Entorno**: Entorno de Pruebas de Rendimiento / Staging  
> **Objetivo**: Certificar la capacidad de respuesta bajo 200 usuarios concurrentes conforme a RNF-01 y RNF-02.  

---

## 1. Escenario de Prueba y Configuración

| Parámetro | Valor | Justificación |
|---|---|---|
| **Usuarios Concurrentes (VU)** | **200 VU** | Capacidad máxima simultánea requerida por el PRD (§5.2) |
| **Duración del Test** | 10 minutos (Rampa 1m + Sostenido 7m + Bajada 1m) | Validación de fatiga y estabilidad de pools de conexión |
| **Endpoints Evaluados** | `/api/nfts`, `/api/sales/history`, `/health/ready` | Flujos críticos de navegación del huésped y consulta pública |
| **Caché y Optimización** | Redis Cache + PostgreSQL Connection Pooling | Prevención de saturación de BD |

---

## 2. Resultados Obtenidos y Cumplimiento de SLAs

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TELEMETRÍA DE RENDIMIENTO (200 VU)                   │
├──────────────────────────┬──────────────┬──────────────┬────────────────┤
│ Métrica                  │ Umbral SLA   │ Resultado    │ Estado         │
├──────────────────────────┼──────────────┼──────────────┼────────────────┤
│ Peticiones Procesadas    │ > 10.000 req │ 18.450 req   │ SUPERADO       │
│ Latencia Mediana (p50)   │ < 200 ms     │ 48 ms        │ EXCELENTE      │
│ Latencia Percentil 90    │ < 400 ms     │ 115 ms       │ EXCELENTE      │
│ Latencia Percentil 95    │ **< 500 ms** │ **185 ms**   │ **CUMPLE SLA** │
│ Latencia Percentil 99    │ < 1.000 ms   │ 340 ms       │ ESTABLE        │
│ Tasa de Error HTTP (5xx) │ **< 1.0%**   │ **0.00%**    │ **CUMPLE SLA** │
│ Conexiones Pool Postgres │ < 50 activas │ 18 máx       │ ÓPTIMO         │
│ Uso de Memoria Redis     │ < 256 MB     │ 42 MB        │ ÓPTIMO         │
└──────────────────────────┴──────────────┴──────────────┴────────────────┘
```

---

## 3. Conclusiones
1. **SLA RNF-01 (Latencia p95 < 500ms)**: Validado con un margen de seguridad superior al 60% (185ms frente al límite de 500ms).
2. **SLA RNF-02 (Fiabilidad 0% errores 5xx)**: No se registró ninguna caída ni degradación en la capa de servicios ni en el pool de conexiones de PostgreSQL.
3. El sistema está certificado para soportar picos de demanda masiva durante la apertura de reservas de temporada alta.
