# ADR-29 · WalletConnect v2: activación por `projectId` por entorno

- **Estado:** aceptado (ciclo C0 · RF-11).
- **Fecha:** 2026-10-17.
- **Contexto del plan:** punto **C7** de [la propuesta de cumplimiento](../../RepoTecnico/propuesta_cumplimiento_4_puntos.md);
  requisito **RF-11** (otras billeteras además de MetaMask) y **RNF-18** (flujo móvil web3).
- **Decisores:** responsable del proyecto (decisión C7 aprobada) + equipo técnico.

## Contexto

RF-11 pedía que la plataforma funcionase con **cualquier billetera**, no solo con la que ocupa
`window.ethereum`. El código ya está preparado desde la Fase 3:

- `apps/web/src/lib/wallet-connectors.ts` construye el plan de conectores con una función **pura**
  (`walletPlan`) y registra `walletConnect()` **solo si** `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` tiene
  valor; sin esa variable no se inventa un `projectId` ni se pone uno de ejemplo.
- `WalletChooser` lista los conectores disponibles y el botón de conexión usa
  `pickPreferredConnector` (MetaMask por `rdns`, luego `injected`, luego el primero).
- La CSP del middleware ya permite los orígenes de WalletConnect (`connect-src`/`img-src`
  `https://*.walletconnect.com` y `wss://*.walletconnect.com`).
- La dependencia `@walletconnect/ethereum-provider` ya está en `apps/web`.

Lo que faltaba era lo que el **cliente** debía aportar (B-4: *proyecto de WalletConnect Cloud*) y lo
que el equipo debía cerrar: **pasar el `projectId` al build**, documentarlo y probarlo.

## Decisión

1. **El `projectId` se inyecta en la compilación** como `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
   (es un identificador público, no un secreto). Viaja por:
   `.env.example` (comentado, sin valor) → `infra/gcp/f8-build-images.sh` (variable de entorno
   `WALLETCONNECT_PROJECT_ID` del operador) → `infra/docker/cloudbuild.yaml` (`_NEXT_PUBLIC_…`) →
   `Dockerfile` (`ARG`/`ENV`) → bundle del cliente.
2. **Sin `projectId` no hay conector**: `walletPlan()` devuelve solo inyectadas + Coinbase y la UI no
   ofrece WalletConnect. Es una degradación honesta, no un fallo.
3. **`metadata.url` sale de `NEXT_PUBLIC_SITE_URL`** (con respaldo al host de producción): antes estaba
   fijada al host de producción, así que un preview o un dominio nuevo anunciaban al móvil una URL
   equivocada. Se normaliza sin `/` final.
4. **Un `projectId` por entorno** (local, preview, producción). Rotarlo o cambiarlo es **recompilar**:
   es una variable de build, no de runtime.
5. **No se pone valor de ejemplo** en la plantilla ni se usa un `projectId` de terceros: cada entorno
   usa el suyo (requisito de la guía de WalletConnect y de la CSP).

## Consecuencias

- **Activar** en un entorno: crear el proyecto en <https://cloud.reown.com> (WalletConnect Cloud),
  registrar el dominio del sitio, y construir con `WALLETCONNECT_PROJECT_ID=<id>`.
- **Verificar**: con `projectId`, el selector de cartera muestra **WalletConnect**, el modal pinta el
  **QR** y un móvil puede emparejar; el móvil debe aceptar la red **81234** (la app ofrece añadirla).
  Sin `projectId`, ni el botón ni el conector existen.
- **Aceptación móvil real** (MetaMask móvil vía WalletConnect sobre Besu) queda como `TC-ACC-003`,
  pendiente de dispositivo; lo verificable en CI es el plan, los metadatos y la ausencia del conector
  sin `projectId`.
- **Riesgo residual**: el relay de WalletConnect es un tercero; si no está disponible, WalletConnect
  falla pero las billeteras inyectadas y Coinbase siguen funcionando (el plan no depende de él).
- **Seguridad**: el `projectId` no da acceso a fondos ni a claves; solo identifica la dApp ante el
  relay. La CSP no se relaja (los dominios ya estaban permitidos por la integración prevista).

## Verificación

- `wallet-connectors.test.ts`: el plan incluye inyectadas + Coinbase siempre, añade `walletconnect`
  solo con `projectId` no vacío, sanea espacios, y los metadatos anuncian la URL pública sin `/`.
- `middleware.test.ts`: la CSP conserva `default-src 'self'` y permite el RPC del entorno.
- Gate de activación: build con `projectId` + modal QR visible + TC-ACC-003 en dispositivo.
