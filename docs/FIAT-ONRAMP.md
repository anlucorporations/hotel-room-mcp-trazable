# Integración de Pasarelas Híbridas Fiat On-Ramp (Tarjeta a Cripto)
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.0.0  
> **Fecha**: 2026-09-14  
> **Alcance**: Fase 2 (Post-MVP)  
> **Proveedores**: Stripe Crypto Onramp / MoonPay  

---

## 1. Arquitectura de Pago Híbrido No Custodial

Para derribar la fricción de entrada de huéspedes sin activos Web3:

```
[ Huésped (Tarjeta Visa/Mastercard) ]
                │
                ▼ Solicitud de Checkout
 [ API /api/fiat/session ] ──> Genera Sesión con Firma HMAC-SHA256
                │
                ▼ Redirección segura
[ Stripe Crypto Onramp / MoonPay ] ──> Cobro en EUR con 3D-Secure
                │
                ▼ Entrega automática de POL
 [ Wallet del Huésped en Polygon ] ──> Ejecución de Compra del NFT en HotelMarketplace
```

---

## 2. Parámetros de Seguridad y Protección contra Fraude

1. **Firma Criptográfica HMAC-SHA256**: Los parámetros de sesión (`destinationWallet`, `amountEur`, `tokenId`, `expiresAt`) se firman con clave secreta para impedir manipulación de importes o desvío de fondos.
2. **Expiración de Sesión (TTL 30 min)**: Las URLs de pago caducan automáticamente tras 30 minutos.
3. **Validación de Webhooks con `crypto.timingSafeEqual`**: Mitiga ataques de temporización (*timing attacks*) al procesar las confirmaciones de liquidación de tarjeta.

---

## 3. Pruebas Automatizadas

```bash
# Tests de servicio unitario en shared
pnpm --filter @hotel/shared test src/fiat-onramp/fiat-onramp.test.ts

# Tests de endpoint REST en web
pnpm --filter @hotel/web test src/app/api/fiat/fiat.test.ts
```
