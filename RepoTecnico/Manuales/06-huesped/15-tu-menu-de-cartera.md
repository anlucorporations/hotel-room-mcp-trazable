# El menú de tu cartera y tu cuenta

> El huésped pulsa un solo botón en la cabecera y desde ahí conecta su cartera, cambia de red o la desconecta; si además tiene sesión de personal, el mismo menú le enseña quién es y a qué pantallas puede entrar.

## Qué hace el sistema

En la web del hotel hay un **único menú de cuenta y cartera** en la cabecera (`apps/web/src/components/layout/SiteHeader.tsx:169`). Es la puerta común al sitio público y al panel del hotel: el mismo componente sirve para el visitante y para el personal (`apps/web/src/components/wallet/WalletMenu.tsx:55`).

El botón lleva un **punto de estado**: encendido si hay cartera conectada y apagado si no (`apps/web/src/components/wallet/WalletMenu.tsx:210`). A su lado va el título, que cambia según el caso: el nombre de usuario cuando hay sesión, la dirección acortada de la cartera cuando hay cartera conectada sin sesión, y «Wallet no conectada» cuando no hay nada (`apps/web/src/components/wallet/WalletMenu.tsx:181`; `apps/web/messages/es.json:1112`).

Qué ofrece el menú lo decide una función **pura** y probada aparte, no el componente (`apps/web/src/lib/wallet-menu-items.ts:52`). Siempre hay **una sola acción de cartera**, según el estado: `Conectar wallet`, `Cambiar de red` o `Desconectar wallet` (`apps/web/src/lib/wallet-menu-items.ts:56`; `apps/web/messages/es.json:1114`, `:1115`, `:1116`).

Si hay sesión iniciada, el menú añade el acceso a las **suites** que le tocan a ese usuario y, debajo, las entradas de cuenta: **Seguridad y mis datos** para cualquier rol de back-office, **Usuarios** y **Roles** solo para el dueño, y **Cerrar sesión** (`apps/web/src/lib/wallet-menu-items.ts:64`, `:70`, `:72`, `:76`; `apps/web/messages/es.json:1118`, `:1119`, `:1120`). Los accesos a suites salen del encabezado **Tus suites** (`apps/web/src/components/wallet/WalletMenu.tsx:286`; `apps/web/messages/es.json:1133`).

Qué suites ve cada uno está fijado: el **dueño** (rol `DEFAULT_ADMIN_ROLE`) las cuatro; **recepción** (`RECEPTION_ROLE`), Front Office; **housekeeping** y **mantenimiento**, su propia ruta; y los roles de back-office sin suite propia (minter, pauser, burner, tesorería) entran por **Administración** (`apps/web/src/lib/suite-access.ts:9`, `:40`, `:43`, `:48`, `:54`).

Sin sesión, el menú ofrece **Iniciar sesión** y nada más de navegación: los accesos a suites exigen sesión válida (`apps/web/src/lib/wallet-menu-items.ts:77`, `:79`; `apps/web/messages/es.json:1121`).

El menú **solo pinta accesos**. No cambia nada en la cadena ni en la base: la seguridad de verdad se comprueba en el servidor en cada petición (`apps/web/src/lib/wallet-menu-items.ts:6`; `apps/web/src/lib/suite-access.ts:5`).

Al pie del panel puede aparecer el botón del **grifo de pruebas** (`apps/web/src/components/wallet/WalletMenu.tsx:302`). Se autogestiona: si no hay faucet configurado o la cartera no está lista en la red, no se pinta (`apps/web/src/components/wallet/FaucetButton.tsx:32`).

## Recorrido real

1. El visitante abre cualquier página del sitio. Arriba, a la derecha, está el botón del menú (`apps/web/src/components/layout/SiteHeader.tsx:168`).
2. Mira el punto de color: si está encendido, hay cartera conectada (`apps/web/src/components/wallet/WalletMenu.tsx:210`).
3. Pulsa el botón. El panel se despliega pegado a él (`apps/web/src/components/wallet/WalletMenu.tsx:245`).
4. Arriba del panel, el encabezado dice **Billetera** si no hay sesión, o **Sesión** si la hay (`apps/web/src/components/wallet/WalletMenu.tsx:248`; `apps/web/messages/es.json:1113`).
5. Sin cartera conectada y con carteras detectadas, aparece la lista **Elige tu billetera**, una entrada por cartera con su nombre e icono (`apps/web/src/components/wallet/WalletMenu.tsx:252`; `apps/web/src/components/wallet/WalletChooser.tsx:27`, `:44`).
6. Elige una. La extensión pide permiso y el menú se cierra. La conexión la gestiona el onboarding de web3 (`apps/web/src/components/wallet/WalletMenu.tsx:255`; `apps/web/src/components/wallet/useOnboarding.ts:86`).
7. Con la cartera conectada y en la red correcta, la acción de cartera es **Desconectar wallet** (`apps/web/src/lib/wallet-menu-items.ts:59`).
8. Si la cartera está en **otra red**, la única acción de cartera es **Cambiar de red** (`apps/web/src/lib/wallet-menu-items.ts:56`, `:57`).
9. Al pulsar **Cambiar de red**, el sistema intenta añadir la red a la cartera y cambiar a ella, con un solo diálogo por red nueva (`apps/web/src/components/wallet/useOnboarding.ts:99`, `:111`; `apps/web/messages/es.json:250`).
10. Con sesión iniciada, el título pasa a ser el **usuario** y a su lado sale una insignia con el rol, del estilo `OWNER` o `RECEPCIÓN` (`apps/web/src/components/wallet/WalletMenu.tsx:181`, `:215`; `apps/web/messages/es.json:1122`).
11. Debajo del encabezado aparece **Tus suites** y las entradas de navegación que correspondan a ese rol (`apps/web/src/components/wallet/WalletMenu.tsx:286`).
12. En un panel de personal, el mismo menú se usa en la barra lateral con el nombre de usuario completo (`apps/web/src/components/admin/AdminLayout.tsx:272`; `apps/web/src/components/wallet/WalletMenu.tsx:81`).
13. Si el dueño entra, al final del grupo aparecen **Usuarios** y **Roles** (`apps/web/src/lib/wallet-menu-items.ts:72`, `:73`).
14. Al elegir una entrada, el panel se cierra y se navega a la pantalla (`apps/web/src/components/wallet/WalletMenu.tsx:268`).
15. Para cerrar la sesión, pulsa **Cerrar sesión**: se cierra en el servidor y la página se refresca (`apps/web/src/components/wallet/WalletMenu.tsx:165`, `:167`).
16. Con el panel abierto, el foco va al primer elemento (`apps/web/src/components/wallet/WalletMenu.tsx:142`).
17. Pulsa **Escape** y el panel se cierra; el foco vuelve al botón (`apps/web/src/components/wallet/WalletMenu.tsx:144`, `:146`).
18. También se cierra si pulsas fuera, en la zona oscurecida (`apps/web/src/components/wallet/WalletMenu.tsx:228`, `:232`).

## Piezas de código implicadas

- Dónde vive el menú en la web pública: `apps/web/src/components/layout/SiteHeader.tsx:88`, `:93`, `:168`, `:169`.
- Uso del menú en el panel de personal, en la barra lateral: `apps/web/src/components/admin/AdminLayout.tsx:272`.
- Componente del menú (título, insignia, panel, foco, cierre): `apps/web/src/components/wallet/WalletMenu.tsx:84`, `:139`, `:153`, `:165`, `:171`, `:181`, `:198`, `:210`, `:215`, `:225`, `:248`, `:252`, `:261`, `:286`, `:302`.
- Reglas de qué ofrece el menú (función pura): `apps/web/src/lib/wallet-menu-items.ts:15`, `:29`, `:52`, `:56`, `:64`, `:70`, `:72`, `:79`.
- Qué suites ve cada rol: `apps/web/src/lib/suite-access.ts:9`, `:40`, `:43`, `:48`, `:54`.
- Conectar, cambiar de red y desconectar: `apps/web/src/components/wallet/useOnboarding.ts:67`, `:86`, `:99`, `:111`, `:119`.
- Lista de carteras detectadas: `apps/web/src/components/wallet/WalletChooser.tsx:16`, `:24`, `:27`, `:44`; descubrimiento en `apps/web/src/lib/wallet-connectors.ts`.
- Botón del grifo de pruebas al pie del menú: `apps/web/src/components/wallet/FaucetButton.tsx:25`, `:32`.
- Red canónica y direcciones: `apps/web/src/config/chain.ts:50`, `:80`.
- Sesión del back-office (usuario, roles, dueño): `apps/web/src/components/admin/useAdminSession.ts:22`, `:26`, `:30`.
- Textos del menú: `apps/web/messages/es.json:1108`, `:1109`, `:1112`, `:1113`, `:1118`, `:1121`, `:1122`, `:1133`.

## Datos y estados

- **Sin sesión y sin cartera.** Título «Wallet no conectada»; acción **Conectar wallet**; entrada **Iniciar sesión** (`apps/web/src/components/wallet/WalletMenu.tsx:185`; `apps/web/src/lib/wallet-menu-items.ts:61`, `:79`).
- **Sin sesión y con cartera conectada.** Título con la dirección acortada tipo `0x1234…abcd` y la acción de cartera según la red (`apps/web/src/components/wallet/WalletMenu.tsx:40`, `:183`).
- **Cartera en la red equivocada.** Punto de estado encendido y única acción **Cambiar de red** (`apps/web/src/lib/wallet-menu-items.ts:56`; `apps/web/src/components/wallet/useOnboarding.ts:67`).
- **Cartera en la red correcta.** Acción **Desconectar wallet** (`apps/web/src/lib/wallet-menu-items.ts:58`).
- **Con sesión.** Título = usuario; insignia de rol; entradas **Tus suites**, **Seguridad y mis datos** y **Cerrar sesión** (`apps/web/src/lib/wallet-menu-items.ts:64`, `:70`, `:76`).
- **Dueño.** Además, **Usuarios** (`/admin/sistemas/usuarios`) y **Roles** (`/admin/roles`) (`apps/web/src/lib/wallet-menu-items.ts:72`, `:73`).
- **Suites y sus rutas.** Administración `/admin`, Front Office `/recepcion`, Housekeeping `/housekeeping`, Mantenimiento `/mantenimiento` (`apps/web/src/lib/suite-access.ts:26`, `:27`, `:28`, `:29`).
- **Roles que se muestran como insignia.** `DEFAULT_ADMIN_ROLE` → `OWNER`, `RECEPTION_ROLE` → `RECEPCIÓN`, `HOUSEKEEPING` → `LIMPIEZA`, `MAINTENANCE` → `MANTENIMIENTO`, `MINTER_ROLE` → `MINTER`, `PAUSER_ROLE` → `PAUSER`, `BURNER_ROLE` → `BURNER`, `TREASURER_ROLE` → `TESORERÍA` (`apps/web/src/components/wallet/WalletMenu.tsx:20`, `:28`; `apps/web/messages/es.json:1122`).
- **Red.** Por defecto, la red canónica del proyecto, `chainId 81234` (`apps/web/src/config/chain.ts:50`; `docs/adr/ADR-01-red-y-contrato-canonicos.md:1`).
- **Tamaño del panel.** Ancho fijo de 256 px y separación mínima de 8 px contra los bordes de la ventana (`apps/web/src/components/wallet/WalletMenu.tsx:67`, `:68`).
- **Accesibilidad.** El botón declara `aria-expanded` y `aria-controls`; el panel es `role="menu"` y cada entrada `role="menuitem"` (`apps/web/src/components/wallet/WalletMenu.tsx:202`, `:238`, `:267`).

## Casos límite y errores

- **No hay cartera instalada.** La lista de carteras no aparece y el menú deja la acción **Conectar wallet**, que no puede completarse. Sin cartera, la web avisa aparte con «No detectamos una wallet web3.» y un enlace para instalar MetaMask (`apps/web/src/components/wallet/WalletChooser.tsx:24`; `apps/web/messages/es.json:244`, `:245`).
- **El usuario cierra el aviso de la cartera.** No hay conexión: se vuelve a pulsar **Conectar wallet** (`apps/web/src/components/wallet/useOnboarding.ts:94`).
- **La cartera no conoce la red.** Al cambiar de red puede salir `4902`. El aviso guía: «Tu wallet aún no tiene esta red. Aprueba añadirla cuando MetaMask te lo pida y vuelve a intentarlo.» (`apps/web/messages/es.json:253`).
- **El usuario cancela el cambio de red.** Mensaje «Has cancelado el cambio de red. Para reservar, cambia a la red de la aplicación.» (`apps/web/messages/es.json:254`).
- **El cambio de red falla.** Mensaje «No se pudo cambiar de red. Cámbiala manualmente en tu wallet a la red de la aplicación e inténtalo de nuevo.» (`apps/web/messages/es.json:255`).
- **No veo Desconectar.** Con la cartera en otra red, la acción es cambiarla; desconectar solo se ofrece ya en la red correcta (`apps/web/src/lib/wallet-menu-items.ts:56`, `:58`).
- **No veo Usuarios ni Roles.** Es lo normal: son del dueño (`apps/web/src/lib/wallet-menu-items.ts:71`; `docs/Manuales/05-casos-de-uso/09-back-office-y-gobierno-v3/CU-40-menu-wallet.md:95`).
- **La sesión caduca.** El menú deja de mostrar las suites: al renovarse el token o cerrarse la sesión, el panel vuelve al estado de visitante (`apps/web/src/components/admin/useAdminSession.ts:44`).
- **El usuario elige cerrar sesión y la red falla.** El cierre de sesión se completa igualmente en el navegador y la página se refresca (`apps/web/src/components/wallet/WalletMenu.tsx:165`, `:168`).
- **El botón del grifo no sale.** No pasa nada: falta configuración del faucet, o la cartera no está conectada en la red correcta (`apps/web/src/components/wallet/FaucetButton.tsx:32`).
- **El menú decide sobre permisos.** No: solo pinta atajos. Cada suite vuelve a exigir su rol en el servidor (`apps/web/src/lib/suite-access.ts:5`).
- **El panel queda recortado en la barra lateral.** Por eso el panel se ancla a la ventana en esa variante, midiendo sobre el botón (`apps/web/src/components/wallet/WalletMenu.tsx:76`, `:108`).

## Referencias

- **CU-40** · El menú de la cartera y del usuario (`docs/Manuales/05-casos-de-uso/09-back-office-y-gobierno-v3/CU-40-menu-wallet.md:1`).
- Decisión **D-77** · Con sesión, el menú ofrece el acceso a las otras suites que corresponden al tipo de usuario (`apps/web/src/lib/wallet-menu-items.ts:8`).
- Decisión **D-76** · La suite pública es el home del proyecto y la cabecera conoce la sesión (`apps/web/src/components/layout/SiteHeader.tsx:91`).
- **ADR-01** · Red canónica local y contrato único (`docs/adr/ADR-01-red-y-contrato-canonicos.md:1`).
- **ADR-04** · Autenticación con contraseña, TOTP y JWT: de dónde sale la sesión que el menú muestra (`docs/adr/ADR-04-autenticacion-password-totp-jwt.md:1`).
- **CU-17** · Conectar la cartera y ponerse en la red correcta (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-17-onboarding-web3.md:1`).
- **CU-46** · Proteger la cuenta del que manda: la pantalla a la que lleva **Seguridad y mis datos** (`docs/Manuales/05-casos-de-uso/09-back-office-y-gobierno-v3/CU-46-seguridad-operador.md:1`).
- Fuente de los pasos y del reparto de accesos: `RepoTecnico/incremento_v3/casos_uso_incremento.md:17` (citada en `RepoTecnico/Manuales/05-casos-de-uso/00-BRIEF-equipo-manuales.md:57`).
