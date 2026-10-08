# Preparar tu cartera y la red correcta

> El huésped conecta su cartera digital al sitio y comprueba que está en la red del hotel, que es el paso previo para poder comprar y firmar.

## Qué hace el sistema

La puerta de entrada es el menú de cuenta y billetera de la cabecera. Está en todas las pantallas públicas porque la cabecera lo pinta siempre (`apps/web/src/components/layout/SiteHeader.tsx:169`). Ese menú enseña como título el nombre de usuario y el rol si hay sesión, la dirección acortada de la cartera si está conectada, o el texto «Wallet no conectada» si no hay nada (`apps/web/src/components/wallet/WalletMenu.tsx:181`). Un punto de color junto al botón se enciende cuando hay cartera conectada (`apps/web/src/components/wallet/WalletMenu.tsx:208`).

El menú ofrece **una sola acción de cartera según el estado**: `Conectar wallet` si no hay conexión, `Cambiar de red` si está conectada en la red equivocada, y `Desconectar wallet` si ya está conectada en la red buena (`apps/web/src/lib/wallet-menu-items.ts:52`). Cuando no hay conexión y el navegador anuncia varias carteras, aparece además un selector con las billeteras encontradas (`apps/web/src/components/wallet/WalletMenu.tsx:252`). El descubrimiento usa EIP-6963, y también admite Coinbase Wallet y WalletConnect si la plataforma lo tiene configurado (`apps/web/src/components/wallet/WalletChooser.tsx:9`).

La detección de cartera no depende solo de `window.ethereum`: también cuenta una cartera que se anuncie por EIP-6963 sin ocupar esa variable (`apps/web/src/components/wallet/useOnboarding.ts:69`). Al conectar, el sistema reutiliza el conector ya configurado y prefiere MetaMask; si no está, usa el inyectado de respaldo (`apps/web/src/components/wallet/useOnboarding.ts:86`).

La red se comprueba comparando la red de la cartera con la red activa de la aplicación (`apps/web/src/components/wallet/useOnboarding.ts:67`). Si no coincide, el sistema intenta cambiar de red y, si la cartera no conoce esa red, la **añade** con `wallet_addEthereumChain` y reintenta el cambio (`apps/web/src/lib/wallet-chain.ts:55`). Los fallos se clasifican en tres casos: la red no está añadida, el usuario rechazó el cambio, o el cambio falló por otro motivo (`apps/web/src/components/wallet/switchChainError.ts:19`).

La red activa se resuelve por variables de entorno `NEXT_PUBLIC_*`. Por defecto, el proyecto usa la `chainId` canónica 81234 y la red «Codecrypto Besu» con símbolo ETH (`packages/shared/src/constants.ts:9`; `apps/web/src/config/chain.ts:50`). En desarrollo se puede apuntar a otra red local cambiando la variable de entorno (`apps/web/src/config/chain.ts:63`).

En la red de pruebas hay un grifo de dinero falso. El botón «Conseguir ETH de prueba» solo se pinta si el grifo está configurado, hay cartera conectada y la red es la correcta (`apps/web/src/components/wallet/FaucetButton.tsx:25`). El grifo tiene un límite de una petición cada 24 horas (`packages/shared/src/constants.ts:60`).

## Recorrido real

1. El huésped abre cualquier página pública del hotel. En la cabecera, a la derecha, está el botón del menú de cuenta y billetera (`apps/web/src/components/layout/SiteHeader.tsx:168`).
2. Fíjate en el punto del botón: encendido si hay cartera conectada; apagado si no (`apps/web/src/components/wallet/WalletMenu.tsx:210`).
3. Pulsa el botón. Se despliega el panel con el título `Billetera` (`apps/web/src/components/wallet/WalletMenu.tsx:248`; `apps/web/messages/es.json:1112`).
4. Si el navegador no tiene ninguna cartera, la pantalla de «Mis noches» y la de reserva muestran el aviso «No detectamos una wallet web3.» con un enlace «Instala MetaMask» (`apps/web/src/components/wallet/WalletBar.tsx:28`; `apps/web/messages/es.json:244`, `:245`).
5. Elige `Conectar wallet` en el menú o en la barra. Si hay varias billeteras, primero elige una en la lista, bajo el rótulo «Elige tu billetera» (`apps/web/src/components/wallet/WalletChooser.tsx:28`; `apps/web/messages/es.json:243`).
6. Acepta el permiso en la cartera. Cuando conecta, la barra muestra «Conectado: 0x1234…abcd» y el menú pasa a ofrecer `Desconectar wallet` (`apps/web/src/components/wallet/WalletBar.tsx:76`; `apps/web/messages/es.json:251`).
7. Si estás en otra red, aparece «Estás en la red equivocada.» con el botón `Cambiar de red` (`apps/web/src/components/wallet/WalletBar.tsx:52`; `apps/web/messages/es.json:248`).
8. Acepta el cambio en la cartera. Si la red no estaba añadida, la cartera pedirá añadirla y el sistema reintenta el cambio solo (`apps/web/src/lib/wallet-chain.ts:70`).
9. Con la red correcta y la cartera conectada, puede aparecer el botón «Conseguir ETH de prueba» (`apps/web/src/components/wallet/FaucetButton.tsx:34`).
10. Con todo listo, los botones de compra de las noches dejan de estar bloqueados (`apps/web/src/components/buy/BuyButton.tsx:132`).

## Piezas de código implicadas

- Menú de cuenta y billetera: `apps/web/src/components/wallet/WalletMenu.tsx:84`, `:153`, `:171`, `:181`, `:208`, `:248`, `:302`.
- Entradas del menú según el estado: `apps/web/src/lib/wallet-menu-items.ts:52`.
- Selector de billeteras: `apps/web/src/components/wallet/WalletChooser.tsx:16`.
- Estado de onboarding: `apps/web/src/components/wallet/useOnboarding.ts:31`, `:67`, `:86`, `:99`.
- Barra de cartera reutilizable: `apps/web/src/components/wallet/WalletBar.tsx:14`, `:28`, `:39`, `:52`, `:76`.
- Cambio y alta de red: `apps/web/src/lib/wallet-chain.ts:26`, `:55`; `apps/web/src/components/wallet/switchChainError.ts:19`.
- Configuración de red y contrato: `apps/web/src/config/chain.ts:11`, `:13`, `:29`, `:50`, `:80`.
- Constantes de red: `packages/shared/src/constants.ts:9`, `:14`, `:60`.
- Grifo de pruebas: `apps/web/src/components/wallet/FaucetButton.tsx:25`, `:34`; `apps/web/src/components/wallet/useFaucet.ts:57`, `:134`.
- Dónde se pinta la barra completa: `apps/web/src/components/my-nights/MyNights.tsx:64`, `apps/web/src/components/my-nights/MyResales.tsx:68`, `apps/web/src/components/reserve/ReserveFlow.tsx:181`.

## Datos y estados

- **Estado de cartera:** hay o no hay cartera; conectada o no; red correcta o incorrecta (`apps/web/src/components/wallet/useOnboarding.ts:13`).
- **Dirección mostrada:** acortada a seis caracteres por delante y cuatro por detrás, con puntos suspensivos en medio (`apps/web/src/components/wallet/WalletBar.tsx:9`).
- **Mensajes reales:**
  - «No detectamos una wallet web3.» (`apps/web/messages/es.json:244`).
  - «Instala MetaMask» (`apps/web/messages/es.json:245`).
  - «Conectar wallet» (`apps/web/messages/es.json:246`).
  - «Estás en la red equivocada.» (`apps/web/messages/es.json:248`).
  - «Cambiar de red» (`apps/web/messages/es.json:249`).
  - «Conectado: {address}» (`apps/web/messages/es.json:251`).
  - «Tu wallet aún no tiene esta red. Aprueba añadirla cuando MetaMask te lo pida y vuelve a intentarlo.» (`apps/web/messages/es.json:253`).
  - «Has cancelado el cambio de red. Para reservar, cambia a la red de la aplicación.» (`apps/web/messages/es.json:254`).
  - «No se pudo cambiar de red. Cámbiala manualmente en tu wallet a la red de la aplicación e inténtalo de nuevo.» (`apps/web/messages/es.json:255`).
  - «Wallet no conectada» (`apps/web/messages/es.json:1112`).
- **Grifo de pruebas:** «Conseguir ETH de prueba» (`apps/web/messages/es.json:259`), «¡Listo! Recibiste ETH de prueba en tu wallet.» (`apps/web/messages/es.json:261`), «Ya solicitaste ETH hace poco. Vuelve a intentarlo a partir de las {time}.» (`apps/web/messages/es.json:262`), «El faucet se ha quedado sin fondos. Avisa al operador para que lo recargue.» (`apps/web/messages/es.json:263`), «No se pudo enviar ETH de prueba. Inténtalo de nuevo en unos segundos.» (`apps/web/messages/es.json:265`).
- **Red por defecto:** `chainId` 81234, red «Codecrypto Besu», moneda ETH con 18 decimales (`packages/shared/src/constants.ts:9`).

## Casos límite y errores

- **Sin cartera instalada.** El aviso aparece en la barra, con el enlace de descarga (`apps/web/src/components/wallet/WalletBar.tsx:28`).
- **Conectar y no pasa nada.** La cartera está bloqueada o se cerró la ventana; el sistema vuelve a pedir permiso al pulsar otra vez (`apps/web/src/components/wallet/useOnboarding.ts:86`).
- **Red equivocada.** El sistema no deja comprar: el botón de compra muestra «Cambia de red para reservar» y la compra se bloquea hasta corregirlo (`apps/web/src/components/buy/BuyButton.tsx:117`).
- **La red no está añadida (error 4902).** El sistema la añade y reintenta; si el usuario rechaza, el mensaje es «Has cancelado el cambio de red…» (`apps/web/src/lib/wallet-chain.ts:68`; `apps/web/src/components/wallet/switchChainError.ts:21`).
- **Rechazo del cambio de red (error 4001).** Se clasifica como «rejected» y se muestra el mensaje correspondiente (`apps/web/src/components/wallet/switchChainError.ts:22`).
- **Fallo distinto.** Se clasifica como «failed» y se pide cambiar la red a mano en la cartera (`apps/web/src/components/wallet/switchChainError.ts:24`).
- **Sin saldo.** Aunque la cartera esté lista, si el saldo no llega al precio de la noche, el botón se bloquea y se explica cuánto falta (`apps/web/src/components/buy/BuyButton.tsx:54`, `:141`).
- **Grifo agotado o en espera.** El botón se deshabilita y el aviso dice a qué hora se puede volver a pedir (`apps/web/src/components/wallet/useFaucet.ts:131`).
- **Conectar no cuesta dinero ni firma nada.** Conectar solo da permiso para leer la dirección; la firma llega al comprar (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-17-onboarding-web3.md:104`).

## Referencias

- CU-17 · Conectar la cartera y ponerse en la red correcta (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-17-onboarding-web3.md:1`).
- CU-PR-01 · Conseguir dinero de prueba (`docs/Manuales/05-casos-de-uso/07-entorno-de-pruebas/CU-PR-01-faucet.md:1`).
- CU-40 · El menú de la cartera y del usuario (`docs/Manuales/05-casos-de-uso/09-back-office-y-gobierno-v3/CU-40-menu-wallet.md:1`).
- Guía del comprador, apartado 2 (`docs/manual-comprador.md:38`).
- ADR-01 · Red canónica local y contrato único (`docs/adr/ADR-01-red-y-contrato-canonicos.md:1`).
- ADR-13 · Faucet de pruebas (`docs/adr/ADR-13-faucet-de-pruebas.md:1`).
- ADR-17 · Espejo Besu (`docs/adr/ADR-17-espejo-besu.md:1`).
- SRS §8 (modelo de despliegue y entorno) y §9 (catálogo de casos de uso) (`docs/SRS.md:328`, `:342`).
