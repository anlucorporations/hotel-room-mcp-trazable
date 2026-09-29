# Manuales por caso de uso — versión para leer

> Estos manuales son la **fuente de la sección de Ayuda (`/ayuda`) de la web**:
> `apps/web/scripts/build-manuals.mjs` los convierte en el módulo `manuals.generated.ts`, en HTML
> imprimible y en PDF. **No se editan en la web**: se editan aquí y se regenera con
> `pnpm build:manuals`.
>
> Lenguaje llano, para todo el público. El orden es el de **iniciación del sistema** (bloques 1 → 9).
> Versión técnica de cada uno:
> [`RepoTecnico/Manuales/05-casos-de-uso/`](../../../RepoTecnico/Manuales/05-casos-de-uso/README.md).

Son **32 manuales** en 9 bloques, más la infografía del mapa de iniciación
([`doc-mapa-iniciacion-sistema.svg`](../../imagenes/doc-mapa-iniciacion-sistema.svg)).

### Bloque 1 · Iniciación y aprovisionamiento

_Antes de vender nada: quién manda, cómo entra y cuánto se queda el hotel._

| Caso de uso |
|---|
| [CU-16 · Dar de alta a quien puede tocar el sistema (roles y propiedad)](01-iniciacion/CU-16-roles.md) |
| [CU-01 · Entrar al panel del hotel con la cartera y el rol correcto](01-iniciacion/CU-01-acceso-back-office.md) |
| [CU-12 · Decidir cuánto se queda el hotel en cada reventa](01-iniciacion/CU-12-royalty.md) |

### Bloque 2 · Inventario

_Poner las noches a la venta._

| Caso de uso |
|---|
| [CU-02 · Poner una noche a la venta (crear la ficha digital)](02-inventario/CU-02-mintear-noche.md) |

### Bloque 3 · Onboarding y descubrimiento

_Entrar, mirar, buscar y entender la oferta._

| Caso de uso |
|---|
| [CU-17 · Conectar la cartera y ponerse en la red correcta](03-onboarding-y-descubrimiento/CU-17-onboarding-web3.md) |
| [CU-04 · Ver y filtrar las noches disponibles](03-onboarding-y-descubrimiento/CU-04-catalogo.md) |
| [CU-09 · Mirar el histórico público de ventas](03-onboarding-y-descubrimiento/CU-09-historico.md) |
| [CU-08 · Pedirle una noche al asistente y que prepare la compra](03-onboarding-y-descubrimiento/CU-08-asistente-ia.md) |

### Bloque 4 · Ventas

_Comprar, revender y comprar de nuevo._

| Caso de uso |
|---|
| [CU-05 · Comprar una noche al hotel](04-ventas/CU-05-compra-primaria.md) |
| [CU-06 · Poner mi noche en reventa (y quitarla)](04-ventas/CU-06-listar-reventa.md) |
| [CU-07 · Comprar una noche que otro cliente revende](04-ventas/CU-07-compra-secundaria.md) |

### Bloque 5 · Postventa y observabilidad

_Avisos automáticos y métricas._

| Caso de uso |
|---|
| [CU-10 · Avisar al hotel por email cada vez que hay una venta](05-postventa/CU-10-aviso-email.md) |
| [CU-11 · Ver las métricas del negocio en el panel](05-postventa/CU-11-dashboard.md) |

### Bloque 6 · Operación y ciclo de vida

_Caducar, cobrar y parar en emergencia._

| Caso de uso |
|---|
| [CU-13 · Retirar las noches del hotel que ya han caducado](06-operacion-y-ciclo-de-vida/CU-13-caducadas.md) |
| [CU-15 · Pasar el dinero recaudado a la cuenta del hotel](06-operacion-y-ciclo-de-vida/CU-15-retirar-fondos.md) |
| [CU-14 · Parar el sistema en una emergencia y volver a arrancarlo](06-operacion-y-ciclo-de-vida/CU-14-pausa.md) |

### Bloque 7 · Entorno de pruebas

_Dinero de prueba; nunca en producción._

| Caso de uso |
|---|
| [CU-PR-01 · Conseguir dinero de prueba (solo en pruebas)](07-entorno-de-pruebas/CU-PR-01-faucet.md) |

### Bloque 8 · Operación hotelera (incremento v2)

_Recepción y estancia: el día a día del mostrador._

| Caso de uso |
|---|
| [CU-30 · Que el dueño lo vea y lo pueda todo](08-operacion-hotelera-v2/CU-30-acceso-owner.md) |
| [CU-31 · La pantalla del día en recepción](08-operacion-hotelera-v2/CU-31-panel-dia-recepcion.md) |
| [CU-32 · Encontrar una reserva con el código de recuperación](08-operacion-hotelera-v2/CU-32-buscar-reserva.md) |
| [CU-33 · Dar entrada al cliente escaneando su resguardo](08-operacion-hotelera-v2/CU-33-checkin-qr.md) |
| [CU-34 · Dar salida y cerrar la cuenta de la habitación](08-operacion-hotelera-v2/CU-34-checkout.md) |
| [CU-35 · Apuntar los extras del huésped (minibar, desayuno…)](08-operacion-hotelera-v2/CU-35-cargos-adicionales.md) |
| [CU-36 · Que el huésped publique, cambie o retire su reventa](08-operacion-hotelera-v2/CU-36-reventa-huesped.md) |
| [CU-37 · Avisar al huésped cuando su reventa se mueve](08-operacion-hotelera-v2/CU-37-avisos-reventa.md) |

### Bloque 9 · Back-office y gobierno (incremento v3)

_Panel del dueño, usuarios, contrato y finanzas._

| Caso de uso |
|---|
| [CU-40 · El menú de la cartera y del usuario](09-back-office-y-gobierno-v3/CU-40-menu-wallet.md) |
| [CU-41 · La sección «Sistemas» (solo para el dueño)](09-back-office-y-gobierno-v3/CU-41-seccion-sistemas.md) |
| [CU-42 · Dar de alta, cambiar y quitar usuarios de la plataforma](09-back-office-y-gobierno-v3/CU-42-gestion-usuarios.md) |
| [CU-43 · Gobernar el contrato (pausar, roles, royalty, propiedad)](09-back-office-y-gobierno-v3/CU-43-gobernar-contrato.md) |
| [CU-44 · Ver las finanzas del hotel y retirar el dinero](09-back-office-y-gobierno-v3/CU-44-finanzas-retirar.md) |
| [CU-45 · Ver qué está pasando ahora mismo (operaciones)](09-back-office-y-gobierno-v3/CU-45-operaciones.md) |
| [CU-46 · Proteger la cuenta del que manda](09-back-office-y-gobierno-v3/CU-46-seguridad-operador.md) |

---

*Manuales literales · Hotel Marina del Sol · 32 casos de uso en 9 bloques.*
