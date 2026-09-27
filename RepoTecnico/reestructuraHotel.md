modifiquemos el proyecto para:

1. la suite de Administracion: debe ser un dashboard administratito donde se muestre la barra de navegacion a la derecha con menu tipo acordeon, las secciones principales son:

1.1. Habitacion: posee todas las sub secciones reacionadas a la configuracion, mantenimiento, estatus, etc. se encarga principalmente de gestionar la Habitacion como un ente.

1.2. Recepcion: agrupa todas las sub secciones relacionadas a las Oferta de Publicaciones de las habitaciones, reservas por confirmar, disponibilidad de habitaciones, Cancelaciones y modificaciones.

1.3. Actividades: agrupa las sub funciones relacionadas a la gestion y administracion de las actividades que ofrese el hotel para los huespedes.

1.4. Housekeeping: alberga todas las funciones Fundamental para la rotación rápida de habitaciones sin desorden operativo:
1.4.1. Gestión del Estado de Habitaciones: Tablero de estados en tiempo real (Limpia, Sucia, En Mantenimiento, Ocupada). El estado cambia automáticamente tras el check-out o check-in; el personal de limpieza actualiza el estado desde su móvil con un clic. Asignación de turnos y cargas de trabajo: Distribución automática de habitaciones a limpiar por mucama/camarera al inicio de la jornada según la ocupación.
1.4.2. Lencería y Suministros: Control de insumos básicos (jabón, papel, toallas, sábanas), Descuento automático de stock de consumibles por cada habitación limpiada o huésped registrado. Notificación de reposiciones o faltantes: Alerta automática en el panel de compras cuando el inventario baja de un umbral crítico.

1.5 Administración: es El cerebro financiero del negocio que alberga las sub secciones de Finanzas y Contabilidad (para la tercera version).
1.5.1. Facturación y Cobranzas: agrupa las funciones para Emisión de comprobantes y facturas, Generación en PDF de facturas/recibos fiscales con datos del huésped y desglose de impuestos con un solo botón.
1.5.2. métodos de pago (efectivo, transferencias, tarjetas): Conciliación de montos pagados vs. saldo pendiente en el folio del huésped.
1.5.3. Caja Chica: alberga las funciones de Cierres de Turno, Apertura, arqueo y cierre de caja por turno, Cálculo automático de diferencias entre cobros registrados por el sistema y el dinero en caja reportado por el recepcionista.

1.6. Mantenimiento y Servicios Técnicos: alberga las funciones para Garantizar la operatividad física de las instalaciones en un hotel 2 estrellas (donde los fallos de aire/calefacción, plomería o Wi-Fi impactan directamente las reseñas).
1.6.1. Incidencias y Mantenimiento: escencialmente Reporte de averías (plomería, electricidad, cerraduras), Módulo donde recepción o limpieza reporta la falla; la habitación se bloquea automáticamente en el sistema de ventas para evitar sobreventa de cuartos averiados., Cierre y verificación de tickets técnicos que  Al marcar el ticket como "Resuelto", la habitación vuelve a estado disponible de forma automática.
1.6.2. Mantenimiento Preventivo: alberga las funciones de Inspecciones periódicas de equipos (bombas de agua, calentadores, A/C), Cronograma de alertas y recordatorios automáticos según periodicidad fija (semanal/mensual).

2. la suite Front Office (Recepción y Reservas): El núcleo de la interacción con el cliente y el control del inventario de habitaciones. se caracteriz por ofrecer un dashboard minimalista con las funciones desplegadas en una barra de navegacion superior. este mvp es manejado escencialmente por el Operador de Recepcion (Tambien el administrador/Owner).

2.1. Motor de Reservas: Captura de reservas directas (Web/WhatsApp), se caracteriza por ser un panel web integrado a la base de datos para observar la dispinibilidad de habitaciones mostrando Tambien los huespedes que se recibiran en ese dia en tiempo real; confirmación automática vía email/Telegam mostrando de forma facil; Gestión de cancelaciones y modificaciones aplicando Reglas de negocio que liberan inventario automáticamente si la reserva se cancela o si vence el tiempo de espera de anticipo.
2.2. Recepción (Check-in / Check-out): alberga todas las funciones para la validacion o consumo de la reserva, entrega de llaves/códigos que Generación automática del estado de cuenta (Folio) y emisión de recibo digital. Si hay cerraduras electrónicas, envío automático del PIN de acceso.
2.2.1. Check - In: (metodo ya descrito en el sistema).
2.2.2. Cierre de cuenta y Check-out: Cálculo automático de consumos pendientes (servicio a la habitacion, consumo de servicios extras, etc), asignacion de cargos extras (danos en la habitacion, sanciones, otros), cambio instantáneo del estado de la habitación a "Sucia/Para Limpieza".

3. la Suite Publica: es la home page que muestra las bondades del hotel, servicios, estilos de habitacions, planes especiales, actividades extras, servicios extas, etc. Es la pagina Publica para que el usuario conosca el hotel y obtenga toda la inmformacion necesaria para hacer la reserva tomando en cuenta lo siguiente:
3.1. la propuesta visual debe ser llamativa y contiene el branding total del hotel.
3.2. debe ser de acceso publico, las recervas de habitaciones se deben realizar conectando la wallet.
3.3. muestra el catalo de ofertas disponibles.
3.4. muestra el acceso al mercado de reventa.
3.5. muestra la clasificacion del hotel, la experiencia de usario y la
