# CU-17 · Conectar la cartera y ponerse en la red correcta — Manual técnico

> Bloque 3 · Onboarding y descubrimiento · Actor: Visitante/Comprador · Requisitos: RF-04, RNF-18, RNF-19

## 1. Ficha y trazabilidad

- **Objetivo.** Llevar a un visitante desde «no tengo nada» hasta «cartera conectada en la red del
  proyecto», de forma que se habiliten las acciones que exigen firma (comprar, revender, firmar).
- **Actor primario.** Visitante / Comprador. **Secundarios:** el proveedor inyectado del navegador
  (MetaMask u otro `window.ethereum`), la red configurada por build y el panel de back-office, que
  reutiliza la misma barra para iniciar sesión con wallet.
- **Requisitos que cubre.** RF-04 (detección de wallet, conexión y cambio/añadido de red), RNF-18
  (estado de cada transacción), RNF-19 (guardrails de la capa web3).
- **Precondición.** Ninguna. Es el primer CU del bloque: no exige sesión ni cartera.
- **Disparador.** El visitante abre una vista pública con acciones que requieren cartera, o pulsa
  «Reservar» en una tarjeta del catálogo.
- **Postcondición.** `hasWallet` e `isConnected` son `true` y `chainId === activeChain.id`; con eso
  `canPurchase` queda a `true` (`apps/web/src/components/wallet/useOnboarding.ts:59`) y la compra
  deja de redirigir al cambio de red.
- **Dónde vive.**
  - Componente de estado: `apps/web/src/components/wallet/WalletBar.tsx:14`.
  - Estado/hook: `apps/web/src/components/wallet/useOnboarding.ts:28`.
  - Clasificación de errores de red: `apps/web/src/components/wallet/switchChainError.ts:19`.
  - Configuración de cadena: `apps/web/src/config/chain.ts:63` y
    `packages/shared/src/network.ts:27`.
  - Proveedores wagmi: `apps/web/src/app/providers.tsx:9`.
  - No hay contrato ni endpoint propio: el onboarding es 100 % cliente contra el proveedor de la
    cartera.
  - Usos de la barra: `apps/web/src/components/reserve/ReserveFlow.tsx:173`,
    `apps/web/src/components/my-nights/MyNights.tsx:64`,
    `apps/web/src/components/my-nights/MyResales.tsx:68` y
    `apps/web/src/components/admin/AdminSignInScreen.tsx:51`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. `Providers` monta wagmi con una única cadena (`activeChain`) y un único conector, `injected()`
   (`apps/web/src/app/providers.tsx:9`–`:14`); el transporte HTTP apunta a `rpcUrl`
   (`apps/web/src/config/chain.ts:11`).
2. `useOnboarding` arranca asumiendo que hay cartera (`hasWallet` inicial `true`,
   `useOnboarding.ts:35`) para que el HTML del servidor y el del cliente coincidan. Al montar, lee
   `window.ethereum` y fija el valor real (`:43`–`:47`); hasta entonces todo se expone como
   «desconectado» (`:50` y `:54`).
3. Sin proveedor, `WalletBar` pinta `data-testid="no-wallet"` con un enlace a la descarga de
   MetaMask (`WalletBar.tsx:28`–`:36`). Ese es el flujo 17a.
4. Con proveedor y sin conexión, pinta el botón de conectar (`WalletBar.tsx:39`–`:49`); al pulsarlo
   se llama `connect({ connector: injected() })` (`useOnboarding.ts:62`).
5. Conectada la cartera, si `chainId !== activeChain.id` se marca `isWrongNetwork`
   (`useOnboarding.ts:51`) y la barra pinta `data-testid="wrong-network"` con el botón de cambio
   (`WalletBar.tsx:52`–`:74`).
6. Ese botón llama a `switchChain({ chainId: activeChain.id })` y captura el fallo con
   `classifySwitchChainError` (`useOnboarding.ts:64`–`:70`); si falla, aparece
   `data-testid="switch-network-error"` (`WalletBar.tsx:67`–`:71`).
7. En la red correcta, la barra muestra `data-testid="wallet-connected"` con la dirección acortada
   (`WalletBar.tsx:78`–`:84`) y, si el entorno tiene faucet, el botón de suministro (`:86`).
8. `BuyButton` consume el mismo hook (`apps/web/src/components/buy/BuyButton.tsx:41`–`:42`): si no
   hay conexión, «Reservar» conecta (`:96`); si la red es incorrecta, cambia de red (`:97`); el
   texto del botón refleja cada estado (`:117`–`:125`).

### 2.2 Validaciones

- **Detección de proveedor.** `Boolean((window as { ethereum?: unknown }).ethereum)`
  (`useOnboarding.ts:45`–`:46`). Si es falso, la compra no se ofrece: el botón queda deshabilitado
  por `!hasWallet` (`BuyButton.tsx:132`).
- **Red correcta.** Comparación de enteros `chainId !== activeChain.id`
  (`useOnboarding.ts:51`); `activeChain.id` sale de `NEXT_PUBLIC_CHAIN_ID` o, por defecto, de
  `CHAIN_ID = 81234` (`config/chain.ts:50`, `packages/shared/src/constants.ts:9`).
- **Error de cambio de red (EIP-1193).** `classifySwitchChainError` recorre la cadena de `cause` y
  devuelve `chainNotAdded` para `4902`, `rejected` para `4001`/`UserRejectedRequestError` y
  `failed` en el resto (`switchChainError.ts:19`–`:24`).
- **Compatibilidad SSR.** El valor «desconectado» se mantiene hasta que el componente monta
  (`useOnboarding.ts:50`), evitando el desajuste de hidratación cuando MetaMask ya está conectada.

### 2.3 Efectos on-chain / persistencia

- **Ninguno.** El onboarding no emite transacciones ni escribe en base de datos: solo lee el estado
  del proveedor y pide la conexión/cambio de red. La primera escritura on-chain llega en CU-05
  (compra) o CU-01 (login firmado).
- La dirección conectada se reutiliza como contexto de lectura en el asistente
  (`apps/web/src/components/assistant/AssistantChat.tsx:16`) y como firmante en el handoff de compra
  (`apps/web/src/components/assistant/PurchaseHandoff.tsx:41`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `useOnboarding()` | `useOnboarding.ts:28` | Devuelve `hasWallet`, `isConnected`, `isWrongNetwork`, `canPurchase`, `connect`, `switchToAppChain`, `disconnect` |
| `connect({ connector: injected() })` | `useOnboarding.ts:62` | Conector inyectado de wagmi |
| `switchChain({ chainId })` | `useOnboarding.ts:66` | Cambio a la cadena de la app |
| `classifySwitchChainError` | `switchChainError.ts:19` | Traduce 4902/4001 a clave de copy |
| `activeChain` | `config/chain.ts:80` | `anvilChain`, `besuChain` o una `defineChain` local |
| `injected()` en `createConfig` | `providers.tsx:9`–`:12` | Un solo conector, una sola cadena |
| `useAccount` / `useChainId` / `useConnect` / `useSwitchChain` | `useOnboarding.ts:29`–`:33` | Fuente del estado |

**No existe endpoint propio** de onboarding: no hay `POST /api/wallet/...` para conectar. La
conexión la resuelve wagmi contra el proveedor del navegador.

### 4.2 Eventos y errores canónicos

- No hay eventos de contrato. Los «errores» son códigos EIP-1193 clasificados:
  `chainNotAdded` (4902), `rejected` (4001) y `failed` (`switchChainError.ts:21`–`:23`).
- Claves de UI asociadas: `switchError.chainNotAdded`, `switchError.rejected`, `switchError.failed`
  (`WalletBar.tsx:69`).
- El 17b (el usuario rechaza) NO es un error bloqueante: el rechazo deja la sesión desconectada sin
  mensaje rojo dedicado (el copy de «rejected» solo aparece al fallar el **cambio de red**).

### 4.3 Estructuras de datos y almacenamiento

- `OnboardingState` (`useOnboarding.ts:11`–`:25`) es la interfaz que consumen las vistas.
- `SwitchChainError = "chainNotAdded" | "rejected" | "failed"`
  (`switchChainError.ts:6`).
- No hay persistencia: ni `localStorage`, ni cookies, ni tabla. Al recargar, el estado se
  reconstruye leyendo el proveedor.

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| Navegador sin `window.ethereum` | `data-testid="no-wallet"` + enlace de instalación | `useOnboarding.ts:45`; `WalletBar.tsx:28` |
| El usuario rechaza conectar | Sigue desconectado, sin banner rojo | `useOnboarding.ts:62` (sin manejador de error) |
| Red incorrecta tras conectar | `data-testid="wrong-network"` | `useOnboarding.ts:51`; `WalletBar.tsx:52` |
| La red no está añadida en la cartera | `switchError = "chainNotAdded"` (4902) | `switchChainError.ts:21`; `WalletBar.tsx:68` |
| El usuario rechaza añadir/cambiar la red | `switchError = "rejected"` (4001) | `switchChainError.ts:22`; `WalletBar.tsx:68` |
| Fallo desconocido al cambiar de red | `switchError = "failed"` | `switchChainError.ts:24`; `WalletBar.tsx:68` |
| Intento de compra sin cartera | Botón deshabilitado; texto «needWallet» | `BuyButton.tsx:117` y `:132` |
| Intento de compra en red incorrecta | Redirige al cambio de red, no firma | `BuyButton.tsx:97` y `:104` |
| Wallet ya conectada antes de montar | Se renderiza «desconectado» hasta montar (anti-hidratación) | `useOnboarding.ts:50` |

## 6. Pruebas y evidencia

- `apps/web/src/components/wallet/switchChainError.test.ts:4` — 4902 directo; `:9` 4902 anidado en
  `cause`; `:14` y `:18` rechazo por código y por nombre; `:23` prioridad de 4902; `:28` caso
  desconocido y `undefined`.
- `apps/web/scripts/e2e-wallet-buy.mjs:23` — E2E on-demand que inyecta un `window.ethereum` mínimo
  (EIP-1193) con `addInitScript` y ejercita conexión → reserva → firma; no es suite hermética de CI.
- `apps/web/e2e/a11y.spec.ts:29` — la ruta `/catalogo` (donde vive el CTA) entra en el barrido de
  accesibilidad.
- **No cubierto:** no hay test de componente para `WalletBar.tsx` ni para `useOnboarding` (detección
  de proveedor, estado SSR, transición a `wrong-network`). Los caminos 17a/17b/17c solo están
  cubiertos de forma indirecta por el E2E manual.

## 7. Pendiente de confirmar

- **`wallet_addEthereumChain` literal.** El fuente de CU-17 pide ofrecer el alta de red «vía
  `wallet_addEthereumChain`» (`docs/CASOS-DE-USO.md:921`), pero en el repositorio no hay ninguna
  llamada a ese método: se delega en `switchChain` de wagmi, que según el propio comentario
  «suele AÑADIR la cadena automáticamente cuando `activeChain` trae `rpcUrls`»
  (`switchChainError.ts:15`–`:17`). Confirmar si se acepta esa delegación como cumplimiento.
- **Guía de navegador in-app de MetaMask.** El fuente menciona «extensión / navegador in-app»
  (`docs/CASOS-DE-USO.md:925`); la UI solo enlaza a `https://metamask.io/download/`
  (`WalletBar.tsx:32`). Confirmar si falta la guía específica de navegador integrado.
- **17b sin copy.** El fuente dice que el rechazo del usuario «permanece desconectado, sin error
  bloqueante» (`docs/CASOS-DE-USO.md:926`). Es lo que hace el código, pero no hay mensaje que
  explique al visitante que acaba de rechazar: confirmar si se quiere feedback.
- **Estado «revertida» de tx (RNF/restricción de CU-17).** La restricción «mostrar el estado de
  cada transacción: pendiente, confirmada o revertida» (`docs/CASOS-DE-USO.md:951`) no se
  implementa aquí, sino en el modal de compra (`apps/web/src/components/buy/TxModal.tsx` vía
  `deriveTxStatus`). Confirmar el reparto entre CU-17 y CU-05.
- **`disconnect`.** `useOnboarding` expone `disconnect` (`useOnboarding.ts:71`) para el menú de
  cabecera (RF-40.2), que pertenece a otro bloque; confirmar si debe documentarse aquí.
