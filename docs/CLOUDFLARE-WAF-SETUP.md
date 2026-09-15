# Guía de Configuración: Cloudflare WAF, CDN y Edge Protection
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.0.0  
> **Fecha**: 2026-09-14  
> **Alcance**: Fase 2 (Post-MVP) — Seguridad Perimetral  

---

## 1. Topología de Red y Arquitectura en el Borde

```
[ Huésped / Administrador ]
             │
             ▼ HTTPS (TLS 1.3)
 ┌─────────────────────────────────────────────────────────┐
 │                   CLOUDFLARE EDGE                       │
 │  • DNS Anycast con protección Anti-DDoS (L3/L4/L7)      │
 │  • WAF: Managed Rules (OWASP Top 10 + Zero-Day)        │
 │  • Rate Limiting en el Borde (Edge-Throttling)          │
 │  • SSL/TLS: Full (Strict) con Origin CA Certificate     │
 └─────────────────────────────────────────────────────────┘
             │
             ▼ Header CF-Connecting-IP validado
 ┌─────────────────────────────────────────────────────────┐
 │               GOOGLE CLOUD PLATFORM (VM)                │
 │  • Next.js Edge Middleware (CSP, HSTS, Throttling N2)   │
 │  • API Routes + Redis Token Bucket (Throttling N3)      │
 │  • PostgreSQL & Workers BullMQ                          │
 └─────────────────────────────────────────────────────────┘
```

---

## 2. Reglas de Rate Limiting en Cloudflare WAF

Configure las siguientes reglas en el panel de Cloudflare (*Security > WAF > Rate limiting rules*):

### Regla 1: Protección de Endpoints Críticos (Recepción y Admin)
- **Expresión**: `(http.request.uri.path starts_with "/api/admin" or http.request.uri.path starts_with "/api/reception")`
- **Criterio de conteo**: IP del cliente (`cf.client.bot == false`)
- **Umbral**: **15 solicitudes por 1 minuto**.
- **Acción**: *Block* (Duración: 5 minutos) con código HTTP 429.

### Regla 2: Throttling del Catálogo Público y Checkout
- **Expresión**: `http.request.uri.path starts_with "/api/"`
- **Criterio de conteo**: IP del cliente
- **Umbral**: **100 solicitudes por 1 minuto**.
- **Acción**: *Managed Challenge* (presenta Captcha interactivo solo ante sospecha).

---

## 3. Configuración de SSL/TLS y Cifrado de Extremo a Extremo

1. **Modo de Cifrado**: **Full (Strict)**.
2. **Minimum TLS Version**: **TLS 1.2** (Recomendado: TLS 1.3 habilitado).
3. **Origin CA Certificate**:
   - Generar certificado firmado por Cloudflare con validez de 15 años en el panel.
   - Instalar el certificado en Nginx / Docker de la instancia GCP.
4. **HSTS (HTTP Strict Transport Security)**:
   - Max-Age: 63072000 (2 años).
   - Include subdomains: Habilitado.
   - Preload: Habilitado.

---

## 4. Caché y Reglas de Optimización (Page Rules / Cache Rules)

- **Archivos Estáticos Next.js**: `https://hotel.com/_next/static/*` -> Cache Level: *Cache Everything*, Edge Cache TTL: *1 mes*.
- **Rutas Dinámicas y API**: `https://hotel.com/api/*` -> Cache Level: *Bypass*, Disable Performance features.
- **Resguardo QR y Pases**: `https://hotel.com/api/qr/*` -> Cache Level: *Bypass* (para evitar fugas de secretos en cachés compartidas).
