# Casos de uso y criterios de aceptación — APK Android del huésped (v1)

> **Tipo:** análisis funcional de una **app nueva** · **Fase:** 2 (artefacto de casos de uso) · **Fecha:** 2026-10-20.
> **Autor:** @asistenteProyecto (analista funcional senior). **Estado:** decisiones de producto **ratificadas (2026-10-20)**; pendiente la aprobación de alcance y planificación.
>
> **Alcance:** app **Android nativa** para el **huésped** de Hotel Marina del Sol: descubrir noches,
> comprar (primaria y reventa), participar en subastas, guardar el resguardo **offline**, hacer check-in,
> escribir reseñas, reclamar cargos por daños y recibir avisos. **No incluye** back-office ni las suites
> del personal (recepcionista, mantenimiento, ama de llaves, terminal) en v1: esas capacidades siguen en
> la web responsive, que es donde trabaja el personal (decisión D-49/D-50 del proyecto: la app móvil es
> una versión de huésped, no un back-office).
>
> **Fuentes:** requisitos web (`RF-01…RF-23`, `RF-56…RF-60`, `RNF-01…RNF-22`, `RF-M/K/S`, `RNF-M-01…21`),
> `docs/SRS.md` §9, `RepoTecnico/casos_uso_web.md` (CU-W, paridad funcional) y las decisiones de la
> arquitectura actual (wallet no custodial, contrato inmutable, PII off-chain, ADR-30).

---

## 1. Convenciones

| Convención | Regla |
|---|---|
| **Gherkin** | `Dado` verificable, `Cuando` **una** acción/evento, `Entonces` observable en el dispositivo (**pantalla/`contentDescription`/testID de Compose**), API (código HTTP) o almacenamiento local/BD. |
| **EARS** | Restricciones del sistema (ubicuo, evento, estado, condición, opcional). |
| **Un CU por objetivo de actor** | Distintos disparadores/postcondiciones ⇒ CUs distintos. |
| **Testabilidad en móvil** | Todo `Entonces` cita un oráculo: testID de Compose, texto accesible, código HTTP, tabla local (Room), Keystore, notificación, deep link o métrica. |
| **Trazabilidad** | Cada CU declara RF/RNF/ADR y su paridad con la web (CU-W). |
| **Plataforma** | Android nativo (Kotlin + Jetpack Compose), `minSdk 26`, `targetSdk 35`; ES/EN/RU; TalkBack. |

---

## 2. Actores

| Actor | Descripción | Autenticación |
|---|---|---|
| **Visitante** | Instala la app sin wallet y explora el catálogo y las secciones públicas | Ninguna |
| **Huésped / Comprador** | Conecta su wallet y compra/reserva noches | Wallet (firma) + sesión local del dispositivo |
| **Portador** | Ya posee uno o más NFT-noche y gestiona reventas, resguardo y cobros | Wallet con posesión verificada |
| **Sistema de notificaciones** | FCM + worker del backend | Servidor |
| **Recepción (externo)** | Valida el pase QR del huésped en la web de recepción | Fuera de la app |
| **Soporte** | Atiende incidencias del huésped (canal web/email) | Fuera de la app |

---

## 3. Decisiones de producto asumidas (pendientes de aprobación)

| # | Decisión | Justificación |
|---|---|---|
| A-1 | **App nativa Android** (Kotlin + Compose), no PWA/TWA | UX de campo, biometría, Keystore y notificaciones fiables; el requisito RNF-18 ya exige flujo móvil |
| A-2 | **No custodial**: la app nunca ve ni guarda claves privadas | Coherente con RF-04, RNF-13 y ADR-11; la wallet vive en MetaMask/WalletConnect |
| A-3 | **WalletConnect v2 + deep link a MetaMask** (ratificado 2026-10-20) | Cubre cualquier wallet Android; el QR se escanea desde otro dispositivo |
| A-4 | **Sin login por contraseña**: la identidad es la wallet; el backend no crea cuentas de huésped | Minimización de datos (RNF-05) y simplicidad; el huésped no es un operador |
| A-5 | **Offline parcial**: catálogo cacheado y **resguardo QR siempre disponible**; las compras exigen red | El resguardo es lo único crítico sin cobertura (hotel, playa, sótano) |
| A-6 | **Push con FCM** + email; preferencias y baja del huésped | RF-16/RF-37 y RNF-M-10 |
| A-7 | **Sin PII en el dispositivo** salvo lo imprescindible; caché cifrada y borrable | RGPD/RNF-05; datos de estancia mínimos |
| A-8 | **ES/EN/RU** desde v1 y accesibilidad TalkBack | RNF-06/RNF-20 y paridad con la web |
| A-9 | **v1 = huésped**; back-office y terminal fuera de alcance | El personal trabaja en web (D-49/D-50) |
| A-10 | **Bloqueo biométrico obligatorio** + **Play Integrity opcional** (ratificado 2026-10-20) | Protege el resguardo sin bloquear la compra; Integrity se activa con la ficha de Play estable |

**Fuera de alcance v1:** administración de habitaciones/contenido, suites de mantenimiento/ama de llaves,
terminal PIN, exportación de auditoría, gestión de roles on-chain, PMS y finanzas.

---

## 4. Inventario de casos de uso de la APK

| CU | Objetivo del actor | Actor | Requisitos | Paridad web |
|---|---|---|---|---|
| CU-A-01 | Instalar la app y completar el onboarding (términos, privacidad, idioma) | Visitante | RNF-05, RNF-20, RNF-06 | CU-W-01/17 |
| CU-A-02 | Conectar una wallet sin custodia | Visitante | RF-04, RF-11, RNF-13 | CU-W-04 |
| CU-A-03 | Añadir/cambiar a la red del proyecto (81234) | Visitante | RF-04, RNF-18 | CU-W-04 |
| CU-A-04 | Explorar el catálogo y filtrar (con caché offline) | Visitante | RF-01, RF-02, RF-14, RNF-02 | CU-W-02 |
| CU-A-05 | Ver la ficha de una noche/habitación | Visitante | RF-18a, RNF-12 | CU-W-02 |
| CU-A-06 | Consultar disponibilidad y retener una noche | Comprador | RF-20, RF-30–RF-35 | CU-W-03 |
| CU-A-07 | Comprar una noche en venta primaria | Comprador | RF-03, RF-19 | CU-W-05 |
| CU-A-08 | Comprar una noche en reventa con royalty | Comprador | RF-07, RF-08, RNF-10 | CU-W-06 |
| CU-A-09 | Ver mis noches y su estado | Portador | RF-20, RF-33 | CU-W-09 |
| CU-A-10 | Guardar y mostrar el resguardo QR **offline** | Portador | RF-20, RF-33, ADR-05 | CU-W-09 |
| CU-A-11 | Hacer check-in mostrando el pase y ver el estado de la estancia | Portador | RF-20, RF-33 | CU-W-10 |
| CU-A-12 | Gestionar mis reventas (listar, editar precio, retirar, cobrar) | Portador | RF-07, RF-15, RF-36 | CU-W-07/08 |
| CU-A-13 | Participar en subastas (ver, pujar, retirar) | Comprador | RF-13, ADR-28 | CU-W-14 |
| CU-A-14 | Escribir una reseña verificada | Huésped | RF-57–RF-60 (v3) | CU-W-15 |
| CU-A-15 | Consultar y reclamar un cargo por daños | Huésped | RF-K-08, RNF-M-10 | CU-W-12 |
| CU-A-16 | Recibir notificaciones push y gestionar preferencias/baja | Huésped | RF-16, RF-37, RNF-M-10 | CU-W-18 |
| CU-A-17 | Abrir enlaces profundos de noches/subastas/resguardo/cargos | Todos | RNF-18, RF-20 | CU-W-02/09 |
| CU-A-18 | Proteger la app (bloqueo biométrico/PIN y almacenamiento seguro) | Huésped | RNF-13, RNF-05 | — (nuevo) |
| CU-A-19 | Usar la app sin conexión y recuperarse al volver la red | Huésped | RNF-12, RNF-18 | CU-W-01/09 |
| CU-A-20 | Cambiar idioma (ES/EN/RU) y usar lector de pantalla | Todos | RNF-06, RNF-20 | CU-W-01/17 |
| CU-A-21 | Ejercer derechos de privacidad (acceso, exportación, supresión) | Huésped | RNF-05, RNF-M-10 | CU-W-12/18 |
| CU-A-22 | Consultar ayuda, manuales y contacto de soporte | Todos | RF-56, RF-59 | CU-W-17 |
| CU-A-23 | Mantener la app actualizada y compatible | Todos | RNF-18, RNF-21 | — (nuevo) |
| CU-A-24 | Diagnóstico y salud de la app (crash reporting, versión, red) | Sistema | RNF-17, RNF-21 | CU-W-24 |

---

## 5. Casos de uso detallados

### CU-A-01 — Instalar la app y completar el onboarding

- **Actor:** Visitante. **Precondición:** dispositivo Android ≥ 8.0 (`minSdk 26`).
- **Disparador:** primer arranque.
- **Flujo principal:** 1) splash + versión mínima comprobada; 2) carrusel breve (qué es una noche NFT,
  qué se puede hacer, aviso de que la app **no custodia claves**); 3) aceptación de términos y política de
  privacidad; 4) elección de idioma (ES/EN/RU); 5) se ofrece conectar wallet o explorar como visitante.
- **Alternativos:** `A1` versión por debajo del mínimo → pantalla de actualización obligatoria;
  `A2` sin red → onboarding con contenido local y conexión diferida.
- **Criterios:**

```gherkin
Dado un dispositivo recién instalado
Cuando el usuario abre la app por primera vez
Entonces ve el onboarding y debe aceptar términos y privacidad para continuar
Y puede elegir ES/EN/RU antes de continuar
Y la app aclara que nunca solicita la clave privada

Dado un onboarding no aceptado
Cuando el usuario cierra y vuelve a abrir la app
Entonces el onboarding se muestra de nuevo (no se da por aceptado)
```

- **Restricciones (EARS):** El sistema no deberá continuar sin aceptación explícita de términos y
  privacidad. Si la versión instalada es inferior a la mínima soportada, entonces el sistema deberá
  bloquear el uso y ofrecer la actualización.
- **Trazabilidad:** RNF-05, RNF-06, RNF-20, RNF-21; CU-W-01/17.
- **Oráculos:** `onboarding-accept` testID, preferencia local `onboardingAccepted`, `minAppVersion` remoto,
  pantalla `UpdateRequired`.

---

### CU-A-02 — Conectar una wallet sin custodia

- **Actor:** Visitante. **Precondición:** wallet instalada o WalletConnect disponible.
- **Disparador:** pulsa «Conectar wallet».
- **Flujo principal:** 1) elige WalletConnect (QR/copiar) o deep link a MetaMask; 2) la wallet aprueba la
  conexión y devuelve la cuenta; 3) la app muestra la dirección abreviada y el estado «conectada».
- **Alternativos:** `A1` sin wallet instalada → guía de instalación (MetaMask/otra compatible);
  `A2` usuario rechaza → sigue como visitante; `A3` sesión WalletConnect caduca → reconexión guiada.
- **Criterios:**

```gherkin
Dado un visitante sin wallet conectada
Cuando elige WalletConnect y aprueba en su wallet
Entonces la app muestra la dirección abreviada como conectada
Y no solicita ni almacena la clave privada en ningún momento

Dado un usuario que rechaza la conexión
Cuando vuelve a la app
Entonces sigue como visitante y puede explorar el catálogo sin error bloqueante
```

- **Restricciones (EARS):** El sistema no deberá almacenar claves privadas ni seed phrases. Si la wallet
  cambia de cuenta, entonces el sistema deberá limpiar la sesión local y recargar los datos de la nueva
  cuenta.
- **Trazabilidad:** RF-04, RF-11, RNF-13, RNF-18, RNF-19, ADR-11.
- **Oráculos:** dirección mostrada, `walletConnected` state, `onboarding.connect`; tests de repositorio
  local (no hay claves persistidas).
- **Paridad:** CU-W-04.

---

### CU-A-03 — Añadir/cambiar a la red del proyecto

- **Actor:** Visitante. **Precondición:** wallet conectada en otra red o sin la red.
- **Disparador:** la app detecta `chainId != 81234` al operar.
- **Flujo principal:** 1) la app muestra «red incorrecta» con el `chainId` esperado; 2) solicita
  `wallet_addEthereumChain`/`wallet_switchEthereumChain`; 3) tras el cambio, habilita las acciones.
- **Alternativos:** `A1` el usuario rechaza → acciones de escritura deshabilitadas; `A2` wallet no soporta
  el método → instrucciones manuales con los datos de red.
- **Criterios:**

```gherkin
Dado un usuario conectado en otra red
Cuando abre una noche para comprar
Entonces la app muestra "Red incorrecta" y el botón para cambiar a la red del proyecto
Y la compra está deshabilitada hasta que la wallet cambie de red

Cuando la wallet cambia a la red 81234
Entonces la app habilita la compra sin reiniciar
```

- **EARS:** Mientras la red no sea la configurada, el sistema deberá impedir cualquier firma.
- **Trazabilidad:** RF-04, RNF-18; CU-W-04. **Oráculos:** banner `wrong-network`, `chainId` de la wallet,
  estado del botón de compra.

---

### CU-A-04 — Explorar el catálogo y filtrar (con caché offline)

- **Actor:** Visitante. **Precondición:** ninguna.
- **Disparador:** abre la pestaña «Explorar».
- **Flujo principal:** 1) carga noches publicadas con foto del tipo, fecha, habitación y precio; 2) filtros
  por fecha, precio, tipo; 3) paginación/infinite scroll; 4) abre una noche.
- **Alternativos:** `A1` sin red → muestra la última caché con aviso de “puede no estar actualizado”;
  `A2` sin resultados → empty-state con limpiar filtros; `A3` noche caducada → no comprable.
- **Criterios:**

```gherkin
Dado un catálogo con noches publicadas
Cuando el visitante filtra por tipo "suite"
Entonces solo se muestran noches de ese tipo
Y el filtro se conserva al volver de la ficha

Dado un dispositivo sin conexión con caché previa
Cuando el visitante abre "Explorar"
Entonces ve las noches cacheadas con un aviso de datos no actualizados
Y las acciones de compra quedan deshabilitadas
```

- **EARS:** De acuerdo con RNF-18, el sistema deberá funcionar en móvil sin `window.ethereum`. Si los datos
  vienen de caché, el sistema deberá marcarlos como no verificados.
- **Trazabilidad:** RF-01, RF-02, RF-14, RNF-02, RNF-12, RNF-18; CU-W-02.
- **Oráculos:** testID `night-card-<tokenId>`, filtro en estado de navegación, marca `stale-cache`, tabla
  Room `cached_nights`; tests de ViewModel + UI Compose.

---

### CU-A-05 — Ver la ficha de una noche/habitación

- **Actor:** Visitante. **Precondición:** noche visible en catálogo.
- **Disparador:** toca una tarjeta.
- **Flujo principal:** 1) muestra galería del **tipo** de habitación, fecha, precio, descripción y reglas;
  2) muestra el estado (disponible/reservada/vendida) y el botón de compra si aplica.
- **Alternativos:** `A1` imágenes remotas caídas → respaldo local; `A2` noche caducada → mensaje y sin CTA.
- **Criterios:**

```gherkin
Dado un visitante en el catálogo
Cuando abre una noche
Entonces ve la foto del tipo de habitación (no una foto de otra habitación)
Y ve fecha, precio y estado de disponibilidad
Y si no está disponible no aparece el botón de compra
```

- **EARS:** El sistema deberá usar la foto del **tipo** de habitación (RF-18a) y no inventar imágenes.
- **Trazabilidad:** RF-18a, RNF-12; CU-W-02. **Oráculos:** `room-type-image`, `night-status`,
  `buy-cta` ausente/presente.

---

### CU-A-06 — Consultar disponibilidad y retener una noche

- **Actor:** Comprador. **Precondición:** wallet conectada (CU-A-02/03).
- **Disparador:** elige fechas y pulsa «Reservar».
- **Flujo principal:** 1) consulta disponibilidad por rango; 2) confirma la retención; 3) el backend crea la
  reserva y devuelve folio y vencimiento; 4) la app muestra el resumen y cómo completar el pago.
- **Alternativos:** `A1` solape → 409 y alternativas de fecha; `A2` hold vencido → liberar y reintentar;
  `A3` habitación bloqueada por mantenimiento → no disponible.
- **Criterios:**

```gherkin
Dado un comprador con wallet conectada
Cuando elige dos noches libres y confirma la retención
Entonces la app muestra el folio y la fecha límite del bloqueo
Y la noche queda marcada como retenida en la app

Dado un intento de retener una noche ya retenida
Cuando la app envía la solicitud
Entonces recibe 409 y muestra las fechas alternativas
```

- **Trazabilidad:** RF-20, RF-30–RF-35, D-34…D-39; CU-W-03.
- **Oráculos:** HTTP 201/409, `holdExpiresAt` en pantalla, Reintentos; tests de API + ViewModel.

---

### CU-A-07 — Comprar una noche en venta primaria

- **Actor:** Comprador. **Precondición:** CU-A-02/03/06; saldo suficiente para precio + gas mínimo.
- **Disparador:** pulsa «Comprar» y confirma.
- **Flujo principal:** 1) resumen (habitación, fecha, precio, comisión); 2) confirmación explícita; 3) la
  wallet firma `buy`; 4) la app muestra pendiente → confirmada; 5) la noche aparece en «Mis noches».
- **Alternativos:** `A1` pausa del contrato → CTA deshabilitado y aviso; `A2` revert → mensaje canónico;
  `A3` app en segundo plano durante la tx → se recupera el estado al volver.
- **Criterios:**

```gherkin
Dado un comprador con saldo y una noche disponible
Cuando confirma la compra y firma en su wallet
Entonces la app muestra la tx pendiente y luego confirmada con su hash
Y la noche aparece en "Mis noches"

Dado el contrato en pausa
Cuando el comprador abre la compra
Entonces el botón está deshabilitado y se explica la pausa
Y no se abre la wallet
```

- **EARS:** El sistema no deberá firmar por el usuario. Si la tx revierte, entonces el sistema deberá
  mostrar el motivo y no marcar la noche como comprada.
- **Trazabilidad:** RF-03, RF-19, RNF-05, RNF-14, RNF-18, ADR-11; CU-W-05.
- **Oráculos:** estado de tx persistido, hash visible, `/mis-noches` actualizado, evento `Sale`; tests de
  integración con Anvil/emulador.

---

### CU-A-08 — Comprar una noche en reventa con royalty

- **Actor:** Comprador. **Precondición:** noche listada en reventa.
- **Disparador:** desde la ficha de una noche en reventa.
- **Flujo principal:** 1) muestra precio, royalty del hotel y vendedor; 2) confirma; 3) firma `buyResale`;
  4) confirmación y actualización de «Mis noches».
- **Alternativos:** `A1` listado retirado → mensaje y refresco; `A2` intento de comprar la propia noche →
  bloqueado en cliente y contrato.
- **Criterios:**

```gherkin
Dado un comprador y una noche listada en reventa
Cuando firma la compra
Entonces la app muestra el royalty aplicado y el importe al vendedor
Y la noche pasa a "Mis noches"

Dado un listado retirado mientras el comprador lo miraba
Cuando confirma la compra
Entonces la app muestra "ya no está en venta" y refresca el catálogo
```

- **Trazabilidad:** RF-07, RF-08, RNF-10, ADR-27; CU-W-06.
- **Oráculos:** eventos `Sale(SECONDARY)`/`RoyaltyPaid`, desglose en UI, refresh de catálogo.

---

### CU-A-09 — Ver mis noches y su estado

- **Actor:** Portador. **Precondición:** wallet conectada con NFTs.
- **Disparador:** pestaña «Mis noches».
- **Flujo principal:** 1) lista las noches propias con estado (disponible, en reventa, reservada, usada,
  caducada); 2) ordena por fecha; 3) abre detalle/resguardo.
- **Alternativos:** `A1` sin noches → empty-state con CTA al catálogo; `A2` wallet con muchas noches →
  paginación.
- **Criterios:**

```gherkin
Dado un portador con dos noches
Cuando abre "Mis noches"
Entonces ve ambas con su estado y fecha correctos
Y cada una abre su detalle con el resguardo disponible

Dado un portador sin noches
Cuando abre "Mis noches"
Entonces ve un estado vacío con acceso al catálogo
```

- **Trazabilidad:** RF-20, RF-33; CU-W-09. **Oráculos:** `my-nights-list`, badges de estado, datos
  verificados contra `ownerOf`.

---

### CU-A-10 — Guardar y mostrar el resguardo QR offline

- **Actor:** Portador. **Precondición:** noche propia vigente; resguardo emitido por el backend.
- **Disparador:** abre el resguardo y pulsa «Guardar en el dispositivo».
- **Flujo principal:** 1) descarga el pase firmado (JWS) + QR; 2) lo guarda **cifrado** en almacenamiento
  local; 3) sin conexión, puede mostrarlo a pantalla completa para recepción.
- **Alternativos:** `A1` sin red al emitir → se emite al recuperar conexión (el resguardo requiere firma
  del servidor); `A2` resguardo usado → se marca y no se regenera; `A3` almacenamiento lleno → aviso.
- **Criterios:**

```gherkin
Dado un portador con una noche vigente y conexión
Cuando guarda el resguardo en la app
Entonces el QR queda disponible en el dispositivo cifrado
Y puede mostrarlo sin conexión a pantalla completa

Dado un resguardo ya utilizado
Cuando el portador intenta mostrarlo de nuevo para check-in
Entonces la app lo marca como usado y no genera un QR válido
```

- **EARS:** El sistema deberá guardar el resguardo cifrado (Keystore). Si el resguardo no puede
  verificarse, entonces el sistema no deberá mostrarlo como válido.
- **Trazabilidad:** RF-20, RF-33, ADR-05, RNF-13; CU-W-09.
- **Oráculos:** archivo cifrado local, pantalla `qr-fullscreen`, estado `used`, validación en recepción.

---

### CU-A-11 — Hacer check-in mostrando el pase y ver el estado de la estancia

- **Actor:** Portador. **Precondición:** resguardo vigente; llegada al hotel.
- **Disparador:** en recepción, abre el pase o la pestaña «Estancia».
- **Flujo principal:** 1) muestra el QR a recepción; 2) la web de recepción valida y registra el check-in;
  3) la app refleja el estado (check-in realizado, instrucciones, hora de salida).
- **Alternativos:** `A1` QR no válido → la app ofrece el código de reserva como respaldo; `A2` sin red en
  la app → el QR offline sigue siendo válido (la validación es de recepción).
- **Criterios:**

```gherkin
Dado un portador en recepción con el pase abierto
Cuando recepción escanea el QR y registra el check-in
Entonces la app muestra la estancia como activa con la hora de entrada
Y el pase deja de ofrecer un QR de check-in nuevo

Dado un portador sin cobertura en la app
Cuando recepción valida el QR
Entonces el check-in se completa igualmente (la app solo muestra el pase)
```

- **EARS:** El sistema no deberá requerir conexión en la app para mostrar el QR ya emitido.
- **Trazabilidad:** RF-20, RF-33, ADR-05; CU-W-10.
- **Oráculos:** estado de estancia, QR offline, respuesta de `/api/reception/checkin`.

---

### CU-A-12 — Gestionar mis reventas (listar, editar precio, retirar, cobrar)

- **Actor:** Portador. **Precondición:** noche propia vigente y no usada.
- **Disparador:** detalle de la noche → «Poner en reventa» o pestaña «Reventas».
- **Flujo principal:** 1) fija precio > 0 y firma `list`; 2) puede editar el precio (relist) o retirar
  (`unlist`); 3) el saldo pendiente por reventas se reclama con `claim`.
- **Alternativos:** `A1` precio inválido → validación local; `A2` noche caducada → no listable; `A3` sin
  saldo → botón de cobro oculto.
- **Criterios:**

```gherkin
Dado un portador con una noche vigente
Cuando la pone en venta con precio mayor que 0 y firma
Entonces la app muestra la noche como "en reventa"
Y se emite Listed en la cadena

Dado un portador con saldo pendiente
Cuando pulsa "Cobrar"
Entonces firma claim y el saldo pasa a 0 en la app
```

- **Trazabilidad:** RF-07, RF-15, RF-36, RNF-10; CU-W-07/08.
- **Oráculos:** eventos `Listed`/`Unlisted`, saldo pendiente, `claim`; tests de integración.

---

### CU-A-13 — Participar en subastas (ver, pujar, retirar)

- **Actor:** Comprador. **Precondición:** wallet conectada; subasta abierta.
- **Disparador:** pestaña «Subastas» o deep link de una subasta.
- **Flujo principal:** 1) lista subastas con puja mínima y cuenta atrás; 2) abre una y firma `bid`; 3) si
  gana, la noche aparece en «Mis noches»; si pierde, puede `withdraw`.
- **Alternativos:** `A1` puja por debajo del mínimo → validación y revert esperado; `A2` anti-sniping →
  la cuenta atrás se extiende; `A3` subasta cerrada → solo lectura.
- **Criterios:**

```gherkin
Dado un comprador y una subasta abierta
Cuando puja por encima del mínimo y firma
Entonces la app muestra su puja como la mejor
Y actualiza la cuenta atrás vigente

Dado un comprador con una puja superada
Cuando retira sus fondos
Entonces recibe exactamente su importe en la wallet
```

- **Trazabilidad:** RF-13, ADR-28, CU-W-14.
- **Oráculos:** `BidPlaced`, mejor puja, `withdraw`; tests de contrato y UI.

---

### CU-A-14 — Escribir una reseña verificada

- **Actor:** Huésped con noche consumida. **Precondición:** estancia finalizada.
- **Disparador:** desde la noche consumida → «Escribir reseña».
- **Flujo principal:** 1) puntuación 1–5 + comentario; 2) envío; 3) la reseña queda `PENDING` hasta
  moderación; 4) cuando se aprueba, el huésped ve su reseña publicada.
- **Alternativos:** `A1` noche no consumida → acción no disponible; `A2` reseña duplicada → error claro;
  `A3` rechazada → se muestra el estado sin exponer motivos internos.
- **Criterios:**

```gherkin
Dado un huésped con una noche consumida
Cuando envía una reseña de 4 estrellas
Entonces la app confirma el envío como pendiente de moderación
Y no permite enviar otra reseña para la misma noche
```

- **Trazabilidad:** RF-57–RF-60 (v3), RNF-05; CU-W-15.
- **Oráculos:** `POST /api/reviews` 201/409, estado `PENDING`, `UNIQUE(token_id)`.

---

### CU-A-15 — Consultar y reclamar un cargo por daños

- **Actor:** Huésped. **Precondición:** cargo asociado a su noche/folio.
- **Disparador:** notificación push/email o pestaña «Cargos».
- **Flujo principal:** 1) ve descripción, importe y plazo; 2) acepta o reclama con notas; 3) recibe la
  resolución del hotel.
- **Alternativos:** `A1` fuera de plazo → no permite reclamar; `A2` enlace inválido → estado honesto;
  `A3` resuelto aceptado → se liquida en el check-out.
- **Criterios:**

```gherkin
Dado un huésped con un cargo pendiente
Cuando abre el detalle del cargo
Entonces ve descripción, importe y plazo de reclamación
Y puede aceptar o reclamar con notas

Dado un huésped que reclama dentro de plazo
Cuando envía la reclamación
Entonces el estado pasa a DISPUTED y se registra la fecha
```

- **EARS:** El sistema deberá notificar con datos mínimos y no exponer PII de otros huéspedes.
- **Trazabilidad:** RF-K-08, RNF-M-10, D-C14; CU-W-12.
- **Oráculos:** estados `damage_charge_guest_notifications`, `POST /api/damage-charges/[id]/dispute`.

---

### CU-A-16 — Recibir notificaciones push y gestionar preferencias/baja

- **Actor:** Huésped. **Precondición:** permiso de notificaciones (Android 13+).
- **Disparador:** evento del backend (venta, reventa, cargo, recordatorio, check-in).
- **Flujo principal:** 1) la app pide permiso en un momento contextual (no en el arranque); 2) registra el
  token FCM en el backend; 3) muestra la notificación y navega al destino; 4) permite preferencias y baja.
- **Alternativos:** `A1` permiso denegado → avisos por email y aviso en la app; `A2` token caducado →
  renovación automática; `A3` baja → se elimina el token y no se envían más.
- **Criterios:**

```gherkin
Dado un huésped que acepta las notificaciones
Cuando se produce la venta de una de sus noches
Entonces recibe una push que abre el detalle de esa noche

Dado un huésped que desactiva las notificaciones en la app
Cuando el backend procesa un nuevo evento
Entonces no se envía push a ese dispositivo
```

- **Trazabilidad:** RF-16, RF-37, RNF-M-10, ADR-24; CU-W-18.
- **Oráculos:** token FCM registrado/eliminado, payload de la notificación, preferencia local/remota.

---

### CU-A-17 — Abrir enlaces profundos de noches/subastas/resguardo/cargos

- **Actor:** Todos. **Precondición:** app instalada o App Links verificados.
- **Disparador:** toca un enlace (`https://<host>/noche/<tokenId>`, `/subasta/<id>`, `/resguardo/<tokenId>`,
  `/cargos/<id>`).
- **Flujo principal:** 1) Android abre la app (App Links); 2) la app resuelve el destino; 3) si requiere
  wallet y no está conectada, conecta primero y continúa.
- **Alternativos:** `A1` app no instalada → Play Store; `A2` enlace inválido → pantalla honesta; `A3`
  versión antigua sin ruta → actualización y reintento.
- **Criterios:**

```gherkin
Dado un huésped con la app instalada
Cuando abre un enlace de su resguardo
Entonces la app abre la pantalla del resguardo correcto
Y si la wallet no está conectada, la conecta antes de continuar

Dado un enlace con token inexistente
Cuando se abre
Entonces la app muestra "no encontrado" y no inventa datos
```

- **EARS:** El sistema deberá validar el host de los enlaces (App Links) y no procesar deep links de
  dominios ajenos.
- **Trazabilidad:** RNF-18, RNF-19, RF-20, RNF-13; CU-W-02/09.
- **Oráculos:** `intent-filter` verificado, navegación a ruta, estado de error.

---

### CU-A-18 — Proteger la app (bloqueo biométrico/PIN y almacenamiento seguro)

- **Actor:** Huésped. **Precondición:** app con wallet conectada y resguardo guardado.
- **Disparador:** abre la app o intenta ver el resguardo.
- **Flujo principal:** 1) si el bloqueo está activo, pide biometría/PIN del dispositivo; 2) desbloquea;
  3) el resguardo y los datos sensibles se leen descifrados solo en memoria.
- **Alternativos:** `A1` biometría no disponible → PIN del dispositivo o contraseña de la app; `A2` intentos
  fallidos → bloqueo temporal; `A3` usuario desactiva el bloqueo → confirma con biometría.
- **Criterios:**

```gherkin
Dado un huésped con bloqueo biométrico activado
Cuando abre la app tras 5 minutos en segundo plano
Entonces se solicita biometría antes de mostrar sus noches
Y el resguardo no se muestra sin desbloquear

Dado un huésped que cierra sesión
Cuando vuelve a abrir la app
Entonces la wallet está desconectada y los datos locales sensibles se han borrado
```

```gherkin
Dado un build con Play Integrity activado y un dispositivo no aprobado
Cuando el huésped intenta mostrar el resguardo
Entonces la app lo limita a modo de solo lectura con un aviso
Y no permite operaciones de compra/venta desde ese dispositivo
```

- **EARS:** El sistema deberá almacenar el resguardo y tokens en almacenamiento cifrado (Android Keystore).
  El sistema deberá exigir autenticación biométrica/del dispositivo para abrir la app y mostrar el
  resguardo (obligatorio en v1). Si Play Integrity está activo y el dispositivo no es aprobado,
  entonces el sistema deberá restringir las operaciones sensibles a solo lectura. El sistema deberá
  borrar los datos locales al cerrar sesión/desconectar la wallet.
- **Trazabilidad:** RNF-13, RNF-05, RNF-18; nuevo (sin paridad web).
- **Oráculos:** biometría solicitada, Keystore/EncryptedFile, limpieza de caché al desconectar.

---

### CU-A-19 — Usar la app sin conexión y recuperarse al volver la red

- **Actor:** Huésped. **Precondición:** uso previo con caché.
- **Disparador:** pierde conectividad.
- **Flujo principal:** 1) la app muestra un indicador global «sin conexión»; 2) permite ver catálogo
  cacheado y resguardos guardados; 3) al volver la red, sincroniza y retira el aviso.
- **Alternativos:** `A1` compra intentada sin red → se bloquea con mensaje y se puede reintentar; `A2`
  resguardo no descargado antes → no disponible offline, aviso claro; `A3` datos obsoletos → marca
  «puede no estar actualizado».
- **Criterios:**

```gherkin
Dado un huésped sin conexión con resguardo guardado
Cuando abre la app
Entonces puede ver el resguardo y el catálogo cacheado
Y la compra está deshabilitada con un aviso de conexión

Cuando vuelve la conexión
Entonces la app sincroniza los datos y retira el indicador de offline
```

- **EARS:** Mientras no haya red, el sistema deberá impedir operaciones que requieran firma/backend y
  mantener disponible el resguardo ya emitido.
- **Trazabilidad:** RNF-12, RNF-18; CU-W-01/09.
- **Oráculos:** indicador offline, `cached_nights`, compra deshabilitada, sync al reconectar.

---

### CU-A-20 — Cambiar idioma (ES/EN/RU) y usar lector de pantalla

- **Actor:** Todos. **Precondición:** app instalada.
- **Disparador:** ajustes o primer onboarding.
- **Flujo principal:** 1) cambia el idioma; 2) toda la UI se actualiza sin reiniciar; 3) con TalkBack, los
  controles anuncian etiqueta, estado y acción.
- **Alternativos:** `A1` idioma del sistema no soportado → vuelve a ES; `A2` texto largo → sin truncados
  inaccesibles.
- **Criterios:**

```gherkin
Dado un usuario con la app en español
Cuando cambia el idioma a inglés
Entonces toda la interfaz y los textos de accesibilidad se muestran en inglés sin reiniciar

Dado un usuario con TalkBack activo
Cuando navega al botón de compra
Entonces escucha el nombre "Comprar noche" y su estado habilitado/deshabilitado
```

- **EARS:** El sistema deberá anunciar en accesibilidad el nombre, rol y estado de cada control
  interactivo. El sistema deberá soportar ES/EN/RU.
- **Trazabilidad:** RNF-06, RNF-20; CU-W-01/17.
- **Oráculos:** textos por locale, `contentDescription`/`semantics`, pruebas de TalkBack/Compose.

---

### CU-A-21 — Ejercer derechos de privacidad (acceso, exportación, supresión)

- **Actor:** Huésped. **Precondición:** wallet conectada (identidad de la app).
- **Disparador:** ajustes → «Privacidad y mis datos».
- **Flujo principal:** 1) solicita acceso/exportación de sus datos; 2) recibe el archivo o confirmación;
  3) puede solicitar supresión de los datos off-chain asociados, con las excepciones legales.
- **Alternativos:** `A1` solicitud con obligaciones pendientes (cargo en disputa) → se informa la
  excepción; `A2` sin datos → respuesta vacía legítima.
- **Criterios:**

```gherkin
Dado un huésped autenticado
Cuando solicita la exportación de sus datos
Entonces la app registra la solicitud y muestra el plazo y el canal de entrega

Dado un huésped que solicita supresión sin obligaciones pendientes
Cuando confirma la solicitud
Entonces se eliminan sus datos off-chain y la app lo confirma
```

- **EARS:** El sistema deberá atender acceso/supresión según RNF-M-10 y conservar lo exigido por ley
  (p. ej. evidencia de cargos en disputa) informándolo al usuario.
- **Trazabilidad:** RNF-05, RNF-M-10; CU-W-12/18.
- **Oráculos:** solicitud registrada, export disponible, borrado verificado en backend.

---

### CU-A-22 — Consultar ayuda, manuales y contacto de soporte

- **Actor:** Todos. **Precondición:** ninguna.
- **Disparador:** menú «Ayuda».
- **Flujo principal:** 1) manual del huésped embebido (offline) y FAQ; 2) enlace a soporte/email; 3) estado
  de la app/versión.
- **Alternativos:** `A1` sin red → manual offline; `A2` enlace externo no disponible → copiar dirección.
- **Criterios:**

```gherkin
Dado un huésped en la app
Cuando abre "Ayuda"
Entonces ve el manual del huésped y el contacto de soporte
Y puede leerlo sin conexión
```

- **Trazabilidad:** RF-56, RF-59; CU-W-17.
- **Oráculos:** manual empaquetado (assets), enlaces de soporte, texto offline.

---

### CU-A-23 — Mantener la app actualizada y compatible

- **Actor:** Todos. **Precondición:** app instalada.
- **Disparador:** arranque o vuelta a primer plano.
- **Flujo principal:** 1) consulta la versión mínima publicada; 2) si es obligatoria, bloquea con CTA a
  Play Store; 3) si es recomendada, permite continuar.
- **Alternativos:** `A1` Play Store no disponible → instrucciones; `A2` versión futura (build adelantado) →
  modo seguro solo lectura.
- **Criterios:**

```gherkin
Dada una versión mínima publicada superior a la instalada
Cuando el usuario abre la app
Entonces ve una pantalla de actualización obligatoria y no accede al catálogo

Dada una actualización recomendada
Cuando el usuario abre la app
Entonces puede continuar y se le ofrece actualizar más tarde
```

- **EARS:** Si la versión instalada es inferior a la mínima soportada, entonces el sistema deberá bloquear
  las operaciones de escritura y mostrar la actualización.
- **Trazabilidad:** RNF-18, RNF-21; nuevo.
- **Oráculos:** `minSupportedVersion` remoto, pantalla `UpdateRequired`, CTA Play Store.

---

### CU-A-24 — Diagnóstico y salud de la app

- **Actor:** Sistema. **Precondición:** app en uso.
- **Disparador:** error, crash o petición de soporte.
- **Flujo principal:** 1) registra crashes/errores (opt-in) sin PII; 2) expone versión, dispositivo y estado
  de red en «Acerca de»; 3) permite exportar un diagnóstico para soporte.
- **Alternativos:** `A1` usuario sin telemetría → solo diagnóstico local; `A2` sin red → se guarda y se
  envía al reconectar.
- **Criterios:**

```gherkin
Dado un crash en la app con telemetría activada
Cuando el usuario vuelve a abrirla
Entonces el crash queda registrado sin PII y con versión y modelo de dispositivo

Dado un usuario que pide soporte
Cuando abre "Acerca de"
Entonces puede copiar/exportar un diagnóstico con versión y estado de red
```

- **EARS:** El sistema no deberá incluir PII en la telemetría; la telemetría deberá ser desactivable.
- **Trazabilidad:** RNF-17, RNF-21, RNF-05; CU-W-24.
- **Oráculos:** informe de crash sin PII, pantalla Acerca de, export de diagnóstico.

---

## 6. Matriz de trazabilidad requisito → caso de uso (APK)

| Requisito | Casos APK |
|---|---|
| RF-01, RF-02, RF-14, RF-18a | CU-A-04, CU-A-05 |
| RF-03, RF-19 | CU-A-07 |
| RF-04, RF-11 | CU-A-02, CU-A-03 |
| RF-07, RF-08, RF-15, RF-36 | CU-A-08, CU-A-12 |
| RF-13 | CU-A-13 |
| RF-16, RF-37 | CU-A-16 |
| RF-17 | CU-A-04, CU-A-05 |
| RF-20, RF-33 | CU-A-06, CU-A-09, CU-A-10, CU-A-11, CU-A-17 |
| RF-56–RF-60 | CU-A-14, CU-A-22 |
| RF-K-08, RF-S-04 | CU-A-15 |
| RNF-02, RNF-11, RNF-12 | CU-A-04, CU-A-05, CU-A-19 |
| RNF-05, RNF-13 | CU-A-02, CU-A-10, CU-A-18, CU-A-21, CU-A-24 |
| RNF-06, RNF-20 | CU-A-01, CU-A-20, CU-A-22 |
| RNF-18, RNF-21 | CU-A-03, CU-A-17, CU-A-19, CU-A-23 |
| RNF-M-10 | CU-A-15, CU-A-16, CU-A-21 |
| RNF-17 | CU-A-24 |

**Paridad web ↔ APK (resumen):**

| Capacidad | Web (CU-W) | APK (CU-A) | Diferencia |
|---|---|---|---|
| Catálogo y ficha | CU-W-02 | CU-A-04/05 | APK usa caché offline |
| Compra/reserva | CU-W-03/05/06 | CU-A-06/07/08 | Misma cadena/contrato |
| Resguardo | CU-W-09 | CU-A-09/10/11 | APK: QR **offline** y bloqueo biométrico |
| Reventa/cobro | CU-W-07/08 | CU-A-12 | Misma funcionalidad |
| Subastas | CU-W-14 | CU-A-13 | Misma funcionalidad |
| Reseñas y cargos | CU-W-12/15 | CU-A-14/15 | Misma API |
| Notificaciones | CU-W-18 | CU-A-16 | APK: push nativo FCM |
| Back-office y suites de personal | CU-W-19…24 | **Fuera de alcance** | Solo web |

### 6.1 Requisitos fuera de alcance de la APK v1 (y por qué)

| Requisito(s) | Decisión | Motivo |
|---|---|---|
| RF-05, RF-06, RF-10, RF-30…RF-55 | **Fuera de alcance** | Back-office, recepción y suites de personal se operan en la web (D-49/D-50) |
| RF-M-01…RF-M-12, RF-K-01…RF-K-10, RF-S-01…RF-S-08, RNF-M-* | **Fuera de alcance** | Solo personal; el huésped no firma operaciones internas |
| RF-09 | **Fuera de alcance de la app** | El email al admin es un proceso del worker (sin UI de huésped) |
| RF-12 (asistente IA) | **v1.1** | La app v1 prioriza compra, resguardo offline y check-in; el asistente queda para la siguiente entrega |
| RF-15 (histórico público) | **v1.1** | No es crítico para el viaje del huésped en v1 |
| RF-21 (faucet) | **No aplica** | Solo entorno de desarrollo/CI |
| RF-22, RF-23 | **Fase posterior** | Arweave y MiCA son gates de fases posteriores según el PRD |

> La matriz §6 cubre **todos los requisitos aplicables** a la APK v1; los no aplicables quedan aquí
> justificados (ningún RF del alcance sin CU).

---

## 7. Criterios de aceptación técnicos de la APK (v1)

1. **Build y calidad**: `assembleRelease` firmado reproducible; `lint` sin errores; `detekt`/ktlint
   limpios; pruebas unitarias de ViewModels/repositorios y de UI (Compose) en verde.
2. **Seguridad**: sin claves privadas ni seed en el dispositivo; almacenamiento cifrado (Keystore) para
   resguardo/tokens; `networkSecurityConfig` sin tráfico en claro; deep links con verificación de host;
   dependencias sin vulnerabilidades *high*.
3. **Privacidad**: sin PII en logs/telemetría; consentimiento de privacidad registrado; borrado local al
   desconectar; derechos de acceso/supresión operativos.
4. **Offline**: resguardo visible sin red; catálogo cacheado con marca de frescura; escrituras bloqueadas
   sin conexión con mensaje accionable.
5. **Accesibilidad**: TalkBack recorre todas las acciones; contenido con `contentDescription`; tamaños
   táctiles ≥ 48 dp; contraste AA; fuentes escalables sin cortes.
6. **i18n**: ES/EN/RU completos (sin cadenas hardcodeadas) y cambio de idioma sin reinicio.
7. **Rendimiento**: arranque en frío < 2 s (P75 en dispositivo de gama media); catálogo de 50×90 < 1 s tras
   respuesta; navegación entre pestañas < 300 ms.
8. **Compatibilidad**: `minSdk 26`, `targetSdk 35`; probado en Android 8/10/13/15 y pantallas 5"–6,7".
9. **Distribución**: Play Console con ficha ES/EN; política de privacidad; versión mínima remota; sin
   permisos innecesarios.
10. **Trazabilidad**: cada CU-A con su prueba (unitaria/UI/integración) y su RF/RNF en §6; ningún
    criterio sin oráculo.

---

## 8. Decisiones ratificadas (2026-10-20)

| # | Decisión | Resolución |
|---|---|---|
| A-1 | Estrategia de wallet | **Ratificado**: WalletConnect v2 como vía principal + **deep link a MetaMask** (decisión A-3). |
| A-2 | Alcance de compra en v1 | **Ratificado**: **compra completa en v1** (primaria, reventa y subastas), además de resguardo offline y check-in. |
| A-3 | Endurecimiento | **Ratificado**: **bloqueo biométrico obligatorio**; **Play Integrity opcional** (se activa cuando la ficha de Play esté estable). |

**Siguiente paso de Fase 2:** diagramas UML de casos de uso y secuencias de CU-A-07 (compra), CU-A-10
(resguardo offline), CU-A-16 (push) y CU-A-18 (protección), y auditoría `@audita` del documento.

> **Nota:** este documento es Fase 2 (casos de uso) y no compromete fechas ni presupuesto.
