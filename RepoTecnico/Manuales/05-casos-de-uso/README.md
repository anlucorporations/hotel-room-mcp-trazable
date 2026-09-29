# Manuales por caso de uso — versión técnica

> Fuente de cada manual: **el código real del monorepo** (referencias `ruta:línea`).
> El orden es el de **iniciación del sistema**, no el alfabético: primero se dan los permisos,
> luego se publica inventario, después llegan los clientes y al final la operación y el gobierno.
> Reglas, plantilla y catálogo completo: [`00-BRIEF-equipo-manuales.md`](00-BRIEF-equipo-manuales.md).

Son **32 casos de uso** en 9 bloques. No existe CU-03: el antiguo faucet se reclasificó como CU-PR-01.

### Bloque 1 · Iniciación y aprovisionamiento

_Antes de vender nada: quién manda, cómo entra y cuánto se queda el hotel._

| Caso de uso |
|---|
| [CU-16 · Dar de alta a quien puede tocar el sistema (roles y propiedad) — Manual técnico](01-iniciacion/CU-16-roles.md) |
| [CU-01 · Entrar al panel del hotel con la cartera y el rol correcto — Manual técnico](01-iniciacion/CU-01-acceso-back-office.md) |
| [CU-12 · Decidir cuánto se queda el hotel en cada reventa — Manual técnico](01-iniciacion/CU-12-royalty.md) |

### Bloque 2 · Inventario

_Poner las noches a la venta._

| Caso de uso |
|---|
| [CU-02 · Poner una noche a la venta (crear la ficha digital) — Manual técnico](02-inventario/CU-02-mintear-noche.md) |

### Bloque 3 · Onboarding y descubrimiento

_Entrar, mirar, buscar y entender la oferta._

| Caso de uso |
|---|
| [CU-17 · Conectar la cartera y ponerse en la red correcta — Manual técnico](03-onboarding-y-descubrimiento/CU-17-onboarding-web3.md) |
| [CU-04 · Ver y filtrar las noches disponibles — Manual técnico](03-onboarding-y-descubrimiento/CU-04-catalogo.md) |
| [CU-09 · Mirar el histórico público de ventas — Manual técnico](03-onboarding-y-descubrimiento/CU-09-historico.md) |
| [CU-08 · Pedirle una noche al asistente y que prepare la compra — Manual técnico](03-onboarding-y-descubrimiento/CU-08-asistente-ia.md) |

### Bloque 4 · Ventas

_Comprar, revender y comprar de nuevo._

| Caso de uso |
|---|
| [CU-05 · Comprar una noche al hotel — Manual técnico](04-ventas/CU-05-compra-primaria.md) |
| [CU-06 · Poner mi noche en reventa (y quitarla) — Manual técnico](04-ventas/CU-06-listar-reventa.md) |
| [CU-07 · Comprar una noche que otro cliente revende — Manual técnico](04-ventas/CU-07-compra-secundaria.md) |

### Bloque 5 · Postventa y observabilidad

_Avisos automáticos y métricas._

| Caso de uso |
|---|
| [CU-10 · Avisar al hotel por email cada vez que hay una venta — Manual técnico](05-postventa/CU-10-aviso-email.md) |
| [CU-11 · Ver las métricas del negocio en el panel — Manual técnico](05-postventa/CU-11-dashboard.md) |

### Bloque 6 · Operación y ciclo de vida

_Caducar, cobrar y parar en emergencia._

| Caso de uso |
|---|
| [CU-13 · Retirar las noches del hotel que ya han caducado — Manual técnico](06-operacion-y-ciclo-de-vida/CU-13-caducadas.md) |
| [CU-15 · Pasar el dinero recaudado a la cuenta del hotel — Manual técnico](06-operacion-y-ciclo-de-vida/CU-15-retirar-fondos.md) |
| [CU-14 · Parar el sistema en una emergencia y volver a arrancarlo — Manual técnico](06-operacion-y-ciclo-de-vida/CU-14-pausa.md) |

### Bloque 7 · Entorno de pruebas

_Dinero de prueba; nunca en producción._

| Caso de uso |
|---|
| [CU-PR-01 · Conseguir dinero de prueba (solo en pruebas) — Manual técnico](07-entorno-de-pruebas/CU-PR-01-faucet.md) |

### Bloque 8 · Operación hotelera (incremento v2)

_Recepción y estancia: el día a día del mostrador._

| Caso de uso |
|---|
| [CU-30 · Que el dueño lo vea y lo pueda todo — Manual técnico](08-operacion-hotelera-v2/CU-30-acceso-owner.md) |
| [CU-31 · La pantalla del día en recepción — Manual técnico](08-operacion-hotelera-v2/CU-31-panel-dia-recepcion.md) |
| [CU-32 · Encontrar una reserva con el código de recuperación — Manual técnico](08-operacion-hotelera-v2/CU-32-buscar-reserva.md) |
| [CU-33 · Dar entrada al cliente escaneando su resguardo — Manual técnico](08-operacion-hotelera-v2/CU-33-checkin-qr.md) |
| [CU-34 · Dar salida y cerrar la cuenta de la habitación — Manual técnico](08-operacion-hotelera-v2/CU-34-checkout.md) |
| [CU-35 · Apuntar los extras del huésped (minibar, desayuno…) — Manual técnico](08-operacion-hotelera-v2/CU-35-cargos-adicionales.md) |
| [CU-36 · Que el huésped publique, cambie o retire su reventa — Manual técnico](08-operacion-hotelera-v2/CU-36-reventa-huesped.md) |
| [CU-37 · Avisar al huésped cuando su reventa se mueve — Manual técnico](08-operacion-hotelera-v2/CU-37-avisos-reventa.md) |

### Bloque 9 · Back-office y gobierno (incremento v3)

_Panel del dueño, usuarios, contrato y finanzas._

| Caso de uso |
|---|
| [CU-40 · El menú de la cartera y del usuario — Manual técnico](09-back-office-y-gobierno-v3/CU-40-menu-wallet.md) |
| [CU-41 · La sección «Sistemas» (solo para el dueño) — Manual técnico](09-back-office-y-gobierno-v3/CU-41-seccion-sistemas.md) |
| [CU-42 · Dar de alta, cambiar y quitar usuarios de la plataforma — Manual técnico](09-back-office-y-gobierno-v3/CU-42-gestion-usuarios.md) |
| [CU-43 · Gobernar el contrato (pausar, roles, royalty, propiedad) — Manual técnico](09-back-office-y-gobierno-v3/CU-43-gobernar-contrato.md) |
| [CU-44 · Ver las finanzas del hotel y retirar el dinero — Manual técnico](09-back-office-y-gobierno-v3/CU-44-finanzas-retirar.md) |
| [CU-45 · Ver qué está pasando ahora mismo (operaciones) — Manual técnico](09-back-office-y-gobierno-v3/CU-45-operaciones.md) |
| [CU-46 · Proteger la cuenta del que manda — Manual técnico](09-back-office-y-gobierno-v3/CU-46-seguridad-operador.md) |

---

*Manuales técnicos · Hotel Marina del Sol · 32 casos de uso en 9 bloques.*
