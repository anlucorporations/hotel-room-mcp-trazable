# Requerimientos · Incremento v3 (MVP de administrador: menú de wallet + Sistemas)

> **Proyecto**: Hotel Marina del Sol (`hotel-room-mcp-trazable-DSH`)
> **Base**: incremento v2 desplegado en GCP. Este documento captura el incremento pedido por el
> responsable el 2026-09-26 y las decisiones de la entrevista de arranque.
> **Regla**: no se cambia el contrato canónico `HotelNights`; todas las acciones de gobernanza usan
> el contrato ya desplegado.

---

## 1. Decisiones de la entrevista (cerradas)

| ID | Decisión | Valor elegido |
|---|---|---|
| D-40 | Ubicación del menú desplegable | En el **back-office** y en la **cabecera pública** (mismo componente). |
| D-41 | Contenido del menú | Título (usuario + rol o wallet), wallet, **Seguridad/Mis datos**, **Usuarios**, **Roles** y **Salir**. |
| D-42 | Alcance de «Sistemas» | **Contratos + Usuarios + Finanzas + Operaciones**, solo para el owner. |
| D-43 | Gestión de usuarios | Listar, **crear/rotar credenciales** (contraseña + TOTP entregados una sola vez) y activar/desactivar. |
| D-44 | Nivel de acción | Contratos y Finanzas **con acciones**: gobernanza (roles/pausa/suelo) y **retirada** dentro de Sistemas. |
| D-45 | Seguridad propia | El operador autenticado puede **rotar su MFA** y **cambiar su contraseña** desde Seguridad. |

---

## 2. Requerimientos funcionales (RF)

### 2.1 Menú desplegable de la billetera/usuario

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-40 | El sistema deberá ofrecer un **menú desplegable** con el estado de la billetera conectada, presente en el back-office y en la cabecera pública. | Alta |
| RF-40.1 | En el back-office, el título del menú deberá mostrar **usuario + rol** de la sesión; en el sitio público, la **dirección de wallet** (o la acción de conectar). | Alta |
| RF-40.2 | El menú deberá dar acceso a **Seguridad/Mis datos**, **Usuarios**, **Roles** y **Salir** cuando corresponda, y a las acciones de wallet (cambiar red, desconectar, faucet). | Alta |
| RF-40.3 | El menú deberá ser accesible por teclado: `aria-expanded`, cierre con `Escape`, foco al primer elemento al abrir y retorno del foco al botón al cerrar. | Alta |

### 2.2 Sección «Sistemas» (solo owner)

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-41 | El sistema deberá exponer una sección **Sistemas** visible y accesible **solo** para la sesión con `DEFAULT_ADMIN_ROLE` (owner), con las subsecciones Contratos, Usuarios, Finanzas y Operaciones. | Alta |
| RF-41.1 | Ocultar Sistemas en la UI **no** es la seguridad: cada ruta y API de Sistemas deberá exigir `DEFAULT_ADMIN_ROLE` en el servidor. | Alta |
| RF-42 | **Usuarios**: listar los operadores (`username`, rol, activo, bloqueo, última actualización), **crear o rotar** credenciales (contraseña + TOTP + códigos de rescate mostrados **una sola vez**) y **activar/desactivar**. | Alta |
| RF-42.1 | El listado **nunca** deberá devolver `password_hash` ni `totp_secret_enc`. | Alta |
| RF-43 | **Contratos**: mostrar el estado on-chain (dirección, chainId, bloque de despliegue, pausa, tesorería, suelo de listado, propiedad) y permitir las **acciones de gobernanza** (conceder/revocar roles, pausar/reanudar, fijar suelo de listado), reutilizando los componentes existentes. | Alta |
| RF-44 | **Finanzas**: mostrar balance bruto del contrato, residual retirable y pendiente de reventas, y permitir la **retirada** a tesorería; incluir el resumen de agregados (volumen primario/secundario, royalties, ventas). | Alta |
| RF-45 | **Operaciones**: mostrar la salud del worker (bloque al día, `lag`, `aggregateLag`, fallos consecutivos, degradaciones de correo/proceso), el estado de la cadena/contrato y el último checkpoint de indexación. | Media |
| RF-46 | **Seguridad/Mis datos**: el operador autenticado puede **rotar su MFA** (nueva semilla TOTP + códigos de rescate, mostrados una sola vez) y **cambiar su contraseña** (exigiendo la actual). | Alta |

---

## 3. Requerimientos no funcionales (RNF)

| ID | Requerimiento | Métrica / criterio |
|---|---|---|
| RNF-40 | **Autorización en servidor**: toda ruta/API de Sistemas exige `DEFAULT_ADMIN_ROLE`; sin sesión → 401, con rol insuficiente → 403. | Probado con la suite de rutas. |
| RNF-41 | **Sin fuga de secretos**: ninguna respuesta incluye `password_hash` ni `totp_secret_enc`; las credenciales en claro se devuelven **una única vez** al crearlas/rotarlas. | Test de contrato de la API. |
| RNF-42 | **Accesibilidad WCAG 2.1 AA**: el desplegable usa roles/atributos ARIA correctos y la paleta del proyecto; contraste ≥ 4.5:1. | Suite `lib/a11y`. |
| RNF-43 | **i18n**: textos nuevos en ES/EN/RU. | Claves en los 3 `messages/*.json`. |
| RNF-44 | **Regresión**: `pnpm typecheck`, suites y `next build` en verde. | CI local. |
| RNF-45 | **Sin PII nueva**: no se añaden columnas ni pantallas con datos personales del huésped. | Revisión + guardianes. |
| RNF-46 | **Artefactos de datos sincronizados**: `diccionario_datos.md`, `diagrama_er.md` y `base_datos.sql` describen el mismo esquema. | Revisión cruzada. |

---

## 4. Trazabilidad RF → Casos de uso → Módulos

| RF | Caso de uso | Hito |
|---|---|---|
| RF-40, RF-40.1..3 | CU-40 | H1 · `WalletMenu` |
| RF-41, RF-41.1 | CU-41 | H2 · `adminNav`, `app/admin/sistemas/*` |
| RF-42, RF-42.1 | CU-42 | H3 · `UsersRepository.listAll`, `/api/admin/system/users`, `SystemUsers` |
| RF-43 | CU-43 | H4 · `SystemContracts` + `AdminRoles`/`AdminPause` |
| RF-44 | CU-44 | H4 · `SystemFinances` + `AdminFunds` |
| RF-45 | CU-45 | H5 · `SystemOperations` + `/api/admin/system/operations` |
| RF-46 | CU-46 | H6 · `/api/auth/password`, `AdminSecurity`, `mfa/setup` |

---

## 5. Fuera de alcance

- Registro/actualización de la dirección del contrato desde la UI (se mantiene el registro de despliegue).
- Edición del **rol** de un operador existente (solo alta definiendo rol y baja lógica).
- Borrado físico de operadores (solo `active = false`).
- Multi-hotel / multi-propiedad y datos personales de huéspedes.

---

## 6. Preguntas resueltas en la entrevista

1. ¿Dónde vive el desplegable? → **Back-office y cabecera pública** (D-40).
2. ¿Qué contiene? → **usuario+rol, wallet, Seguridad, Usuarios, Roles, Salir** (D-41).
3. ¿Qué subsecciones tiene Sistemas? → **Contratos + Usuarios + Finanzas + Operaciones** (D-42).
4. ¿Qué operaciones de usuarios? → **listar, crear/rotar, activar/desactivar** (D-43).
5. ¿Contratos/Finanzas con acciones? → **sí, gobernanza y retirada dentro de Sistemas** (D-44).
6. ¿Seguridad propia? → **rotar MFA y cambiar contraseña** (D-45, confirmado por el alcance del menú).
