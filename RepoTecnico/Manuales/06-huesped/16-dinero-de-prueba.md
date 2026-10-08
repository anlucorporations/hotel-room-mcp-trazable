# Conseguir dinero de prueba (solo en el entorno de pruebas)

> En el entorno de pruebas —y solo ahí— el huésped pulsa un botón, firma con su cartera y recibe una cantidad fija de ETH de mentira para practicar compras y reventas sin arriesgar dinero real.

## Qué hace el sistema

El **faucet** (grifo) es un contrato de prueba que reparte una cantidad fija de ETH por cartera (`packages/contracts/src/Faucet.sol:13`). **No se despliega en producción**: el despliegue solo lo crea si se pide a propósito con `DEPLOY_FAUCET=true` (`packages/contracts/script/Deploy.s.sol:87`, `:118`; `docs/adr/ADR-13-faucet-de-pruebas.md:1`).

La web decide si hay faucet por una variable de entorno: `faucetAddress` guarda la dirección configurada o `null` (`apps/web/src/config/chain.ts:29`). Sin dirección, la interfaz desaparece entera: el hook devuelve un estado inerte (`apps/web/src/components/wallet/useFaucet.ts:57`, `:139`) y el botón no pinta nada (`apps/web/src/components/wallet/FaucetButton.tsx:32`). Por eso en producción y en el E2E hermético no se ve: allí la variable va vacía (`apps/web/src/config/chain.ts:24`).

El botón «Conseguir ETH de prueba» aparece en **tres sitios**: en la barra de estado de la cartera, arriba (`apps/web/src/components/wallet/WalletBar.tsx:86`); al pie del menú de la cartera (`apps/web/src/components/wallet/WalletMenu.tsx:302`); y dentro del aviso de **saldo insuficiente** al intentar reservar (`apps/web/src/components/buy/BuyButton.tsx:154`).

El estado real se lee de la cadena, no de la base: el hook consulta el cooldown de esa cartera (`availableAt`), el aviso de saldo bajo (`lowBalance`), la cantidad por dispensación (`amount`) y el saldo del propio contrato (`apps/web/src/components/wallet/useFaucet.ts:62`, `:71`, `:79`, `:87`).

La decisión de si se puede pedir es una **función pura** y probada aparte (`packages/shared/src/domain/faucet.ts:29`; pruebas en `packages/shared/src/domain/faucet.test.ts:19`). Tiene tres estados: **listo**, **en espera** (con la hora en que se podrá volver a pedir) y **sin fondos** (`packages/shared/src/domain/faucet.ts:11`). Si el faucet no tiene saldo ni para una dispensación, ese estado manda sobre la espera (`packages/shared/src/domain/faucet.ts:33`).

El contrato es quien pone las reglas de verdad: comprueba la espera por cartera, comprueba que le queda saldo, apunta la hora, avisa con un evento y envía el importe (`packages/contracts/src/Faucet.sol:49`, `:52`, `:54`, `:55`, `:57`).

## Recorrido real

1. El probador abre la web de pruebas y conecta su cartera en la red correcta. En la cabecera, la barra de la cartera muestra el botón de prueba (`apps/web/src/components/wallet/WalletBar.tsx:76`, `:86`).
2. Si no hay cartera conectada o la red no es la de la aplicación, el botón **no se pinta** (`apps/web/src/components/wallet/FaucetButton.tsx:32`).
3. El sistema lee `availableAt` de esa dirección para saber si está en espera (`apps/web/src/components/wallet/useFaucet.ts:62`).
4. También lee `amount` y el saldo del contrato para saber si queda dinero (`apps/web/src/components/wallet/useFaucet.ts:79`, `:87`).
5. La etiqueta del botón cambia según el caso: **Enviando ETH de prueba…**, **Faucet sin fondos** o **Conseguir ETH de prueba** (`apps/web/src/components/wallet/FaucetButton.tsx:34`; textos en `apps/web/messages/es.json:259`, `:260`, `:264`).
6. El probador pulsa el botón. Solo está activo si el faucet está configurado, hay cartera, no hay espera y no hay una operación en curso (`apps/web/src/components/wallet/useFaucet.ts:132`).
7. La cartera pide la firma. La llamada es a la función `dispense()` del contrato (`apps/web/src/components/wallet/useFaucet.ts:136`).
8. El contrato, si esa cartera ya pidió y aún no ha pasado la espera, rechaza con `FaucetCooldownActive` y devuelve la hora exacta en que podrá volver a pedir (`packages/contracts/src/Faucet.sol:49`, `:50`).
9. Si al contrato no le llega el saldo para una dispensación, rechaza con `FaucetInsufficientBalance` (`packages/contracts/src/Faucet.sol:52`).
10. Si todo va bien, apunta la hora en `lastDispensedAt`, emite el evento `FaucetDispensed` con la cartera y el importe, y envía el ETH (`packages/contracts/src/Faucet.sol:54`, `:55`, `:57`).
11. Mientras la operación está en marcha, el botón va contando el estado: firma, envío y confirmación (`apps/web/src/components/wallet/useFaucet.ts:107`; `apps/web/src/components/tx/txStatus.ts:12`).
12. Al confirmarse, aparece el aviso **«¡Listo! Recibiste ETH de prueba en tu wallet.»** (`apps/web/src/components/wallet/FaucetButton.tsx:43`; `apps/web/messages/es.json:261`).
13. Si ya estaba en espera, el aviso dice **«Vuelve a intentarlo a partir de las {hora}.»** con la hora local (`apps/web/src/components/wallet/FaucetButton.tsx:48`; `apps/web/messages/es.json:262`).
14. Si el rechazo fue por espera, el sistema saca la hora del propio error del contrato (`packages/shared/src/domain/faucet.ts:70`; `apps/web/src/components/wallet/useFaucet.ts:149`).
15. Si el faucet está vacío, el aviso es **«El faucet se ha quedado sin fondos. Avisa al operador para que lo recargue.»** (`apps/web/src/components/wallet/FaucetButton.tsx:45`; `apps/web/messages/es.json:263`).
16. Si el rechazo es cualquier otro, el aviso es **«No se pudo enviar ETH de prueba. Inténtalo de nuevo en unos segundos.»** (`apps/web/src/components/wallet/FaucetButton.tsx:54`; `apps/web/messages/es.json:265`).
17. El operador puede llenar el grifo con `fund()` o enviando ETH directamente, y vaciarlo con `drain()` si es el dueño (`packages/contracts/src/Faucet.sol:40`, `:36`, `:73`).

## Piezas de código implicadas

- Contrato del faucet (importe, espera, umbral, eventos y errores): `packages/contracts/src/Faucet.sol:13`, `:14`, `:15`, `:16`, `:18`, `:20`, `:23`, `:24`, `:45`, `:49`, `:52`, `:54`, `:57`, `:62`, `:68`, `:73`.
- Despliegue opcional y valores por defecto: `packages/contracts/script/Deploy.s.sol:33`, `:34`, `:35`, `:87`, `:88`, `:89`, `:90`, `:118`, `:119`, `:122`.
- Valores de desarrollo compartidos: `packages/shared/src/constants.ts:60`, `:65`, `:66`, `:67`.
- Dirección configurable del faucet y su comentario de entornos: `apps/web/src/config/chain.ts:24`, `:29`.
- ABI del faucet: `packages/shared/src/abi/faucet.ts:1`.
- Lógica pura de disponibilidad, espera y decodificación del error: `packages/shared/src/domain/faucet.ts:11`, `:29`, `:33`, `:41`, `:50`, `:70`.
- Hook que lee la cadena y orquesta la dispensación: `apps/web/src/components/wallet/useFaucet.ts:56`, `:57`, `:62`, `:71`, `:79`, `:87`, `:95`, `:107`, `:116`, `:131`, `:132`, `:134`, `:139`, `:149`.
- Botón, etiqueta y mensajes accesibles: `apps/web/src/components/wallet/FaucetButton.tsx:12`, `:25`, `:32`, `:34`, `:43`, `:45`, `:48`, `:51`, `:54`, `:72`.
- Dónde se inserta el botón: `apps/web/src/components/wallet/WalletBar.tsx:86`; `apps/web/src/components/wallet/WalletMenu.tsx:302`; `apps/web/src/components/buy/BuyButton.tsx:154`.
- Estados de una transacción de escritura: `apps/web/src/components/tx/txStatus.ts:12`.
- Textos exactos del faucet: `apps/web/messages/es.json:258`, `:259`, `:260`, `:261`, `:262`, `:263`, `:264`, `:265`.
- Pruebas de la lógica pura: `packages/shared/src/domain/faucet.test.ts:19`, `:43`, `:53`, `:68`.

## Datos y estados

- **Cantidad por dispensación.** Valor fijo decidido al desplegar; en desarrollo, **30 ETH** (`packages/contracts/script/Deploy.s.sol:33`; `packages/shared/src/constants.ts:66`). El contrato lo guarda como inmutable (`packages/contracts/src/Faucet.sol:14`).
- **Espera por cartera.** `86.400` segundos = **24 horas** (`packages/contracts/script/Deploy.s.sol:34`; `packages/shared/src/constants.ts:60`; `packages/contracts/src/Faucet.sol:15`).
- **Umbral de saldo bajo.** En desarrollo, **150 ETH** (5 veces la cantidad) (`packages/contracts/script/Deploy.s.sol:35`; `packages/shared/src/constants.ts:67`). El contrato lo expone como aviso (`packages/contracts/src/Faucet.sol:68`).
- **Estados de disponibilidad.** `ready` (puede pedir), `cooldown` (con `availableAt` en segundos) y `empty` (sin saldo) (`packages/shared/src/domain/faucet.ts:11`). `empty` tiene prioridad sobre `cooldown` (`packages/shared/src/domain/faucet.ts:33`).
- **Sin historial previo.** Si la cartera nunca pidió, `availableAt` es `0` y el estado es `ready` (`packages/contracts/src/Faucet.sol:64`; `packages/shared/src/domain/faucet.ts:34`).
- **Hora de la última dispensación.** Se guarda por cartera en `lastDispensedAt` (`packages/contracts/src/Faucet.sol:18`).
- **Eventos.** `FaucetDispensed(to, amount)` al repartir y `FaucetFunded(from, amount)` al recargar (`packages/contracts/src/Faucet.sol:20`, `:21`).
- **Errores propios.** `FaucetCooldownActive(account, availableAt)`, `FaucetInsufficientBalance()`, `InvalidConfig()`, `EthTransferFailed()` (`packages/contracts/src/Faucet.sol:23`, `:24`, `:25`, `:26`).
- **Reloj del cooldown.** La cuenta atrás se calcula en el navegador con un reloj que se refresca cada 30 segundos, no en el servidor (`apps/web/src/components/wallet/useFaucet.ts:95`, `:103`).
- **Botón activo.** Solo si el faucet está configurado, hay cartera, el estado es `ready` y no hay operación en curso (`apps/web/src/components/wallet/useFaucet.ts:132`).
- **Configuración por entorno.** La cantidad, la espera y el umbral se pueden cambiar con `FAUCET_AMOUNT_WEI`, `FAUCET_COOLDOWN_SECONDS` y `FAUCET_LOW_THRESHOLD_WEI` al desplegar (`packages/contracts/script/Deploy.s.sol:88`, `:89`, `:90`).

## Casos límite y errores

- **El botón no aparece.** No hay faucet configurado (variable vacía), no hay cartera conectada o la red es la equivocada (`apps/web/src/components/wallet/FaucetButton.tsx:32`; `apps/web/src/components/wallet/useFaucet.ts:57`).
- **No hay cartera instalada.** Sin cartera no se puede firmar: el flujo no llega a empezar y la web ofrece instalar MetaMask (`apps/web/src/components/wallet/WalletBar.tsx:28`; `apps/web/messages/es.json:244`).
- **Red equivocada.** El botón se oculta hasta que la cartera esté en la red de la aplicación (`apps/web/src/components/wallet/FaucetButton.tsx:32`).
- **Ya pidió hace poco.** Mensaje con la hora local: «Ya solicitaste ETH hace poco. Vuelve a intentarlo a partir de las {time}.» (`apps/web/messages/es.json:262`; `apps/web/src/components/wallet/FaucetButton.tsx:48`).
- **El rechazo por espera llega como error de la transacción.** Se decodifica `FaucetCooldownActive` para sacar la hora y no mostrar un error genérico (`packages/shared/src/domain/faucet.ts:70`, `:76`; `apps/web/src/components/wallet/useFaucet.ts:149`).
- **El faucet no tiene fondos.** Etiqueta **Faucet sin fondos** y aviso para que el operador lo recargue (`apps/web/src/components/wallet/FaucetButton.tsx:36`, `:45`; `apps/web/messages/es.json:263`, `:264`).
- **El saldo justo no llega.** Si el saldo del contrato es menor que la cantidad, el estado es `empty` y el botón queda desactivado (`packages/shared/src/domain/faucet.ts:33`; `apps/web/src/components/wallet/useFaucet.ts:120`).
- **El contrato rechaza por saldo.** Aunque la web no lo detecte antes, el contrato revierte con `FaucetInsufficientBalance` (`packages/contracts/src/Faucet.sol:52`).
- **El envío de ETH falla.** El contrato revierte con `EthTransferFailed` y no apunta la dispensación (`packages/contracts/src/Faucet.sol:26`, `:58`).
- **Otro error de la transacción.** Mensaje genérico: «No se pudo enviar ETH de prueba. Inténtalo de nuevo en unos segundos.» (`apps/web/messages/es.json:265`; `apps/web/src/components/wallet/FaucetButton.tsx:54`).
- **El usuario cancela la firma.** No hay transacción ni mensaje: el estado vuelve a `idle` y el botón queda como estaba (`apps/web/src/components/wallet/useFaucet.ts:107`; `apps/web/src/components/tx/txStatus.ts:17`).
- **La cuenta atrás va con retraso.** El reloj se refresca cada 30 segundos: la hora mostrada puede quedar hasta medio minuto desfasada (`apps/web/src/components/wallet/useFaucet.ts:103`).
- **La red tarda en reflejarlo.** El recibo se muestra al confirmarse la transacción; hasta entonces el botón sigue en estado de envío (`apps/web/src/components/tx/txStatus.ts:14`, `:15`).
- **Configuración inválida al desplegar.** Una cantidad de cero hace que el constructor revierta con `InvalidConfig` y el faucet no llegue a existir (`packages/contracts/src/Faucet.sol:30`).
- **En producción no hay faucet.** La dirección no se define y toda la interfaz queda oculta (`apps/web/src/config/chain.ts:24`; `docs/adr/ADR-13-faucet-de-pruebas.md:1`).

## Referencias

- **CU-PR-01** · Conseguir dinero de prueba (solo en pruebas) (`docs/Manuales/05-casos-de-uso/07-entorno-de-pruebas/CU-PR-01-faucet.md:1`).
- **ADR-13** · Faucet de pruebas solo en red local: `Faucet.sol` se despliega solo si `DEPLOY_FAUCET=true` (`docs/adr/ADR-13-faucet-de-pruebas.md:1`).
- Decisión **D-11** · El faucet es una utilidad de demo, nunca de producción (`packages/contracts/script/Deploy.s.sol:11`; `docs/adr/ADR-13-faucet-de-pruebas.md:3`).
- Etiqueta **RF-21 / CU-PR-01** en los comentarios del código, con la referencia a `docs/SRS.md §9` (`apps/web/src/components/wallet/FaucetButton.tsx:20`; `apps/web/src/components/wallet/useFaucet.ts:49`; `packages/contracts/src/Faucet.sol:8`).
- Valores monetarios provisionales de desarrollo, pendientes del precio real de la noche (ADR-19) (`packages/shared/src/constants.ts:62`).
- BRIEF del equipo de manuales: catálogo canónico de casos de uso, fila 17 = CU-PR-01 (`RepoTecnico/Manuales/05-casos-de-uso/00-BRIEF-equipo-manuales.md:48`).
