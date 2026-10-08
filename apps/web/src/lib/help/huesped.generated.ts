/**
 * GENERADO por `apps/web/scripts/build-huesped-manuals.mjs` — NO EDITAR A MANO.
 *
 * Regenerar con: `corepack pnpm --filter @hotel/web run huesped`.
 * Última generación: 2026-10-07
 *
 * Fuentes: 17 manuales de caso de docs/Manuales/06-huesped/ (texto escapado).
 */

export interface HuespedSection {
  readonly id: string;
  readonly title: string;
  readonly level: 2 | 3;
  readonly html: string;
}

/** Momento del viaje al que pertenece un caso (unión cerrada: la vigila el generador). */
export type HuespedMomentId = "antes-de-llegar" | "conseguir-tu-noche" | "si-te-sobra-la-noche" | "durante-la-estancia" | "despues" | "cuando-algo-va-mal";

export interface HuespedManual {
  readonly slug: string;
  readonly order: number;
  readonly moment: HuespedMomentId;
  readonly title: string;
  readonly lead: string;
  readonly image: string | null;
  readonly source: string;
  readonly sections: readonly HuespedSection[];
}

/** Agrupación del índice por momento del viaje (rótulos en español, como los manuales). */
export const HUESPED_MOMENTS: readonly { readonly id: HuespedMomentId; readonly label: string }[] = [
  { id: "antes-de-llegar", label: "Antes de llegar" },
  { id: "conseguir-tu-noche", label: "Conseguir tu noche" },
  { id: "si-te-sobra-la-noche", label: "Si te sobra la noche" },
  { id: "durante-la-estancia", label: "Durante la estancia" },
  { id: "despues", label: "Después" },
  { id: "cuando-algo-va-mal", label: "Cuando algo va mal" },
];

/** Imagen de cabecera del índice. */
export const HUESPED_OVERVIEW_IMAGE = "doc-huesped-infografia-casos.svg";

/** Versión imprimible completa (portada + los 17 capítulos). */
export const HUESPED_PRINTABLE = "/manual/manual-huesped.html";

export const HUESPED_MANUALS: readonly HuespedManual[] = [
  {
    slug: "01-que-es-una-noche",
    order: 1,
    moment: "antes-de-llegar",
    title: "Qué es una noche del hotel (y por qué pasa a ser tuya)",
    lead: "<blockquote><p>Para quien se aloja en el Hotel Marina del Sol y quiere entender, sin tecnicismos, qué está comprando cuando reserva una noche por la web. Al terminar sabrás qué es la ficha de una noche, de quién es y cuándo deja de servir.</p></blockquote>",
    image: "doc-huesped-estados-de-una-noche.svg",
    source: "docs/Manuales/06-huesped/01-que-es-una-noche.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Una <strong>noche</strong> es una habitación concreta en una fecha concreta.</li><li>Cada noche del hotel es una <strong>ficha digital</strong> distinta de todas las demás: no hay dos iguales.</li><li>Quien tiene esa ficha, tiene esa noche.</li><li>Cuando la compras, la ficha pasa a tu cartera (tu monedero digital) y desde ese momento es tuya.</li><li>Si al final no la usas, puedes volver a ponerla a la venta para que la compre otro cliente.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<p>Esta parte no tiene botones: es la explicación de lo que verás en pantalla cuando entres al catálogo.</p><ol><li>Abre el catálogo de noches. Verás una tarjeta por cada noche que el hotel tiene a la venta.</li><li>Cada tarjeta te enseña la foto de la habitación, su número («Habitación 102»), el tipo de habitación, la fecha escrita en largo y el precio en ETH (la moneda de esta red).</li><li>En cada tarjeta hay una etiqueta de color:</li></ol><p>- <strong>Disponible</strong>, con un punto verde: la vende el hotel. - <strong>Suite</strong>, en ámbar: es una suite y la vende el hotel. - <strong>Reventa</strong>, en coral: la vende otro cliente, no el hotel.</p><ol><li>Debajo del precio leerás siempre la misma frase: «La noche pasa a ser tuya: podrás revenderla cuando quieras.»</li><li>El hotel tiene 50 habitaciones, numeradas de la 101 a la 130 (planta baja) y de la 201 a la 220 (primera planta).</li><li>Hay tres tipos de habitación: <strong>simple</strong>, <strong>doble</strong> y <strong>suite</strong>. El tipo se sabe por el número de habitación.</li></ol><p class=\"pending\">Pendiente de confirmar con el hotel: el reparto real de tipos por habitación (qué números son simples, dobles y suites)</p><ol><li>El catálogo solo enseña las noches de los próximos <strong>90 días</strong>. Más allá de esa fecha no hay nada que comprar.</li><li>Las fechas se guardan siempre en <strong>UTC</strong> (la hora del meridiano de Greenwich). Gracias a eso, la ficha de una noche es la misma aunque la mires desde otro país.</li><li>Cuando compras, la ficha queda a nombre de tu dirección de cartera. Esa es toda la prueba de que la noche es tuya: no hay un papel aparte.</li><li>En «Mis noches» verás tus fichas con la etiqueta <strong>Tuya</strong> si no están en venta, o <strong>En reventa</strong> si las has puesto a la venta.</li></ol>",
      },
      {
        id: "los-estados-por-los-que-pasa-una-noche",
        title: "Los estados por los que pasa una noche",
        level: 3,
        html: "<p>Una misma noche cambia de estado a lo largo de su vida. Lo que ves tú es siempre uno de estos:</p><ul><li><strong>Disponible</strong>: el hotel la tiene a la venta y nadie la ha comprado todavía.</li><li><strong>Tuya</strong> (en el sistema, «en poder de un cliente»): ya se vendió una vez y su dueño es un cliente.</li><li><strong>En reventa</strong>: su dueño la ha puesto a la venta para que la compre otra persona.</li><li><strong>Expirada</strong>: la fecha ya pasó. Manda siempre: una noche caducada no se puede comprar ni revender, aunque estuviera en venta.</li><li><strong>Retirada</strong>: el hotel la quita cuando caduca sin haberse vendido nunca. Una noche que ya es de un cliente no se retira.</li></ul><p>Este es el recorrido, en dibujo:</p><figure><img src=\"/manual/imagenes/doc-huesped-estados-de-una-noche.svg\" alt=\"Estados por los que pasa una noche del hotel: disponible, tuya, en reventa, expirada y retirada\" loading=\"lazy\" /><figcaption>Estados por los que pasa una noche del hotel: disponible, tuya, en reventa, expirada y retirada</figcaption></figure>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>No encuentras la noche que quieres.</strong> Puede estar a más de 90 días vista: el catálogo no llega más allá de esa ventana.</li><li><strong>Una noche que ayer veías ya no está.</strong> El hotel la ha retirado de la lista porque se vendió. Solo hay una venta por noche, así que cuando alguien la compra desaparece. El catálogo lo dice con honestidad: «Hemos retirado 1 noche que ya está vendida. Estamos sincronizando el calendario: puede aparecer disponibilidad nueva en unos minutos.»</li><li><strong>En la tarjeta pone «Ventas en pausa».</strong> El hotel ha pausado las operaciones y no se pueden comprar noches mientras dure. No es un fallo tuyo ni de tu cartera.</li><li><strong>No carga nada.</strong> Verás «No se pudo cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.» con un botón <strong>Reintentar</strong>. Pulsa Reintentar.</li><li><strong>Todo esto es una red de pruebas.</strong> Hoy la plataforma funciona sobre una red de pruebas: sirve para practicar y ver el sistema entero, pero no es todavía la venta al público del hotel.</li></ul><p>Si el problema no es ninguno de estos, díselo al personal del hotel: no tenemos aquí la causa confirmada.</p>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Qué compro exactamente?</strong> Una habitación y una fecha concretas, no un rango de noches.</li><li><strong>¿Puedo alojarme varias noches seguidas?</strong> Sí, comprando una ficha por cada noche.</li><li><strong>¿Cómo se sabe que la noche es mía?</strong> Porque la ficha figura a nombre de la dirección de mi cartera. No hay más trámite.</li><li><strong>¿Mi noche caduca?</strong> Sí. Cuando pasa la fecha, la noche queda expirada y ya no sirve para alojarse ni para revender.</li><li><strong>¿Puedo revenderla?</strong> Sí, mientras no la hayas usado en recepción. Una noche ya consumida no se puede volver a vender.</li></ul>",
      },
    ],
  },
  {
    slug: "02-preparar-tu-cartera",
    order: 2,
    moment: "antes-de-llegar",
    title: "Prepara tu cartera y ponte en la red del hotel",
    lead: "<blockquote><p>Para quien va a comprar su primera noche y necesita conectar la cartera (su monedero digital) y comprobar que está en la red correcta. Se hace en cinco minutos y no cuesta nada.</p></blockquote>",
    image: null,
    source: "docs/Manuales/06-huesped/02-preparar-tu-cartera.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Abre cualquier página pública de la web del hotel.</li><li>Arriba a la derecha, pulsa el botón del menú de cuenta y billetera.</li><li>Pulsa <strong>Conectar wallet</strong> y acepta el permiso en tu cartera.</li><li>Si la web te dice que estás en la red equivocada, pulsa <strong>Cambiar de red</strong> y acepta. Si tu cartera no conoce esa red, te pedirá añadirla: acepta.</li><li>Comprueba que el punto del botón está encendido y que se lee «Conectado: 0x1234…abcd». Ya puedes reservar.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li><strong>Encuentra el botón.</strong> Está en la cabecera, a la derecha, y aparece en todas las páginas públicas del hotel.</li><li><strong>Mira el punto de color</strong> que lleva al lado. Encendido significa que ya tienes una cartera conectada; apagado, que todavía no.</li><li><strong>Pulsa el botón.</strong> Se abre un panel con el título «Billetera». Si no hay nada conectado, ahí se lee «Wallet no conectada».</li><li><strong>Si tu navegador no tiene ninguna cartera</strong>, verás el aviso «No detectamos una wallet web3.» acompañado de un enlace «Instala MetaMask». Instálala, vuelve a esta página y recárgala.</li><li><strong>Pulsa «Conectar wallet».</strong> Si tu navegador encuentra varias carteras, primero te pide elegir una, bajo el rótulo «Elige tu billetera».</li><li><strong>Acepta el permiso en tu cartera.</strong> Conectar es solo dar permiso para leer tu dirección: no firma nada y no cobra nada. Tampoco te pide ninguna contraseña de la web, porque no hay contraseñas.</li><li><strong>Comprueba que ha funcionado.</strong> La barra muestra «Conectado: 0x1234…abcd» y el menú pasa a ofrecer «Desconectar wallet».</li><li><strong>Revisa la red.</strong> Si estás en otra red, aparece el aviso «Estás en la red equivocada.» con el botón «Cambiar de red». Púlsalo y acepta en tu cartera.</li><li><strong>Si tu cartera no conoce esa red</strong>, te pedirá añadirla. Acéptalo: la web vuelve a intentar el cambio sola y no tienes que escribir nada.</li><li><strong>Si el cambio sale bien</strong>, el aviso desaparece y el punto del botón sigue encendido. Si cancelas, vuelves al punto de partida sin ningún daño.</li><li><strong>Con la cartera conectada y la red correcta</strong>, los botones de las noches dejan de estar bloqueados y se leen «Reservar».</li><li><strong>Si el hotel ha activado el grifo de pruebas</strong>, verás el botón «Conseguir ETH de prueba» para tener saldo de práctica. Solo se puede pedir una vez cada 24 horas.</li></ol><p>Cuatro palabras de esta pantalla, para que no te pierdas:</p><ul><li><strong>Cartera</strong> (o *wallet*): el monedero digital donde se guardan tus fichas y tu saldo.</li><li><strong>Red</strong>: la red del hotel por la que circulan las compras. La web te avisa si no estás en ella.</li><li><strong>Conectar</strong>: dar permiso a la web para leer tu dirección. No es pagar.</li><li><strong>Firmar</strong>: aprobar una operación concreta, como una compra. Eso llega después, al reservar.</li></ul><p>Un detalle importante: el menú te ofrece <strong>una sola acción de cartera</strong> según cómo estés. Si no hay conexión, «Conectar wallet». Si estás en otra red, «Cambiar de red». Y si ya está todo bien, «Desconectar wallet». No verás las tres a la vez.</p><p>Lo que <strong>no</strong> hace conectar la cartera, por si te lo preguntas:</p><ul><li>No te cobra nada.</li><li>No firma ninguna operación.</li><li>No da a la web acceso a tu dinero ni a tus fichas.</li><li>No crea una cuenta con contraseña: tu cartera es tu identidad.</li></ul>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>«No detectamos una wallet web3.»</strong> Tu navegador no tiene ninguna cartera instalada. Pulsa «Instala MetaMask», instálala y recarga la página. Si ya la tienes, revisa que la extensión esté activada en este navegador y no en otro.</li><li><strong>«Estás en la red equivocada.»</strong> Pulsa «Cambiar de red» y acepta en tu cartera. Mientras no lo hagas, el botón de compra se queda bloqueado y se lee «Cambia de red para reservar».</li><li><strong>«Tu wallet aún no tiene esta red. Aprueba añadirla cuando MetaMask te lo pida y vuelve a intentarlo.»</strong> Tu cartera no conocía la red del hotel. Acepta el aviso de añadirla y repite el cambio.</li><li><strong>«Has cancelado el cambio de red. Para reservar, cambia a la red de la aplicación.»</strong> Cerraste el aviso en tu cartera. Vuelve a pulsar «Cambiar de red» y acepta esta vez.</li><li><strong>«No se pudo cambiar de red. Cámbiala manualmente en tu wallet a la red de la aplicación e inténtalo de nuevo.»</strong> El cambio automático no salió. Hazlo a mano desde tu cartera y vuelve a intentarlo.</li><li><strong>Pulsas conectar y no pasa nada.</strong> Lo más probable es que tu cartera esté bloqueada o que se cerrara su ventana. Vuelve a pulsar: la web pedirá el permiso otra vez.</li><li><strong>«Conseguir ETH de prueba» está deshabilitado o da error.</strong> Si lees «Ya solicitaste ETH hace poco. Vuelve a intentarlo a partir de las …», espera a esa hora. Si lees «El faucet se ha quedado sin fondos. Avisa al operador para que lo recargue.», avisa al personal del hotel: no lo puedes arreglar tú. Con «No se pudo enviar ETH de prueba. Inténtalo de nuevo en unos segundos.», espera unos segundos y reintenta.</li><li><strong>No puedes reservar aunque la cartera está conectada.</strong> Puede que te falte saldo para el precio de esa noche; al intentarlo, la web te dice cuánto te falta. También puede que el hotel tenga las ventas en pausa: lo verás avisado en el catálogo.</li><li><strong>Tu cartera te pide una contraseña o desbloquearla.</strong> Es tu propia cartera pidiendo su clave. Esa contraseña la gestionas tú: la web del hotel nunca la ve ni te la pide.</li><li><strong>Tienes dos carteras y no sabes cuál elegir.</strong> En «Elige tu billetera» aparece la lista de las que encuentra tu navegador. Si ya compraste noches antes, elige la misma con la que lo hiciste.</li><li><strong>Conectas otra cartera y no ves tus noches.</strong> Las noches pertenecen a la dirección, no al navegador. Conecta la cartera con la que compraste y volverán a aparecer.</li><li><strong>Tienes la cartera instalada pero la web no la encuentra.</strong> Puede estar instalada en otro navegador o desactivada en este. Actívala en este navegador y recarga la página.</li><li><strong>El aviso de red equivocada no se va.</strong> Acepta el cambio en tu cartera y vuelve a pulsar el botón. Si sigue igual, cámbiala a mano desde tu cartera y recarga.</li><li><strong>No ves el botón «Conseguir ETH de prueba».</strong> Solo aparece si el hotel lo tiene configurado, hay cartera conectada y estás en la red correcta. No es un error: puede que no esté disponible.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Necesito crear una cuenta con correo y contraseña?</strong> No. La web pública no pide registro: se entra con la cartera.</li><li><strong>¿Conectar la cartera me cuesta dinero?</strong> No. Conectar solo da permiso para leer tu dirección; el dinero se gasta al comprar una noche, y nada se cobra antes de que firmes.</li><li><strong>¿Qué red es «la red del hotel»?</strong> La red de pruebas sobre la que hoy funciona la plataforma. Tu cartera te dirá su nombre al añadirla.</li><li><strong>¿Me piden firmar algo al conectar?</strong> No. La firma llega al comprar una noche, no al conectar.</li><li><strong>¿Quiero desconectarme?</strong> Elige «Desconectar wallet» en el menú. La web deja de ver tus noches hasta que vuelvas a conectar.</li></ul>",
      },
    ],
  },
  {
    slug: "03-ver-noches-disponibles",
    order: 3,
    moment: "conseguir-tu-noche",
    title: "Mira las noches disponibles y filtra hasta encontrar la tuya",
    lead: "<blockquote><p>Para quien quiere ver qué noches quedan libres en los próximos 90 días y reducirlas por tipo, mes, precio, fechas o número de habitación. Puedes mirar todo lo que quieras sin conectar nada.</p></blockquote>",
    image: null,
    source: "docs/Manuales/06-huesped/03-ver-noches-disponibles.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Entra en el catálogo de noches del hotel.</li><li>Mira la parrilla: cada tarjeta es una noche con su foto, su habitación, su fecha y su precio en ETH.</li><li>Usa los botones <strong>Todas</strong>, <strong>Simple</strong>, <strong>Doble</strong> y <strong>Suite</strong> para quedarte con un tipo de habitación.</li><li>Afina con el buscador por número de habitación, el <strong>Precio máximo</strong> o el rango <strong>Desde</strong> y <strong>Hasta</strong>.</li><li>Si te has pasado apretando, pulsa <strong>Quitar filtros</strong> y vuelves a empezar.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li><strong>Abre el catálogo.</strong> Es una página pública: no hace falta cartera, ni cuenta, ni registrarse.</li><li><strong>Fíjate en la barra de arriba.</strong> Verás campos de entrada, salida y huéspedes. Ojo: esa barra lleva a otra cosa, a la reserva de una estancia; no filtra este catálogo de noches.</li><li><strong>Baja hasta la banda de filtros.</strong> Se queda fija en la parte alta cuando haces scroll, así no la pierdes de vista.</li><li><strong>Los botones de tipo.</strong> Son <strong>Todas</strong>, <strong>Simple</strong>, <strong>Doble</strong> y <strong>Suite</strong>. A su lado aparece un botón por cada mes que tenga noches.</li><li><strong>El contador.</strong> A la derecha de la banda hay un contador que te dice cuántas noches quedan con los filtros que tienes puestos («4 noches» o «Sin noches»). Es el número que también se anuncia a quien navega con lector de pantalla.</li><li><strong>Los filtros finos.</strong> Puedes escribir un número de habitación, elegir un precio máximo («Hasta 3 ETH», por ejemplo) y marcar una fecha <strong>Desde</strong> y otra <strong>Hasta</strong>.</li><li><strong>De dónde salen los precios del desplegable.</strong> Se calculan a partir del precio más alto que hay en ese momento en el catálogo, en escalones de medio ETH hacia arriba. Por eso cambian de un día para otro.</li><li><strong>Al mover cualquier filtro</strong>, la lista vuelve sola a la primera página.</li><li><strong>Lee las tarjetas.</strong> Cada una muestra la foto, «Habitación 102», el tipo, la fecha en largo y el precio en ETH.</li><li><strong>Aprende las etiquetas.</strong> <strong>Disponible</strong>, con un punto verde, es una noche libre que vende el hotel. <strong>Suite</strong>, en ámbar, es una suite que también vende el hotel. <strong>Reventa</strong>, en coral, es una noche que vende otro cliente; esas no salen en esta pantalla.</li><li><strong>Pide más noches.</strong> La parrilla llega de 12 en 12: pulsa <strong>Cargar más noches</strong> y se añaden otras doce. Si usas lector de pantalla, se te avisa de cuántas se han añadido.</li><li><strong>Llega al final.</strong> Cuando ya no quedan más, aparece el aviso «Has visto todas las noches disponibles en los próximos 90 días.»</li><li><strong>Vuelve otro día.</strong> El catálogo relee el inventario en cada visita, así que no te fíes de una pestaña abierta desde ayer: recarga para ver lo que hay hoy.</li><li><strong>Mira también la reventa.</strong> Las noches que venden otros clientes no se mezclan aquí: tienen su propia pantalla, el mercado de reventa.</li><li><strong>Para ir a una habitación concreta</strong>, escribe su número en «Nº de habitación». Basta con los dígitos: no escribas la palabra «habitación».</li><li><strong>Para una fecha concreta</strong>, pon el mismo día en «Desde» y en «Hasta».</li><li><strong>Si buscas una suite</strong>, pulsa el botón <strong>Suite</strong>: la etiqueta ámbar de cada tarjeta te confirma que ese tipo es el que estás viendo.</li><li><strong>Para volver a empezar</strong>, pulsa <strong>Quitar filtros</strong> o recarga la página. No hay carrito ni reserva a medias: mirar el catálogo no compromete nada.</li><li><strong>Si una noche te interesa, no la dejes para mañana.</strong> Cada noche se vende una sola vez: cuando alguien la compra, desaparece del catálogo.</li></ol><p>Tres cosas que el catálogo <strong>no</strong> hace, para que no las busques en balde:</p><ul><li>No enseña las noches en reventa: están en su propia pantalla.</li><li>No enseña nada más allá de los próximos 90 días.</li><li>No guarda tus filtros para la próxima visita.</li></ul>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>«No hay noches para estos filtros».</strong> Tus filtros son demasiado estrechos. Debajo te lo explican («Prueba con otras fechas, tipos de habitación o un precio máximo mayor…») y tienes el botón <strong>Quitar filtros</strong>.</li><li><strong>«Aún no hay noches publicadas».</strong> El hotel todavía no ha puesto ninguna noche a la venta en esta ventana. Es distinto del caso anterior: aquí no se ofrece quitar filtros, porque no hay filtros que quitar.</li><li><strong>«No se pudo cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.»</strong> Con un botón <strong>Reintentar</strong>. Púlsalo; si sigue igual, revisa tu conexión.</li><li><strong>Aparece un aviso de noches retiradas.</strong> Significa que la lista iba un poco por detrás y se han quitado noches que ya estaban vendidas. Es un aviso de honestidad, no un error: espera unos minutos y puede aparecer disponibilidad nueva.</li><li><strong>En las tarjetas pone «Ventas en pausa».</strong> El hotel ha pausado las operaciones: no se pueden comprar noches mientras dure la pausa. El aviso de arriba lo explica.</li><li><strong>Lee que no se pudo comprobar si las ventas están en pausa.</strong> La red no respondió a esa consulta concreta. Si intentas comprar y la pausa sigue activa, la compra se rechazará.</li><li><strong>Solo rellenas una de las dos fechas.</strong> No da error: el filtro de ese extremo simplemente no se aplica hasta que pongas la otra.</li><li><strong>No ves ninguna noche más allá de tres meses.</strong> Es lo normal: el catálogo cubre desde hoy hasta 90 días después, en UTC.</li><li><strong>Una habitación no tiene foto propia.</strong> La tarjeta usa la imagen de su tipo de habitación; nunca te enseña la foto de otra habitación.</li><li><strong>Te sale un número de habitación que no esperabas.</strong> El catálogo va ordenado por fecha, no por número de habitación; usa los filtros si quieres ir directo a una habitación concreta.</li><li><strong>No ves ningún botón de mes.</strong> Solo aparecen los meses que tienen noches. Si no hay ninguno, es que no hay noches publicadas en esta ventana.</li><li><strong>El precio máximo más bajo te sigue pareciendo caro.</strong> El desplegable va en escalones de medio ETH a partir del precio más alto del catálogo; no puedes bajar más que el escalón más pequeño.</li><li><strong>El buscador por número no encuentra nada.</strong> Escribe solo los dígitos de la habitación, sin espacios ni la palabra «habitación».</li><li><strong>Pulsas «Cargar más noches» y no aparece nada nuevo.</strong> Puede que ya hayas llegado al final: fíjate en el aviso «Has visto todas las noches disponibles en los próximos 90 días.»</li><li><strong>Dejas la pestaña abierta y al volver ves lo de antes.</strong> El catálogo se lee entero en cada visita; si la pestaña lleva un rato abierta, recárgala para ver el inventario de ahora.</li><li><strong>Quieres comprar y el botón dice «Conecta para reservar».</strong> Es normal: el catálogo se mira sin cartera, pero para comprar hay que conectarla. Al pulsar, la web te guía.</li><li><strong>No encuentras dónde se compra.</strong> El botón está dentro de cada tarjeta; no hay un carrito ni una caja de pago aparte.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Necesito cartera para mirar?</strong> No. El catálogo se ve sin conectar nada.</li><li><strong>¿Cuántas noches puedo ver?</strong> Las que el hotel tenga publicadas en los próximos 90 días; la pantalla pide como máximo 100 de una vez.</li><li><strong>¿Los filtros cambian algo de mi cuenta?</strong> No. Solo ordenan lo que ves en pantalla y no se guardan entre visitas.</li><li><strong>¿Por qué no aparece aquí una noche en reventa?</strong> Porque las reventas tienen su propia pantalla y no se mezclan con las del hotel.</li><li><strong>¿La fecha de la tarjeta es la de entrada o la de salida?</strong> Es la fecha de esa noche. Cada ficha es una noche concreta.</li></ul>",
      },
    ],
  },
  {
    slug: "04-comprar-una-noche",
    order: 4,
    moment: "conseguir-tu-noche",
    title: "Compra una noche al hotel",
    lead: "<blockquote><p>Para quien ya ha elegido una noche del catálogo y quiere pagarla con su cartera. Aquí ves los pasos, qué comprueba la web antes de dejarte firmar y qué hacer si algo se tuerce.</p></blockquote>",
    image: "doc-huesped-flujo-compra.svg",
    source: "docs/Manuales/06-huesped/04-comprar-una-noche.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>En el catálogo, busca la noche que quieras y pulsa <strong>Reservar</strong> en su tarjeta.</li><li>Si te lo pide, conecta la cartera y cambia a la red del hotel.</li><li>Se abre la ventana «Revisar tu reserva»: comprueba habitación, noche, importe, token y contrato.</li><li>Espera a que termine la verificación del precio.</li><li>Pulsa <strong>Confirmar y firmar</strong> y firma en tu cartera.</li></ol><figure><img src=\"/manual/imagenes/doc-huesped-flujo-compra.svg\" alt=\"Esquema de la compra de una noche\" loading=\"lazy\" /><figcaption>Esquema de la compra de una noche</figcaption></figure>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li><strong>Elige la noche</strong> en el catálogo. Si te hace falta, filtra por tipo, mes, precio máximo o número de habitación.</li><li><strong>Mira el botón de la tarjeta.</strong> Cambia según cómo estés: <strong>Reservar</strong> si la cartera está lista, <strong>Conecta para reservar</strong> si no lo está, <strong>Cambia de red para reservar</strong> si estás en otra red e <strong>Instala una wallet</strong> si no tienes ninguna.</li><li><strong>Pulsa Reservar.</strong> Si te falta saldo para esa noche, el botón se queda bloqueado y te dice cuánto te falta: «Te faltan 0,01 ETH (tienes 0,04, necesitas 0,05).»</li><li><strong>Conecta la cartera y cambia de red</strong> si la web te lo pide. Es lo mismo que hiciste antes de empezar; acepta en tu cartera.</li><li><strong>Se abre la ventana «Revisar tu reserva»</strong> con este aviso: «Esto es lo que vas a firmar. Comprueba el importe y la noche antes de confirmar.»</li><li><strong>Lee las cinco líneas</strong> de la ventana: <strong>Habitación</strong>, <strong>Noche</strong>, <strong>Importe</strong>, <strong>Token</strong> y <strong>Contrato</strong>.</li><li><strong>Espera a la verificación.</strong> Mientras dura verás «Verificando el precio on-chain…» (es decir, consultando el precio en la red) con un indicador. La web vuelve a leer el precio para no firmar un importe viejo.</li><li><strong>Pulsa «Confirmar y firmar».</strong> El botón está deshabilitado hasta que la verificación termina bien: si algo no cuadra, no te deja firmar.</li><li><strong>Firma en tu cartera.</strong> Verás pasar tres mensajes: «Confirma en tu wallet», «Reservando tu noche…» y «¡Noche reservada!»</li><li><strong>Espera unos segundos</strong> a que la red confirme la operación. Si cierras la ventana durante la espera, la reserva sigue su curso: «Puedes cerrar: la reserva continúa y aparecerá en «Mis noches».»</li><li><strong>Guarda el recibo.</strong> Al terminar verás el recibo con el identificador de la operación y el botón <strong>Ver en Mis noches</strong>.</li><li><strong>Comprueba el resultado.</strong> En «Mis noches», tu noche aparece con la etiqueta <strong>Tuya</strong>.</li></ol><p>Tres cosas que hace la web por ti y conviene que sepas:</p><ul><li><strong>Revisa lo mismo que vas a firmar.</strong> La ventana no enseña una promesa: lee el identificador real de la operación, saca de ahí la habitación y la fecha, y vuelve a consultar el precio en la red antes de dejarte firmar.</li><li><strong>No firma nada sin verificar.</strong> Si la comprobación no termina bien, el botón «Confirmar y firmar» se queda deshabilitado. Es a propósito: mejor no firmar que firmar a ciegas.</li><li><strong>Envía exactamente lo revisado.</strong> Cuando firmas, se manda el mismo contenido que viste, sin recalcularlo por el camino.</li></ul><p>En la red se comprueba además que la noche no esté ya vendida, que no se haya consumido con una entrada en recepción, que no esté caducada y que el importe sea exactamente el precio. Si todo cuadra, la ficha pasa a tu cartera y el importe va entero al hotel: en esta compra no hay comisión.</p>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>«Saldo insuficiente para reservar esta noche.» o «Te faltan …».</strong> Tu cartera no llega al precio. Recarga saldo y vuelve a intentarlo. Deja además algo para la comisión de la red, que se paga aparte del precio.</li><li><strong>«El precio de esta noche acaba de cambiar; por tu seguridad no la firmamos con un importe antiguo. Vuelve a abrir la reserva.»</strong> El precio en la red ya no es el que viste. Cierra la ventana, vuelve a abrirla y revisa el importe nuevo.</li><li><strong>«No pudimos verificar el precio on-chain. Comprueba tu conexión a la red e inténtalo de nuevo.»</strong> Con el botón <strong>Reintentar verificación</strong>. Es un problema de lectura de la red, distinto del anterior.</li><li><strong>«Esta noche ya está vendida. Elige otra noche del catálogo.»</strong> Alguien la compró antes. Pulsa el enlace <strong>Elegir otra noche</strong>: no es culpa de tu conexión.</li><li><strong>«Has cancelado la firma. Puedes intentarlo de nuevo cuando quieras.»</strong> Cerraste tu cartera sin firmar. No se ha cobrado nada; vuelve a pulsar Confirmar y firmar.</li><li><strong>«No se completó la reserva» y «No se realizó ningún cargo. Puedes intentarlo de nuevo.»</strong> La operación no salió adelante, pero no se te ha cobrado. Reintenta.</li><li><strong>«No se pudo completar la reserva. Revisa que estés en la red correcta y vuelve a intentarlo.»</strong> Revisa la red y prueba otra vez.</li><li><strong>En la tarjeta pone «Ventas en pausa».</strong> El hotel ha pausado las operaciones y no hay botón de compra. Espera a que se reanuden.</li><li><strong>No puedes cerrar la ventana.</strong> Mientras tu cartera está firmando, la ventana no se cierra. Durante la espera de confirmación sí puedes cerrarla: la reserva continúa.</li><li><strong>Te has confundido de botón.</strong> El <strong>Reservar</strong> de la tarjeta compra la ficha de una noche. El <strong>Reservar</strong> del menú abre otra cosa: la reserva de una estancia, con anticipo por transferencia. No son lo mismo.</li><li><strong>La noche ya había pasado.</strong> Una noche caducada no se puede comprar: la red rechaza la operación aunque la tarjeta siguiera en pantalla.</li><li><strong>Todo esto es una red de pruebas.</strong> La compra funciona hoy sobre una red de pruebas; no es todavía la venta al público del hotel.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Qué firmo exactamente?</strong> La compra de esa noche por ese importe, al destino correcto. Lo que revisas es lo que se firma, sin cambios.</li><li><strong>¿Me pueden cobrar de más si cambia el precio?</strong> No. Si el precio ya no coincide, la web no te deja firmar y te pide volver a abrir la reserva.</li><li><strong>¿Puedo cancelar la compra después de firmar?</strong> No desde la web. Si ya no la quieres, puedes ponerla en reventa y recuperar parte del importe.</li><li><strong>¿Puedo comprar varias noches seguidas?</strong> Sí, una detrás de otra: cada noche es una compra distinta con su propia firma.</li><li><strong>¿La página me cobra antes de firmar?</strong> No. «No se cobrará nada hasta que firmes.»</li></ul>",
      },
    ],
  },
  {
    slug: "05-comprar-en-reventa",
    order: 5,
    moment: "conseguir-tu-noche",
    title: "Compra una noche que otro cliente revende",
    lead: "<blockquote><p>Para quien quiere una noche que ya era de otra persona y ahora está en venta. El proceso es el mismo que comprar al hotel: revisas precio y noche, y firmas.</p></blockquote>",
    image: null,
    source: "docs/Manuales/06-huesped/05-comprar-en-reventa.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Abre la pantalla <strong>Reventa</strong> desde el menú de la cabecera, dentro del desplegable «Descubre».</li><li>Lee el contador de arriba: te dice cuántas noches hay en reventa.</li><li>Busca la que te guste y pulsa <strong>Reservar reventa</strong> en su tarjeta.</li><li>Conecta la cartera y cambia de red si te lo pide.</li><li>En «Revisar tu reserva», comprueba las cinco líneas, espera la verificación, pulsa <strong>Confirmar y firmar</strong> y firma.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li><strong>Entra en el mercado de reventa.</strong> Está en el desplegable «Descubre» de la cabecera. Es una página pública: puedes mirar sin conectar nada.</li><li><strong>Lee el encabezado.</strong> Verás el título «Mercado de reventa» y la explicación de que son noches que otras personas ya compraron y ahora revenden.</li><li><strong>Mira el contador.</strong> Arriba se lee cuántas noches hay en venta («3 noches en reventa»). Si no hay ninguna, se lee «Sin noches en reventa».</li><li><strong>Reconoce las tarjetas de reventa.</strong> Cada una lleva la etiqueta coral <strong>Reventa</strong>, junto a la foto, la habitación, el tipo, la fecha y el precio que puso el vendedor.</li><li><strong>Fíjate en el precio.</strong> Lo elige quien vende, no el hotel, así que puede ser distinto del precio del catálogo. Tú pagas exactamente ese precio.</li><li><strong>Pulsa «Reservar reventa».</strong> Si te falta saldo, el botón se bloquea y te dice cuánto te falta, igual que en el catálogo.</li><li><strong>Conecta la cartera y cambia de red</strong> si hace falta. Son los mismos pasos de siempre, y el botón te lo va pidiendo con su texto.</li><li><strong>Se abre «Revisar tu reserva»</strong> con las cinco líneas de siempre: <strong>Habitación</strong>, <strong>Noche</strong>, <strong>Importe</strong>, <strong>Token</strong> y <strong>Contrato</strong>.</li><li><strong>Espera la verificación.</strong> La web lee el precio del anuncio en la red (no el precio de tarifa del hotel). Mientras dura, verás «Verificando el precio on-chain…», que quiere decir «comprobando el precio en la red».</li><li><strong>Pulsa «Confirmar y firmar»</strong> y firma en tu cartera. Si algo no cuadra con el listado, el botón no se habilita.</li><li><strong>Guarda el recibo.</strong> Verás «¡Noche reservada!», el recibo de la operación y el botón <strong>Ver en Mis noches</strong>.</li><li><strong>Comprueba el resultado.</strong> En «Mis noches», la noche aparece con la etiqueta <strong>Tuya</strong>, como cualquier otra.</li><li><strong>Vuelve cuando quieras.</strong> El mercado relee los anuncios en cada visita, así que la lista que ves es la de ahora y no una copia vieja.</li></ol><p>Reventa y compra al hotel se parecen mucho, pero no son lo mismo:</p><ul><li><strong>El precio</strong>: en el hotel lo fija el hotel; en reventa, quien vende la noche.</li><li><strong>La etiqueta</strong>: las de reventa llevan la etiqueta coral <strong>Reventa</strong>.</li><li><strong>La pantalla</strong>: las de reventa viven en el mercado de reventa, no en el catálogo.</li><li><strong>La comisión</strong>: en la compra al hotel no hay comisión; en la reventa, el hotel cobra su parte al vendedor.</li><li><strong>Lo que haces tú</strong>: exactamente lo mismo. Revisas, esperas la verificación y firmas.</li></ul><p>Si te interesa saber a dónde va tu dinero: el hotel se queda una comisión por la reventa y el resto es para quien vendió. Esa comisión es del 5 % en habitaciones simples y dobles, y del 10 % en suites, y sale de la parte del vendedor: no se suma a lo que tú pagas.</p><p>Antes de enseñarte una noche, el mercado comprueba tres cosas:</p><ul><li>Que el anuncio del vendedor siga activo.</li><li>Que la noche no se haya consumido ya con una entrada en recepción.</li><li>Que su fecha siga dentro de la ventana de 90 días.</li></ul><p>Y una cuarta regla de honradez: si la pantalla no consigue leer la lista, no te dice «no hay noches». Te avisa de que no pudo cargarla. La diferencia importa: una lista vacía inventada te ocultaría noches que sí puedes comprar.</p><p>Al terminar la compra, el anuncio se cierra, la ficha pasa a tu cartera y el dinero queda repartido. El vendedor no lo recibe al instante: su parte queda apuntada a su nombre y la cobra cuando quiera desde «Mis noches». A ti no te afecta: tú ya tienes tu noche.</p>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>«Ahora mismo no hay noches en reventa».</strong> Nadie tiene una noche a la venta en este momento. Debajo te lo explican y tienes el botón <strong>Ver noches disponibles</strong>, que lleva al catálogo del hotel.</li><li><strong>«No se pudo cargar el mercado de reventa. Revisa tu conexión e inténtalo de nuevo.»</strong> Es el aviso de que la pantalla no pudo leer la lista, no de que no haya noches. Revisa tu conexión y vuelve a entrar.</li><li><strong>El listado desapareció entre que lo mirabas y la firma.</strong> Si el vendedor lo retiró o alguien compró antes, verás «El precio de esta noche acaba de cambiar; por tu seguridad no la firmamos con un importe antiguo. Vuelve a abrir la reserva.» Cierra la ventana y elige otra.</li><li><strong>La noche se usó en recepción después de ponerse a la venta.</strong> El mercado la descarta antes de ofrecértela. Si llegara a firmarse, la red rechazaría la compra: una noche ya consumida no se puede revender.</li><li><strong>La noche ya había caducado.</strong> No aparece en la lista, porque la fecha quedó fuera de la ventana de 90 días y una noche expirada no se puede comprar.</li><li><strong>El importe no coincide con el del listado.</strong> La red rechaza la operación. No pagas de más: la compra exige exactamente el precio anunciado.</li><li><strong>En la tarjeta pone «Ventas en pausa».</strong> El hotel ha pausado las operaciones y la compra de reventa también se detiene mientras dure la pausa.</li><li><strong>La pantalla dice que no se pudo cargar, pero tú has visto noches hace un momento.</strong> Es el comportamiento correcto: si no se puede leer la lista, la web prefiere avisar antes que decirte que no hay nada.</li><li><strong>El vendedor no ha cobrado todavía.</strong> Es normal y no afecta a tu compra. Su parte queda apuntada en el sistema y la retira él cuando quiere.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Es más caro que comprar al hotel?</strong> Depende: el precio lo pone el vendedor. Puede ser más alto o más bajo que el del catálogo.</li><li><strong>¿Quién cobra mi dinero?</strong> El vendedor, menos la comisión del hotel. Tú pagas el precio que se anunció.</li><li><strong>¿Puedo revenderla yo después?</strong> Sí, mientras no la hayas usado en recepción.</li><li><strong>¿Por qué las reventas no salen en el catálogo?</strong> Porque tienen su propia pantalla, para no mezclar las noches del hotel con las de otros clientes.</li><li><strong>¿Qué pasa si el vendedor retira su noche mientras miro?</strong> Que al firmar la verificación falla y la web te pide volver a abrir la reserva. No se te cobra nada.</li></ul>",
      },
    ],
  },
  {
    slug: "06-mis-noches",
    order: 6,
    moment: "conseguir-tu-noche",
    title: "Mira tus noches y su estado",
    lead: "<blockquote><p>Para quien ya ha comprado alguna noche y quiere ver cuáles tiene, si están libres o puestas a la venta, y qué dinero puede cobrar de sus reventas.</p></blockquote>",
    image: null,
    source: "docs/Manuales/06-huesped/06-mis-noches.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Abre <strong>Mis noches</strong> desde el desplegable «Descubre» de la cabecera.</li><li>Conecta la cartera si te lo pide y ponte en la red del hotel.</li><li>Mira tus tarjetas: cada una es una noche, con la etiqueta <strong>Tuya</strong> o <strong>En reventa</strong>.</li><li>Cambia entre <strong>Próximas</strong> y <strong>Pasadas</strong> con el conmutador de arriba.</li><li>Si hay un panel de <strong>Saldo pendiente</strong>, pulsa <strong>Cobrar</strong> para llevarte ese dinero a tu cartera.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li><strong>Abre «Mis noches».</strong> Está en el menú de la cabecera, dentro del desplegable «Descubre».</li><li><strong>Conecta la cartera.</strong> Esta pantalla es de cliente: si no tienes cartera conectada o estás en otra red, verás «Conecta tu wallet para ver y gestionar tus noches.» y la barra de conexión en lugar de la lista.</li><li><strong>Espera un momento.</strong> Mientras la web consulta tus noches verás «Cargando tus noches…».</li><li><strong>Mira el aviso de arriba.</strong> Si tienes noches a la venta, aparece «¿Quieres gestionar lo que tienes en venta?» con el enlace <strong>Ir a Mis reventas</strong>.</li><li><strong>Revisa el panel «Saldo pendiente».</strong> Si has vendido alguna noche, verás «Tienes fondos de reventas listos para cobrar.» y el botón <strong>Cobrar</strong> con la cantidad. El dinero no llega solo a tu cartera: lo pides tú cuando quieras.</li><li><strong>Cambia de pestaña.</strong> Con el conmutador de dos botones pasas entre <strong>Próximas</strong> (desde hoy en adelante) y <strong>Pasadas</strong> (las anteriores a hoy). La comparación se hace en UTC.</li><li><strong>Lee cada tarjeta.</strong> Muestra la foto, «Habitación 102», el tipo de habitación, la fecha y la etiqueta de estado.</li><li><strong>Fíjate en la etiqueta.</strong> <strong>Tuya</strong> significa que la noche está en tu cartera y no está en venta. <strong>En reventa</strong> significa que tiene un anuncio activo; debajo se lee «Precio de reventa: …».</li><li><strong>Saca el resguardo de check-in.</strong> En cada tarjeta hay un bloque <strong>Resguardo de check-in</strong> con el botón <strong>Ver mi resguardo QR</strong>. Te pedirá una firma para comprobar que la noche es tuya, y luego podrás enseñar el código QR en recepción.</li><li><strong>Si no tienes ninguna noche</strong> verás «Todavía no posees ninguna noche.» y el botón <strong>Explorar noches</strong>, que lleva al catálogo.</li><li><strong>En la pestaña «Pasadas»</strong>, cada tarjeta te ofrece además el formulario para dejar tu reseña de esa estancia.</li><li><strong>Entra en «Mis reventas»</strong> para ver dos secciones: <strong>Publicadas</strong> (lo que tienes a la venta) y <strong>Vendidas</strong> (lo que ya has vendido), con la noche, el precio y el comprador acortado. Si tienes novedades desde tu última visita, arriba se lee «Tienes 1 reventa nueva desde tu última visita.» y el botón <strong>Marcar como vistas</strong>.</li><li><strong>Mira hasta cuándo vale tu resguardo.</strong> Bajo el código se lee «Válido hasta el …» y el recordatorio de que cada resguardo sirve una sola vez.</li><li><strong>Si no ves el panel «Saldo pendiente»</strong>, es que ahora mismo no tienes nada que cobrar. Cuando vendas una noche, aparecerá solo.</li></ol><p>Para saber qué noches tienes, la pantalla no se fía de una lista guardada: comprueba contra la red, una por una, qué fichas están realmente a tu nombre y cuáles de ellas tienen un anuncio activo. Por eso una noche que revendiste desaparece, y por eso la lista siempre está al día.</p><p>Un mapa rápido de la pantalla:</p><ul><li><strong>Próximas y Pasadas</strong>: el conmutador que separa lo que está por llegar de lo que ya fue.</li><li><strong>Saldo pendiente</strong>: el dinero de tus reventas, si tienes alguno por cobrar.</li><li><strong>Cada tarjeta</strong>: la noche, su estado y el acceso al resguardo de check-in.</li><li><strong>Ir a Mis reventas</strong>: lo que tienes publicado y lo que ya has vendido.</li></ul><p>La pestaña <strong>Pasadas</strong> sirve para dos cosas: recordar tus estancias y dejar la reseña de cada una. La pestaña <strong>Próximas</strong> es la que te interesa si tienes un viaje a la vista.</p>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>«Conecta tu wallet para ver y gestionar tus noches.»</strong> No hay cartera conectada, o estás en otra red. Usa la barra de conexión que aparece justo debajo.</li><li><strong>«No se pudieron cargar tus noches. Inténtalo de nuevo.»</strong> Con un botón <strong>Reintentar</strong>, que repite la consulta. Si sigue fallando, revisa tu conexión.</li><li><strong>«Todavía no posees ninguna noche.»</strong> No tienes ninguna ficha en esta cartera. Puede que hayas comprado con otra cartera distinta.</li><li><strong>«No tienes noches próximas.» o «No tienes noches pasadas.»</strong> El vacío es de esa pestaña concreta, no de toda tu cuenta.</li><li><strong>Una noche que compraste ya no aparece.</strong> Si la revendiste o la traspasaste, ya no es tuya y desaparece de la lista. La pantalla comprueba el dueño real de cada ficha, no lo que pasó en el historial.</li><li><strong>Una ficha ya no existe.</strong> Si el hotel retiró una noche que nunca se vendió, la consulta no rompe la pantalla: simplemente esa noche no aparece.</li><li><strong>Una habitación no tiene foto propia.</strong> La tarjeta usa la imagen de su tipo de habitación, nunca la de otra habitación.</li><li><strong>«No se pudo completar la operación. Revisa la red y vuelve a intentarlo.»</strong> Aparece al cobrar o al firmar una operación. Tu saldo no se pierde: sigue apuntado a tu nombre y puedes reintentarlo.</li><li><strong>Al cobrar, el botón se queda en «Procesando…».</strong> Está esperando tu firma y la confirmación de la red. Espera unos segundos sin cerrar la ventana; si algo falla, verás el aviso de error.</li><li><strong>Solo ves noches en «Pasadas».</strong> Es normal si tus próximas estancias ya pasaron o si aún no has comprado ninguna noche futura.</li><li><strong>«Has cancelado la firma. Puedes intentarlo de nuevo cuando quieras.»</strong> Cerraste la cartera sin firmar. No se ha hecho nada; vuelve a intentarlo.</li><li><strong>Al pedir el resguardo: «Conecta tu cartera para obtener el resguardo.» o «Firma cancelada en tu cartera.»</strong> Falta la cartera, o cancelaste la firma. Repite el botón <strong>Ver mi resguardo QR</strong>. Si lees «No se pudo emitir el resguardo. Inténtalo de nuevo.», vuelve a intentarlo.</li><li><strong>Un aviso de reventa que no entiendes.</strong> Los más habituales son: «No eres la propietaria de esta noche.», «El precio debe ser mayor que 0.», «La noche ha expirado y no puede listarse.», «Esta noche no está en reventa.», «El precio está por debajo del mínimo de reventa que fija el hotel.» y «Esta noche ya se consumió en recepción y no puede revenderse.» Cada uno dice exactamente lo que pasa.</li><li><strong>El código QR no se dibuja.</strong> Verás «No se pudo dibujar el código QR, pero el resguardo sigue valiendo: copia el token y enséñalo en recepción.» Copia ese texto y llévalo a recepción: sigue sirviendo.</li><li><strong>El escáner de recepción no funciona.</strong> El resguardo incluye un texto pensado para eso: el personal puede pegarlo a mano («Recepción puede pegar este texto si el escáner no funciona.»).</li><li><strong>Ya usaste el resguardo y lo necesitas otra vez.</strong> Cada resguardo sirve una sola vez. Vuelve a la tarjeta y pulsa otra vez <strong>Ver mi resguardo QR</strong> para generar uno nuevo.</li><li><strong>Todo esto es una red de pruebas.</strong> Las noches y los saldos funcionan hoy sobre una red de pruebas; no es todavía la venta al público del hotel.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Cómo sé que una noche es mía?</strong> Porque en «Mis noches» lleva la etiqueta <strong>Tuya</strong> o <strong>En reventa</strong>.</li><li><strong>¿Qué significa «En reventa»?</strong> Que esa noche tiene un anuncio activo para que la compre otra persona. El precio puesto se lee en la misma tarjeta.</li><li><strong>¿Por qué no veo una noche que compré?</strong> Si ya no eres su dueño, desaparece: la pantalla enseña solo lo que está realmente a tu nombre.</li><li><strong>¿Qué es el «Saldo pendiente»?</strong> El dinero de tus reventas que el sistema te tiene apuntado. Lo cobras tú, cuando quieras, con el botón <strong>Cobrar</strong>.</li><li><strong>¿Para qué sirve el resguardo de check-in?</strong> Para dar tu entrada en recepción enseñando un código QR. Se genera pidiendo una firma y sirve una sola vez.</li></ul>",
      },
    ],
  },
  {
    slug: "07-pedir-al-asistente",
    order: 7,
    moment: "conseguir-tu-noche",
    title: "Pídele una noche al asistente",
    lead: "<blockquote><p>Es para ti, que quieres una noche en el Hotel Marina del Sol sin buscar a mano en el catálogo. Le cuentas al asistente qué noche buscas, él comprueba si está libre y a qué precio, y te deja la reserva lista para que la firmes tú.</p></blockquote>",
    image: "doc-huesped-flujo-asistente.svg",
    source: "docs/Manuales/06-huesped/07-pedir-al-asistente.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Conecta tu cartera (la aplicación donde guardas tus monedas digitales) y ponla en la red del hotel.</li><li>Abre el menú <strong>Descubre</strong> de la cabecera y entra en <strong>Asistente</strong>.</li><li>Escribe la noche que quieres, por ejemplo «¿hay alguna suite disponible en junio?», y pulsa <strong>Enviar</strong>.</li><li>Cuando el asistente te diga la noche y el precio, contéstale que sí.</li><li>En la tarjeta <strong>Reserva preparada — revisa y firma</strong>, revisa los datos y pulsa <strong>Firmar reserva</strong>. La firma se hace en tu cartera.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li>Entra en la página del asistente. Verás el título <strong>Asistente IA</strong> y, debajo, la frase «Pregunta por disponibilidad y prepara tu reserva; tú firmas en tu wallet.»</li><li>Antes de que escribas nada, el chat te saluda: «Hola, soy el asistente del Hotel Marina del Sol. Puedo ayudarte a consultar disponibilidad y preparar la reserva de una noche.»</li><li>Debajo del saludo hay tres sugerencias que puedes pulsar: <strong>Ver suites en junio</strong>, <strong>Mis reservas</strong> y <strong>Reservar una noche</strong>.</li><li>Escribe tu pregunta en el cuadro de abajo. El marcador de posición dice «Ej.: ¿hay alguna suite disponible en junio?». Con <strong>Enter</strong> envías y con <strong>Mayús + Enter</strong> haces un salto de línea.</li><li>Pulsa <strong>Enviar</strong>. El botón está apagado si el cuadro está vacío o si el asistente todavía está pensando.</li><li>Mientras esperas, en el chat se lee <strong>Pensando…</strong>.</li><li>Lee la respuesta: te dirá si esa noche existe, si se puede comprar y cuánto cuesta. Si no existe o ya no está libre, te propondrá alternativas del mismo tipo de habitación.</li><li>Cuando tengas clara la noche, contéstale que sí. Es normal que te pida confirmar la noche y el precio antes de seguir.</li><li>Con tu confirmación aparece la tarjeta <strong>Reserva preparada — revisa y firma</strong>. Ahí ves cinco datos: <strong>Habitación</strong> (por ejemplo, «116 (Doble)»), <strong>Noche</strong> (en formato AAAAMMDD, es decir, año, mes y día seguidos), <strong>Token</strong> (el número que identifica tu noche), <strong>Contrato</strong> e <strong>Importe</strong> (en ETH, la moneda digital de esta red de pruebas).</li><li>Si tu cartera ya está lista, la tarjeta añade la línea «Firmarás con la wallet conectada» y la dirección de tu cartera.</li><li>Mientras se comprueba el precio verás «Verificando el precio on-chain…». Esa comprobación lee el precio real anotado en el registro del hotel. Si cierra bien, lo único que cambia es que se activa el botón de firmar.</li><li>Según cómo tengas la cartera, el botón dirá <strong>Conecta tu wallet para reservar</strong>, <strong>Cambia de red para reservar</strong> o <strong>Firmar reserva</strong>.</li><li>Pulsa <strong>Firmar reserva</strong>. Se abre tu cartera con el importe a la vista y firmas ahí. El asistente no firma nunca por ti.</li><li>Cuando la red confirme la operación, la tarjeta se pliega y muestra <strong>¡Noche reservada!</strong>, la frase «Tu reserva se ha confirmado. Ya puedes verla en tus noches.» y el botón <strong>Ver en Mis noches</strong>.</li><li>Si cierras la página, la reserva continúa: aparecerá en <strong>Mis noches</strong> de todos modos.</li></ol><p>Así se ve el recorrido, de un vistazo:</p><figure><img src=\"/manual/imagenes/doc-huesped-flujo-asistente.svg\" alt=\"Esquema del flujo del asistente: pides la noche, comprueba el precio, firmas y aparece en Mis noches\" loading=\"lazy\" /><figcaption>Esquema del flujo del asistente: pides la noche, comprueba el precio, firmas y aparece en Mis noches</figcaption></figure>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>No tienes la cartera conectada.</strong> Puedes preguntar y leer la respuesta, pero el botón dirá <strong>Conecta tu wallet para reservar</strong> y no podrás firmar. Conecta la cartera y vuelve a intentarlo.</li><li><strong>Estás en otra red.</strong> El botón dirá <strong>Cambia de red para reservar</strong>. Cambia a la red del hotel en tu cartera.</li><li><strong>Esa noche ya se vendió.</strong> Verás «Esta noche ya está vendida. Pide otra al asistente o elígela en el catálogo.» Pídele otra al asistente.</li><li><strong>No se pudo comprobar el precio.</strong> Aparece «No pudimos verificar el precio on-chain. Comprueba tu conexión a la red e inténtalo de nuevo.» con un botón <strong>Reintentar verificación</strong>. Revisa tu conexión y reintenta.</li><li><strong>Los datos no cuadran con el precio.</strong> Verás «Los datos de la transacción no coinciden con el precio on-chain. No firmes: vuelve a intentarlo.» Haz caso: no firmes y repite la petición.</li><li><strong>Te falta saldo.</strong> El aviso dice cuánto te falta, cuánto tienes y cuánto necesitas. Añade fondos a tu cartera o elige otra noche.</li><li><strong>Has cerrado la ventana de la cartera.</strong> Se muestra «Has cancelado la firma. Puedes intentarlo de nuevo.» No has reservado nada; repite la firma cuando quieras.</li><li><strong>La operación no termina bien.</strong> Aparece «No se pudo completar la reserva. Revisa la red y vuelve a intentarlo.» con <strong>Intentar de nuevo</strong>.</li><li><strong>El asistente no está disponible.</strong> Sale el aviso «El asistente no está disponible ahora mismo. Puedes seguir reservando desde el catálogo.» con <strong>Reintentar</strong> e <strong>Ir al catálogo</strong>. No es culpa de tu petición: puedes reservar desde el catálogo.</li><li><strong>La conversación se corta.</strong> Si escribes muchísimo o muy seguido, el sistema te frena (admite unas 10 peticiones por minuto). Verás el aviso de asistente no disponible: espera un minuto y vuelve a preguntar.</li><li><strong>El asistente no entiende la petición.</strong> Responde «Lo siento, no he podido responder ahora mismo. Inténtalo de nuevo en un momento.» Solo atiende temas de disponibilidad, precios y compra de noches del hotel.</li><li><strong>La noche existe pero no se puede comprar.</strong> Puede estar expirada, ya vendida o no puesta a la venta. El asistente te lo dirá y te ofrecerá alternativas del mismo tipo de habitación.</li><li><strong>Le pides algo que no es del hotel.</strong> Contesta «Solo puedo ayudarte con disponibilidad, precios y la compra de noches del hotel.» No es un fallo: el asistente tiene ese límite.</li><li><strong>La conversación se alarga mucho.</strong> El sistema admite 40 mensajes por conversación. Si te pasas, la rechaza: empieza una conversación nueva.</li><li><strong>Cierras la página después de firmar.</strong> No pasa nada. Verás la frase «Puedes cerrar: la reserva continúa y aparecerá en «Mis noches».» y la noche estará ahí.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿El asistente puede firmar por mí?</strong> No. Nunca firma ni toca tus claves: la firma es siempre tuya, en tu cartera.</li><li><strong>¿Se guarda la conversación?</strong> No queda guardada: vive solo en tu navegador mientras la tienes abierta.</li><li><strong>¿Con qué se paga?</strong> Con ETH, la moneda digital de la red de pruebas del hotel; el importe aparece en la tarjeta antes de firmar.</li><li><strong>¿Puedo pedir la reserva sin cartera?</strong> Puedes preguntar, pero para reservar necesitas conectar la cartera y firmar.</li><li><strong>¿El asistente se inventa los precios?</strong> No: lee el precio real anotado en el registro del hotel y lo vuelve a comprobar antes de dejarte firmar.</li></ul>",
      },
    ],
  },
  {
    slug: "08-poner-tu-noche-en-reventa",
    order: 8,
    moment: "si-te-sobra-la-noche",
    title: "Pon tu noche en reventa, cambia el precio o retírala",
    lead: "<blockquote><p>Es para ti, que ya tienes una noche tuya y quieres venderla a otra persona. Aquí ves cómo publicarla con su precio, cómo cambiarlo y cómo quitarla del mercado firmando tú en tu cartera.</p></blockquote>",
    image: "doc-huesped-flujo-reventa.svg",
    source: "docs/Manuales/06-huesped/08-poner-tu-noche-en-reventa.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Conecta tu cartera (la aplicación donde guardas tus monedas digitales) y ponla en la red del hotel.</li><li>Abre <strong>Mis noches</strong>.</li><li>En la tarjeta de la noche, escribe el precio que quieres en <strong>Precio de reventa (ETH)</strong>.</li><li>Pulsa <strong>Listar</strong> y firma en tu cartera.</li><li>La etiqueta de la noche pasa a <strong>En reventa</strong>.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li>Abre <strong>Mis noches</strong>. Si te falta conectar la cartera o estás en otra red, en lugar de la lista verás «Conecta tu wallet para ver y gestionar tus noches.» con la barra de conexión.</li><li>Mientras carga se lee «Cargando tus noches…».</li><li>Arriba del listado aparece el aviso «¿Quieres gestionar lo que tienes en venta?» con el enlace <strong>Ir a Mis reventas</strong>.</li><li>En una noche que aún no está en venta verás la etiqueta <strong>Tuya</strong>, el campo <strong>Precio de reventa (ETH)</strong> y el botón <strong>Listar</strong>.</li><li>Escribe una cifra mayor que cero y pulsa <strong>Listar</strong>. Si dejas el campo vacío o pones cero, el sistema ni siquiera abre tu cartera: marca el campo y muestra «Introduce un precio mayor que 0.»</li><li>Se abre la ventana de la operación y tu cartera te pide firmar. Mientras firmas se lee <strong>Confirma en tu wallet</strong> y el aviso «Revisa y firma la transacción en MetaMask.» (MetaMask es una cartera que funciona en el navegador).</li><li>Enviada la operación, la ventana pasa a <strong>Reservando tu noche…</strong> con «Esperando confirmación en la red…» y el recibo de la operación. Ese texto es general del sistema y no habla de reventa.</li><li>Al confirmarse, la tarjeta se actualiza sola: la etiqueta cambia a <strong>En reventa</strong> y debajo aparece «Precio de reventa:» con tu cifra.</li><li>Para gestionar lo que tienes publicado, entra en <strong>Mis reventas</strong>. La cabecera dice <strong>Mis reventas</strong> y el subtítulo «Gestiona las noches que has puesto en venta y consulta las que ya has vendido.»</li><li>Dentro hay dos secciones: <strong>Publicadas</strong> y <strong>Vendidas</strong>. En <strong>Publicadas</strong> salen tus noches en venta; si no hay ninguna, se lee «No tienes ninguna noche publicada ahora mismo.»</li><li>En <strong>Vendidas</strong> hay una tabla con tres columnas: <strong>Noche</strong>, <strong>Precio</strong> y <strong>Comprador</strong>. Si todavía no has vendido nada, se lee «Todavía no has vendido ninguna noche.»</li><li>Sobre <strong>Publicadas</strong> tienes el enlace <strong>Publicar otra noche</strong>, que te devuelve a <strong>Mis noches</strong>.</li><li>Para cambiar el precio de una noche publicada, pulsa <strong>Cambiar precio</strong> en su tarjeta. El campo se abre vacío: hay que escribir la cifra nueva completa.</li><li>Escribe el precio nuevo y pulsa <strong>Guardar nuevo precio</strong>. Te pedirá firmar otra vez, porque es otra operación. Si te arrepientes antes de firmar, <strong>Cancelar</strong> cierra el formulario sin enviar nada.</li><li>Para retirar la noche del mercado, pulsa <strong>Cancelar reventa</strong> y firma. Al confirmarse, la noche desaparece de <strong>Publicadas</strong>.</li><li>Si tienes dinero pendiente de reventas ya vendidas, verás el panel <strong>Saldo pendiente</strong> con «Tienes fondos de reventas listos para cobrar.» y el botón <strong>Cobrar</strong> con el importe.</li><li>Al final de la pantalla está el bloque <strong>Avisos al móvil</strong>, con <strong>Activar avisos</strong> o <strong>Desactivar avisos</strong> y el aviso «Recibe un aviso cuando se venda alguna de tus noches. Es anónimo y puedes desactivarlo cuando quieras.»</li></ol><p>Así se ve el recorrido, de un vistazo:</p><figure><img src=\"/manual/imagenes/doc-huesped-flujo-reventa.svg\" alt=\"Esquema de la reventa de una noche\" loading=\"lazy\" /><figcaption>Esquema de la reventa de una noche</figcaption></figure>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>El precio está vacío o es cero.</strong> El sistema no llama a tu cartera y marca el campo con «Introduce un precio mayor que 0.»</li><li><strong>El precio es demasiado bajo.</strong> Verás «El precio está por debajo del mínimo de reventa que fija el hotel.» Hay un precio mínimo de reventa (en esta red de pruebas arranca en 0,01 ETH, pero la pantalla no te lo muestra). Sube la cifra y vuelve a intentarlo.</li><li><strong>Pusiste demasiados decimales.</strong> Si escribes un precio con más de 18 decimales, la operación falla antes de llegar a tu cartera. El texto exacto que verás está pendiente de confirmar; escribe una cifra con pocos decimales.</li><li><strong>La noche no es tuya.</strong> Aparece «No eres la propietaria de esta noche.» Solo se revende lo que está a tu nombre en ese momento.</li><li><strong>La noche ya pasó.</strong> Sale «La noche ha expirado y no puede listarse.» Ya no se puede revender.</li><li><strong>La noche ya se usó en recepción.</strong> El aviso es «Esta noche ya se consumió en recepción y no puede revenderse.»</li><li><strong>Intentas retirar algo que no está publicado.</strong> Sale «Esta noche no está en reventa.» Es una operación que ya no hace falta.</li><li><strong>Has cerrado la ventana de la cartera.</strong> Se lee «Has cancelado la firma. Puedes intentarlo de nuevo cuando quieras.» y el formulario sigue ahí.</li><li><strong>La operación no se completa.</strong> Aparece «No se pudo completar la operación. Revisa la red y vuelve a intentarlo.» Si el motivo no está en la lista anterior, el sistema no lo detalla: revisa tu conexión y reintenta.</li><li><strong>No se carga la lista.</strong> Sale «No se pudieron cargar tus reventas. Inténtalo de nuevo.» con el botón <strong>Reintentar</strong>, que repite la consulta.</li><li><strong>No ves la noche en la lista.</strong> Si la vendiste o la traspasaste, desaparece de <strong>Mis noches</strong>; es lo normal. Si crees que sigue siendo tuya, recarga la página.</li><li><strong>El estado no cambia después de firmar.</strong> La tarjeta se refresca sola y vuelve a leer la información del registro del hotel. Si aun así no cambia, recarga la página.</li><li><strong>El hotel pone el sistema en pausa.</strong> Publicar y retirar siguen funcionando, porque la pausa no bloquea esas dos operaciones. Comprar una reventa sí queda bloqueado.</li><li><strong>Ya tenías la noche publicada con un precio bajo.</strong> Un anuncio ya publicado no se toca solo aunque cambie el mínimo del hotel: el mínimo solo se mira al publicar. Si quieres subirlo, usa <strong>Cambiar precio</strong>.</li><li><strong>El sistema no reconoce el motivo del fallo.</strong> Cuando el error no es uno de los anteriores, solo verás el mensaje genérico «No se pudo completar la operación. Revisa la red y vuelve a intentarlo.» y el detalle no aparece en pantalla.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Puedo cambiar el precio sin retirar la noche primero?</strong> Sí: pulsa <strong>Cambiar precio</strong>, escribe la cifra nueva y firma; el precio anterior se sustituye.</li><li><strong>¿Qué se queda el hotel de la venta?</strong> Un porcentaje del precio: un 5 % en habitaciones simples y dobles y un 10 % en suites.</li><li><strong>¿Cuándo cobro mi dinero?</strong> Queda en <strong>Saldo pendiente</strong> y lo cobras con el botón <strong>Cobrar</strong> cuando quieras.</li><li><strong>¿Puedo revender una noche que no compré?</strong> No: solo se revende una noche que ya tuvo una venta; el inventario del hotel no entra por aquí.</li><li><strong>¿Es una venta al público de verdad?</strong> De momento todo ocurre en una red de pruebas del hotel, no es una venta al público.</li></ul>",
      },
    ],
  },
  {
    slug: "09-avisos-de-tu-reventa",
    order: 9,
    moment: "si-te-sobra-la-noche",
    title: "Entérate cuando se mueve tu reventa",
    lead: "<blockquote><p>Es para ti, que tienes una noche puesta en venta en el Hotel Marina del Sol y quieres saber en cuanto se venda. Tienes dos avisos: un cartel dentro de la web y, si lo activas, una notificación en el móvil.</p></blockquote>",
    image: null,
    source: "docs/Manuales/06-huesped/09-avisos-de-tu-reventa.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Abre <strong>Mis noches</strong> y pulsa <strong>Ir a Mis reventas</strong>.</li><li>Baja hasta el bloque <strong>Avisos al móvil</strong>.</li><li>Pulsa <strong>Activar avisos</strong>.</li><li>Acepta el permiso de notificaciones que te pide el navegador.</li><li>El botón cambia a <strong>Desactivar avisos</strong>: ya está activado.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li>Abre <strong>Mis noches</strong>. Si te falta conectar la cartera o estás en otra red, verás «Conecta tu wallet para gestionar tus reventas.» (la wallet o cartera es la aplicación donde guardas tus monedas digitales) con la barra de conexión.</li><li>Mientras carga, se lee «Cargando tus reventas…».</li><li>Si hay reventas nuevas desde tu última visita, arriba del todo aparece el cartel «Tienes N reventa(s) nueva(s) desde tu última visita.», con el número que corresponda en lugar de la N, y el botón <strong>Marcar como vistas</strong>.</li><li>Pulsa <strong>Marcar como vistas</strong>. El cartel desaparece y el contador vuelve a cero.</li><li>En la sección <strong>Publicadas</strong> ves las noches que tienes en venta, con el enlace <strong>Publicar otra noche</strong>. Si no hay ninguna, se lee «No tienes ninguna noche publicada ahora mismo.»</li><li>Baja a la sección <strong>Vendidas</strong>. Es una tabla con tres columnas: <strong>Noche</strong>, <strong>Precio</strong> y <strong>Comprador</strong>. Si todavía no has vendido nada, se lee «Todavía no has vendido ninguna noche.»</li><li>Cada fila muestra la fecha y la habitación, el precio en ETH y la dirección del comprador acortada.</li><li>Si te queda dinero pendiente de reventas ya vendidas, aparece el panel de cobro.</li><li>Para el aviso al móvil, baja al bloque <strong>Avisos al móvil</strong>, que está al final de la pantalla, debajo del saldo pendiente, y pulsa <strong>Activar avisos</strong>. Mientras trabaja, el botón pone <strong>Procesando…</strong>: está registrando tu dispositivo, espera un momento.</li><li>El navegador te pide permiso de notificaciones. Acepta.</li><li>El sistema registra tu dispositivo y el botón cambia a <strong>Desactivar avisos</strong>. Ese rótulo solo aparece cuando el aviso ya está activo en ese navegador.</li><li>Cuando se venda una noche, el móvil muestra una notificación con el título <strong>Noche vendida</strong> y, debajo, la habitación y el tipo de noche.</li><li>Si pulsas la notificación, el navegador abre la página del histórico de ventas.</li><li>Para dejar de recibirlos, vuelve a pulsar el botón, ahora <strong>Desactivar avisos</strong>.</li><li>Recuerda que el aviso al móvil es un extra que puede fallar: la lista de <strong>Mis reventas</strong> es la que siempre está al día.</li><li>Además del aviso, el sistema manda un correo al hotel cuando se vende una noche. Ese correo es para el hotel, no para ti.</li></ol>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>Tu navegador no admite avisos.</strong> En lugar del botón se lee «Tu navegador no admite avisos push.» El cartel dentro de la web sigue funcionando; si quieres el aviso en el móvil, prueba con otro navegador.</li><li><strong>No se activan los avisos.</strong> Verás «No se pudieron activar los avisos.» Suele ser que bloqueaste las notificaciones: míralo en los ajustes de notificaciones del navegador y vuelve a intentarlo.</li><li><strong>Has denegado el permiso.</strong> El sistema no puede volver a pedírtelo solo; tienes que permitir las notificaciones en los ajustes del navegador.</li><li><strong>Sigue sin activarse.</strong> Si el aviso de error se repite, puede ser cosa de la configuración del servidor del hotel, no de tu móvil. No es algo que puedas arreglar tú: avisa al personal del hotel.</li><li><strong>No se carga la lista.</strong> Sale «No se pudieron cargar tus reventas. Inténtalo de nuevo.» con el botón <strong>Reintentar</strong>.</li><li><strong>No te has enterado de una venta.</strong> El aviso al móvil es un extra y su entrega puede fallar. Entra en <strong>Mis reventas</strong> y mira la tabla <strong>Vendidas</strong>.</li><li><strong>Te avisan de una venta que no es tuya.</strong> El aviso al móvil se manda a todos los dispositivos suscritos, así que puede llegarte una venta ajena. El cartel de la web, en cambio, solo cuenta tus reventas.</li><li><strong>Cambiaste de móvil o de navegador.</strong> La marca de «visto» se guarda en cada navegador: en uno nuevo, las ventas antiguas cuentan como nuevas.</li><li><strong>Te falta la cartera.</strong> Sin cartera conectada o en otra red no se carga nada: aparece «Conecta tu wallet para gestionar tus reventas.» y la barra de conexión.</li><li><strong>La notificación abre otra página.</strong> La notificación lleva a la página del histórico de ventas, no a <strong>Mis reventas</strong>; es lo previsto.</li><li><strong>El aviso al móvil falla y la venta sigue igual.</strong> El envío al móvil es un extra: si no llega, el sistema lo registra y la venta no se bloquea. Mira <strong>Vendidas</strong> en <strong>Mis reventas</strong>.</li><li><strong>La notificación no lleva tus datos.</strong> Solo lleva el título <strong>Noche vendida</strong>, la habitación y el tipo de noche.</li><li><strong>Tu suscripción ya no existe.</strong> Si el servicio de avisos contesta que ese dispositivo ya no está, el sistema borra la suscripción y deja de intentarlo. Vuelve a pulsar <strong>Activar avisos</strong>.</li><li><strong>El aviso no llega a un dispositivo nuevo.</strong> Los avisos se activan navegador a navegador: el que no hayas activado no recibe nada.</li><li><strong>El cartel no aparece.</strong> Solo sale cuando hay alguna reventa nueva desde tu última visita. Si no hay ninguna, el botón <strong>Marcar como vistas</strong> tampoco está.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Me avisan por correo electrónico?</strong> No: el correo del sistema va al hotel. A ti te avisan el cartel de la web y, si lo activas, el móvil.</li><li><strong>¿Guardáis mi teléfono o mi correo?</strong> No. La suscripción de avisos no lleva tu nombre, ni tu correo, ni tu teléfono.</li><li><strong>¿Puedo desactivar el aviso?</strong> Sí, con <strong>Desactivar avisos</strong>, cuando quieras.</li><li><strong>¿A dónde me lleva la notificación?</strong> A la página del histórico de ventas del hotel.</li><li><strong>¿Qué pone la notificación?</strong> El título <strong>Noche vendida</strong> y, debajo, la habitación y el tipo de noche.</li></ul>",
      },
    ],
  },
  {
    slug: "10-entrar-con-tu-qr",
    order: 10,
    moment: "durante-la-estancia",
    title: "Entra en el hotel con tu resguardo QR",
    lead: "<blockquote><p>Es para ti, que llegas al Hotel Marina del Sol con una noche tuya. Desde <strong>Mis noches</strong> generas un resguardo con código QR, lo enseñas en recepción y el personal registra tu entrada. Tú no tocas el panel de recepción.</p></blockquote>",
    image: "doc-huesped-flujo-checkin.svg",
    source: "docs/Manuales/06-huesped/10-entrar-con-tu-qr.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Conecta tu cartera (la aplicación donde guardas tus monedas digitales) y ponla en la red del hotel.</li><li>Abre <strong>Mis noches</strong> y busca la tarjeta de tu noche.</li><li>En el bloque <strong>Resguardo de check-in</strong>, pulsa <strong>Ver mi resguardo QR</strong>.</li><li>Firma en tu cartera cuando te lo pida. Es para comprobar que la noche es tuya.</li><li>Enseña el código QR (o el texto del token) en recepción.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li>Abre <strong>Mis noches</strong> y busca la tarjeta de tu noche. Dentro verás el bloque <strong>Resguardo de check-in</strong> con la explicación «Genera el resguardo de esta noche para enseñarlo en recepción. Te pediremos una firma para comprobar que la noche es tuya.»</li><li>Pulsa <strong>Ver mi resguardo QR</strong>. Mientras trabaja, el botón pasa a <strong>Generando resguardo…</strong>.</li><li>Firma en tu cartera. Esa firma solo sirve para demostrar que la noche está a tu nombre y caduca en pocos minutos; si tardas, te pedirá firmar otra vez.</li><li>Aparece el código QR, con la descripción «Código QR del resguardo de la habitación» y el número de habitación y la fecha. Debajo se lee «Válido hasta el» con la fecha y la frase «Cada resguardo sirve una sola vez.»</li><li>Tienes tres botones: <strong>Descargar el QR</strong> para guardar la imagen, <strong>Abrir la pantalla de recepción</strong> para verlo a pantalla completa y <strong>Ocultar</strong> para cerrar el bloque.</li><li>En el mismo bloque está el área <strong>Token del resguardo (para el camino manual)</strong>, con la nota «Recepción puede pegar este texto si el escáner no funciona.» Ese texto largo es tu resguardo: tenlo a mano.</li><li>Si pulsas <strong>Abrir la pantalla de recepción</strong>, llegas a una pantalla con la cabecera <strong>Resguardo de check-in</strong> y el aviso «Muestra esta pantalla en recepción. El personal escaneará el código con su lector.»</li><li>En esa pantalla ves la habitación, la línea <strong>Noche:</strong> con la fecha, el QR grande y la nota «Personal de recepción: escanee el código o pegue el token en la pantalla de recepción. El resguardo solo se puede canjear una vez.»</li><li>Si el dibujo del QR fallara, verás «No se pudo dibujar el código QR, pero el resguardo sigue valiendo: copia el token y enséñalo en recepción.» El resguardo no se pierde.</li><li>En esa misma pantalla, el desplegable <strong>¿No funciona el escáner? Muestra este token</strong> enseña el texto para copiarlo.</li><li>Entrega el resguardo en recepción. El recepcionista abre el panel del día, entra en la pestaña <strong>Check-in</strong>, pega el texto en el área <strong>Token JWS o URL del resguardo</strong> y pulsa <strong>Confirmar check-in</strong>.</li><li>Si todo cuadra, aparece el aviso verde <strong>Check-in confirmado</strong>, con la habitación y la fecha y la línea «Anclado on-chain» con el enlace al comprobante (es el registro público del hotel). Tu habitación queda <strong>OCUPADA</strong>.</li><li>Aviso importante: en la versión actual no hay lector de cámara. Aunque las pantallas hablen de «escanear», lo que funciona de verdad es que recepción pegue el texto del resguardo. Una foto del QR no sirve: hace falta el texto.</li><li>El resguardo vale 7 días desde que lo generas, y sirve una sola vez.</li><li>Dentro del resguardo van tu habitación, la fecha y la dirección de tu cartera: no vale para otra noche ni para otra persona.</li><li>Cada resguardo lleva un identificador único, así que no se puede canjear dos veces aunque alguien copie el texto.</li></ol><p>Así se ve el recorrido, de un vistazo:</p><figure><img src=\"/manual/imagenes/doc-huesped-flujo-checkin.svg\" alt=\"Esquema del check-in: generas el resguardo, lo enseñas en recepción y registran tu entrada\" loading=\"lazy\" /><figcaption>Esquema del check-in: generas el resguardo, lo enseñas en recepción y registran tu entrada</figcaption></figure>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>No tienes la cartera conectada.</strong> No se puede generar nada: verás «Conecta tu cartera para obtener el resguardo.» Conecta la cartera y vuelve a intentarlo.</li><li><strong>Cierras la ventana de la cartera.</strong> Se lee «Firma cancelada en tu cartera.» No es un fallo: repite el paso y firma.</li><li><strong>La firma caduca o se repite.</strong> La firma dura muy poco y solo se puede usar una vez. Si reutilizas una, el sistema responde «Esta autorización ya se utilizó; firma una nueva.» Vuelve a pulsar <strong>Ver mi resguardo QR</strong>.</li><li><strong>Ya no eres el dueño de la noche.</strong> Si la vendiste o la traspasaste, el resguardo se rechaza porque la noche ya no está a tu nombre. El titular nuevo es quien debe generar su propio resguardo.</li><li><strong>La noche ya no existe.</strong> La respuesta es «Esa noche no existe (quemada o nunca emitida).» No se puede emitir resguardo para esa noche.</li><li><strong>No se pudo emitir el resguardo.</strong> Aparece «No se pudo emitir el resguardo. Inténtalo de nuevo.» Revisa tu conexión y reintenta; si el sistema da un motivo concreto, lo verás en pantalla.</li><li><strong>Abres la pantalla de recepción sin resguardo.</strong> Sale «Esta página no tiene ningún resguardo. Abre el enlace que generaste desde «Mis noches».» con el botón <strong>Ir a Mis noches</strong>.</li><li><strong>El resguardo ya se usó.</strong> El recepcionista lee «Este resguardo ya se utilizó para un check-in; cada pase sirve una sola vez.» Genera uno nuevo desde <strong>Mis noches</strong>.</li><li><strong>El resguardo es de otra persona.</strong> Sale «El resguardo corresponde a un propietario anterior de la noche; el titular actual debe emitir uno nuevo.» El titular actual tiene que generar el suyo.</li><li><strong>Otra persona está registrando tu entrada a la vez.</strong> El aviso es «Otro puesto está procesando el check-in de esta noche; espera unos segundos y reinténtalo.» Espera un momento y repite.</li><li><strong>Tu habitación ya tenía la entrada hecha.</strong> El sistema dice que esa habitación ya hizo el check-in. Si crees que es un error, dilo en el mostrador.</li><li><strong>El hotel tiene las operaciones en pausa.</strong> El panel de recepción avisa de que no se puede registrar ningún check-in hasta que el hotel reanude las operaciones. No es un problema de tu resguardo: espera a que lo reanuden.</li><li><strong>El resguardo se emitió y luego vendiste la noche.</strong> El resguardo vive días y vale para el dueño del momento; si la noche cambia de manos, el titular nuevo debe emitir otro.</li><li><strong>No se pudo comprobar que la noche es tuya.</strong> La emisión se corta y no entrega resguardo en lugar de darte uno sin comprobar. Suele ser un problema momentáneo de conexión con el registro del hotel: espera y vuelve a intentarlo.</li><li><strong>Cierras la pantalla del resguardo.</strong> El resguardo sigue valiendo hasta su fecha. Puedes volver a <strong>Mis noches</strong> y generar otro cuando lo necesites.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Cuánto dura el resguardo?</strong> 7 días desde que lo generas, y solo se puede usar una vez.</li><li><strong>¿Sirve una foto del código QR?</strong> No en la versión actual: hace falta el texto del token.</li><li><strong>¿Puedo usarlo desde el móvil de otra persona?</strong> Sí: la pantalla del resguardo no pide cartera, así que puedes abrir el enlace en otro dispositivo.</li><li><strong>¿A qué hora puedo entrar en la habitación?</strong> &lt;!-- PENDIENTE DEL CLIENTE: hora oficial de entrada del hotel --&gt;</li><li><strong>¿Caduca la firma que me pide?</strong> Sí: dura unos dos minutos. Si tardas, te pedirá firmar otra vez; no has perdido nada.</li></ul>",
      },
    ],
  },
  {
    slug: "11-extras-durante-la-estancia",
    order: 11,
    moment: "durante-la-estancia",
    title: "Extras y cargos durante tu estancia",
    lead: "<blockquote><p>Es para ti, que estás alojado en el Hotel Marina del Sol y consumes un extra (minibar, desayuno, late check-out…). No tienes que tocar ninguna pantalla: recepción lo apunta en la cuenta de tu estancia.</p></blockquote>",
    image: null,
    source: "docs/Manuales/06-huesped/11-extras-durante-la-estancia.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Consume el extra con normalidad.</li><li>No abras ninguna pantalla ni firmes nada: el apunte lo hace recepción.</li><li>Si quieres repasar lo apuntado, pídelo en el mostrador: el desglose se lee en la pantalla de recepción.</li><li>Al irte, recepción cancela los cargos que no se cobran y cierra tu cuenta.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<p>Lo que haces tú:</p><ol><li>Consumes el extra (por ejemplo, algo del minibar o un desayuno). No hay ninguna pantalla del huésped para esto.</li><li>No firmas ninguna operación: los cargos no tocan tu cartera ni la red del hotel.</li><li>Si quieres repasar la cuenta antes de irte, pídelo en el mostrador. El desglose se lee en la pantalla de recepción, no en tu móvil.</li><li>Si ves un cargo que no es tuyo, dilo en el mostrador antes de cerrar la cuenta. Un cargo no se puede editar ni borrar: la única corrección es cancelarlo al cerrar la cuenta y, si toca, apuntar otro.</li></ol><p>Lo que hace recepción delante de ti:</p><ol><li>Entra en el <strong>Puesto de recepción</strong>, en la pestaña <strong>Check-out</strong>, y elige tu estancia en el desplegable <strong>Estancia con entrada registrada</strong>. Solo salen las estancias con la entrada ya registrada.</li><li>En <strong>Cargos adicionales</strong> aparece la lista. Si no hay ninguno, se lee «Esta estancia no tiene cargos.»</li><li>Cada fila muestra el concepto, el importe con dos decimales y la moneda, más la etiqueta <strong>Pendiente</strong> o <strong>Cancelado</strong>. Los cargos nuevos nacen como <strong>Pendiente</strong>.</li><li>Para apuntar un extra, recepción pulsa <strong>Añadir cargo</strong>, escribe el <strong>Concepto</strong> y el <strong>Importe (EUR)</strong> y confirma. Si falta el concepto o el importe no es mayor que cero, el sistema avisa «Indica un concepto y un importe mayor que cero.» y no apunta nada.</li><li>El cargo nuevo queda arriba de la lista, porque la lista va del más reciente al más antiguo.</li><li>Si un cargo no se cobra, se marca su casilla. Solo las filas <strong>Pendiente</strong> llevan casilla.</li><li>Antes de cerrar, el contador avisa «Se cancelarán X de Y cargos pendientes.»</li><li>Al confirmar el cierre, el sistema cancela esos cargos y deja los demás apuntados. El recibo dice cuántos se cancelaron.</li><li>Conviene que sepas que el sistema <strong>no cobra</strong>: no hay pasarela de pago ni cargo a tu cartera. El cobro se resuelve aparte, en el mostrador (pendiente de confirmar cómo).</li><li>El apunte se guarda en euros y con el usuario de recepción que lo hizo, no con tus datos personales.</li><li>Mientras la estancia siga abierta, puedes pedir el desglose tantas veces como quieras.</li><li>Se pueden apuntar varios cargos seguidos: cada uno se guarda por separado y el último queda arriba.</li><li>En la pantalla solo verás dos etiquetas, <strong>Pendiente</strong> o <strong>Cancelado</strong>: no hay ninguna marca de «ya pagado».</li></ol>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>Esperabas ver tus cargos en el móvil o en la web.</strong> Hoy no existe ninguna pantalla del huésped para los cargos: solo se ven en el puesto de recepción. Si el hotel va a añadir una vista para ti, está pendiente de confirmar.</li><li><strong>Un cargo está mal apuntado.</strong> No hay forma de editarlo ni de borrarlo. La única solución es cancelarlo al cerrar la cuenta y apuntar otro si corresponde.</li><li><strong>El importe no se acepta.</strong> El sistema exige un número mayor que cero; si no, recepción ve «Indica un concepto y un importe mayor que cero.» No se envía nada.</li><li><strong>El concepto es larguísimo.</strong> Si pasa de 120 caracteres, el sistema lo rechaza con «El concepto es obligatorio (máx. 120 caracteres).» Que recepción lo acorte.</li><li><strong>La estancia no aparece en el desplegable.</strong> Solo salen las estancias con la entrada ya registrada. Si falta tu entrada, hay que registrarla antes (para eso sirve tu resguardo QR).</li><li><strong>La lista de cargos no se actualiza.</strong> La pantalla de recepción no avisa cuando falla la lectura: simplemente deja de refrescar. Pide que recarguen el panel.</li><li><strong>Un cargo se canceló sin querer.</strong> Cancelar solo funciona en un sentido: no hay botón para volver a activarlo. Habrá que apuntar el cargo de nuevo, y solo mientras la estancia siga abierta.</li><li><strong>No hay catálogo de precios en el sistema.</strong> El concepto lo escribe recepción a mano y el importe lo teclea, así que los precios de los extras no están en la plataforma: pregúntalos en el mostrador.</li><li><strong>El sistema se queda a medias.</strong> Si algo falla de forma imprevista, la pantalla muestra «Se produjo un error. Inténtalo de nuevo.» No es un problema de tu noche.</li><li><strong>Nadie te pide firma ni tarjeta en pantalla.</strong> Si alguien te dice que firmes un cargo en la web, no es este sistema: los cargos no se firman.</li><li><strong>Un cargo aparece como Pendiente.</strong> Es su estado normal: está apuntado y se resolverá al cerrar la cuenta.</li><li><strong>Tus datos no viajan en el cargo.</strong> El apunte guarda el concepto, el importe y el usuario de recepción; no tu nombre, ni tu correo, ni tu teléfono.</li><li><strong>Los cargos no van a la red del hotel.</strong> Viven en la base de datos interna del hotel; a la red solo va la entrada.</li><li><strong>La cuenta ya está cerrada.</strong> Una vez cerrada la estancia, el sistema no permite añadir ni cancelar cargos; hay que avisar a administración.</li><li><strong>Buscas un cargo antiguo.</strong> La lista va del más reciente al más antiguo, así que los primeros apuntes están al final.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Tengo que hacer algo para que me cobren el extra?</strong> No: lo apunta recepción cuando lo consumes.</li><li><strong>¿Puedo apuntar un extra yo mismo?</strong> No. Solo recepción puede darlo de alta.</li><li><strong>¿Puedo ver mis cargos en la web?</strong> No; hoy solo se ven en la pantalla de recepción.</li><li><strong>¿Qué precios tienen los extras?</strong> &lt;!-- PENDIENTE DEL CLIENTE: catálogo de extras del hotel y sus precios --&gt;</li><li><strong>¿Se puede borrar un cargo equivocado?</strong> No se edita ni se borra: se cancela al cerrar la cuenta.</li></ul>",
      },
    ],
  },
  {
    slug: "12-salir-y-cerrar-la-cuenta",
    order: 12,
    moment: "durante-la-estancia",
    title: "Sal del hotel y cierra tu cuenta",
    lead: "<blockquote><p>Es para ti, que terminas tu estancia en el Hotel Marina del Sol. Tú entregas la habitación y las llaves; recepción revisa cómo quedó, cancela los cargos que no se cobran y cierra la cuenta. Tú no firmas nada.</p></blockquote>",
    image: "doc-huesped-flujo-checkout.svg",
    source: "docs/Manuales/06-huesped/12-salir-y-cerrar-la-cuenta.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Recoge tus cosas y entrega la habitación y las llaves.</li><li>Si quieres repasar la cuenta, pídelo en el mostrador.</li><li>Espera a que recepción cierre la estancia en su pantalla.</li><li>No hay nada que firmar: la salida no pide cartera ni firma.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<p>Lo que haces tú:</p><ol><li>Recoges tus cosas y entregas la habitación y las llaves. No abres ninguna pantalla.</li><li>El resguardo QR que usaste para entrar ya se gastó en la entrada: aquí no hace falta.</li><li>Si quieres repasar la cuenta, se te enseña el desglose en el mostrador. No existe una vista de huésped que lea los cargos.</li><li>Esperas a que recepción cierre la estancia. El cierre lo hace el personal, no tú.</li></ol><p>Lo que hace recepción delante de ti:</p><ol><li>Entra en el <strong>Puesto de recepción</strong> y pulsa la pestaña <strong>Check-out</strong>. Ahí solo salen las estancias con la entrada ya registrada.</li><li>Elige tu estancia en el desplegable <strong>Estancia con entrada registrada</strong>. Debajo se confirma con «Estancia de la habitación» y la fecha.</li><li>En <strong>Cargos adicionales</strong> se ve la lista: concepto, importe, moneda y la etiqueta <strong>Pendiente</strong> o <strong>Cancelado</strong>.</li><li>Tú dices qué cargos no se cobran y recepción marca sus casillas. El contador avisa «Se cancelarán X de Y cargos pendientes.»</li><li>Pulsa <strong>Confirmar check-out</strong> y se abre la ventana <strong>Confirmar check-out</strong> con el aviso «Verifica la habitación y cancela los cargos que correspondan antes de cerrar la estancia.»</li><li>En <strong>Verificación de la habitación</strong> se marca <strong>Sin incidencias</strong> o <strong>Con incidencia</strong>. Si hay incidencia, se elige el tipo (Daños, Falta de limpieza, Objeto olvidado, Minibar consumido, Avería u Otro) y se puede escribir una descripción.</li><li>También se pueden añadir <strong>Notas (opcional)</strong>.</li><li>Al confirmar, aparece el recibo verde <strong>Check-out registrado</strong> y la línea con los cargos cancelados. Si otro puesto se adelantó, se lee «Esta estancia ya tenía el check-out registrado.»</li><li>Después, tu habitación queda <strong>Pendiente de limpieza</strong> hasta que recepción la libere. Es lo normal: la habitación no vuelve a estar disponible hasta que se limpia.</li><li>Cosas que conviene saber: la salida no se anota en la red del hotel (solo la entrada), no hay pasarela de pago y el sistema no cobra. El cobro se resuelve aparte, en el mostrador (pendiente de confirmar cómo).</li><li>El cierre no se puede deshacer. Si se elige la estancia equivocada, hay que avisar a administración antes de tocar nada más.</li><li>Si no hay ningún cargo, en la lista se lee «Esta estancia no tiene cargos.» y el recibo indicará cero cancelaciones.</li></ol><p>Así se ve el recorrido, de un vistazo:</p><figure><img src=\"/manual/imagenes/doc-huesped-flujo-checkout.svg\" alt=\"Esquema de la salida: entregas la habitación, recepción revisa, cancela cargos y cierra la cuenta\" loading=\"lazy\" /><figcaption>Esquema de la salida: entregas la habitación, recepción revisa, cancela cargos y cierra la cuenta</figcaption></figure>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>Tu entrada no estaba registrada.</strong> Si recepción intenta cerrar una noche sin la entrada hecha, ve «Solo puede hacerse el check-out de una estancia con la entrada ya registrada.» Hay que registrar antes la entrada con tu resguardo QR.</li><li><strong>Tu estancia no sale en el desplegable.</strong> Es la misma causa: solo aparecen las estancias con la entrada registrada. Revisa en el mostrador que tu entrada está hecha.</li><li><strong>Otro puesto ya cerró tu cuenta.</strong> Verás «Esta estancia ya tenía el check-out registrado.» No se duplica la salida; es un aviso, no un error.</li><li><strong>La pantalla de recepción no carga.</strong> Se lee «No se pudo cargar el panel. Revisa la conexión e inténtalo de nuevo.» Que lo recarguen; tu cuenta no se ve afectada.</li><li><strong>La lista de cargos no se actualiza.</strong> La pantalla de recepción no avisa cuando falla esa lectura: simplemente deja de refrescar. Pide que recarguen el panel.</li><li><strong>Un cargo se canceló y no debía.</strong> Cancelar solo funciona en un sentido y no hay botón para reactivarlo. Hay que apuntarlo otra vez, y solo si la estancia sigue abierta.</li><li><strong>La cuenta se cerró con la estancia equivocada.</strong> No hay forma de deshacerlo desde el sistema. Hay que avisar a administración, sin tocar nada más.</li><li><strong>La habitación no se puede liberar.</strong> Si no está pendiente de limpieza, el sistema responde «La habitación está en estado X; no se puede liberar.» Es una tarea de recepción: espera a que la limpien.</li><li><strong>No aparece el cobro por ninguna parte.</strong> Es lo previsto: el sistema apunta y cancela cargos, pero no cobra ni genera un recibo de pago. No te pedirá ninguna firma ni ningún dato de tarjeta.</li><li><strong>Quieres saber a qué hora tienes que dejar la habitación.</strong> El sistema no fija ninguna hora de salida. &lt;!-- PENDIENTE DEL CLIENTE: hora oficial de salida del hotel --&gt;</li><li><strong>Quieres saber cómo se devuelven las llaves o cómo se paga.</strong> Eso tampoco está en el sistema. &lt;!-- PENDIENTE DEL CLIENTE: procedimiento de devolución de llaves y de cobro en el mostrador --&gt;</li><li><strong>La cuenta ya está cerrada y falta cancelar un cargo.</strong> Una vez cerrada la estancia, el sistema no permite corregir cargos: hay que avisar a administración.</li><li><strong>No hay cargos que revisar.</strong> Si la estancia no tiene ninguno, la lista lo dice con «Esta estancia no tiene cargos.» y el recibo marca cero cancelaciones.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Tengo que firmar algo para salir?</strong> No: la salida no pide firma ni cartera.</li><li><strong>¿Me cobra el sistema al salir?</strong> No; solo apunta y cancela cargos. El cobro se hace aparte, en el mostrador.</li><li><strong>¿Puedo volver atrás si cierran mi cuenta por error?</strong> No hay forma de deshacerlo; hay que avisar a administración.</li><li><strong>¿A qué hora tengo que dejar la habitación?</strong> &lt;!-- PENDIENTE DEL CLIENTE: hora oficial de salida del hotel --&gt;</li><li><strong>¿Qué pasa con la habitación después?</strong> Queda como <strong>Pendiente de limpieza</strong> hasta que recepción la libere.</li></ul>",
      },
    ],
  },
  {
    slug: "13-dejar-una-resena",
    order: 13,
    moment: "despues",
    title: "Deja una reseña de tu noche",
    lead: "<blockquote><p>Es para huéspedes que ya han dormido en el hotel y quieren contar cómo fue.</p> Sirve para puntuar la noche y dejar tu opinión.</blockquote>",
    image: null,
    source: "docs/Manuales/06-huesped/13-dejar-una-resena.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Conecta tu cartera en la web: pulsa <strong>Conectar wallet</strong> y aprueba en tu móvil.</li><li>Entra en <strong>Mis noches</strong> y abre la pestaña <strong>Pasadas</strong>.</li><li>Busca la noche y pulsa <strong>Dejar reseña</strong>.</li><li>Elige las estrellas y escribe tu comentario.</li><li>Pulsa <strong>Enviar reseña</strong> y firma en tu cartera.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li>Conecta tu cartera (la aplicación del móvil que guarda tus llaves) y comprueba que estás en la red de la aplicación. Si no, verás <strong>Cambiar de red</strong>.</li><li>Entra en <strong>Mis noches</strong>. Arriba verás dos pestañas: <strong>Próximas</strong> y <strong>Pasadas</strong>.</li><li>Abre <strong>Pasadas</strong>. Solo las noches que ya has dormido se pueden reseñar.</li><li>Cada noche pasada tiene un botón <strong>Dejar reseña</strong>. Púlsalo.</li><li>Elige la nota en la lista: cinco estrellas, cuatro, tres, dos o una.</li><li>Escribe tu comentario. Puedes escribir hasta 1000 caracteres.</li><li>Pulsa <strong>Enviar reseña</strong>. Mientras trabaja, el botón pone <strong>Enviando…</strong>.</li><li>Tu cartera te pide una firma. Es para demostrar que la noche es tuya. Revisa y confirma.</li><li>Si todo va bien, verás este aviso: <strong>«Gracias. Tu reseña queda pendiente de revisión.»</strong> El formulario desaparece.</li><li>A partir de ahí, tu reseña queda <strong>pendiente</strong>. No se publica sola: espera a que el hotel la revise.</li><li>Si vuelves a esa noche, ya no te ofrece otra reseña: de cada noche solo se puede enviar una.</li></ol>",
      },
      {
        id: "que-pasa-despues",
        title: "Qué pasa después",
        level: 3,
        html: "<ol><li>El hotel revisa las reseñas pendientes desde su panel. Puede <strong>aprobarla</strong> o <strong>rechazarla</strong>.</li><li>Si la rechaza, puede dejar un motivo. En ese caso, tu reseña no se publica.</li><li>Si la aprueba, aparece en la página <strong>Reseñas</strong>. La portada muestra tres como resumen.</li><li>La página pública enseña la nota media y cuántas reseñas hay, con una forma parecida a «4,5 de 5 · 12 reseñas».</li><li>Las reseñas publicadas se ordenan de la más reciente a la más antigua. La página enseña hasta 60.</li><li>Tu reseña se publica sin tu nombre y sin tu número de habitación. Solo salen la nota, tu comentario, el tipo de habitación (<strong>simple</strong>, <strong>doble</strong> o <strong>suite</strong>) y la etiqueta <strong>Huésped verificado</strong>.</li><li>Si la fuente de datos no responde, la página pública se queda sin lista en lugar de inventarse opiniones.</li><li>El comentario es opcional: si lo dejas vacío, solo cuenta tu nota.</li></ol>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>«Solo puede reseñarse una noche ya consumida (check-out hecho).»</strong> La noche todavía no ha terminado. Espera a que recepción cierre tu estancia y vuelve a intentarlo.</li><li><strong>«Esta noche ya tiene una reseña enviada.»</strong> Ya la mandaste desde esa noche. No se puede enviar otra.</li><li><strong>«Esa noche no existe.»</strong> El sistema no encuentra esa noche. Comprueba que tienes conectada la cartera con la que la compraste.</li><li><strong>No se envía la reseña.</strong> Si no has elegido estrellas, el sistema no la acepta. Elige una nota entre 1 y 5 y vuelve a enviar.</li><li><strong>«El comentario no puede superar 1000 caracteres.»</strong> Tu texto es demasiado largo. Recórtalo y vuelve a enviar.</li><li><strong>«Firma cancelada en tu cartera.»</strong> Cerraste el aviso de la cartera sin firmar. Pulsa otra vez <strong>Enviar reseña</strong> y firma.</li><li><strong>«Conecta tu cartera para enviar la reseña.»</strong> Se ha desconectado la cartera. Vuelve a conectarla.</li><li><strong>«No se pudo enviar la reseña.»</strong> Falló la conexión. Comprueba que tienes internet y reinténtalo.</li><li><strong>«No se pudo registrar la reseña.»</strong> El problema es del sistema, no tuyo. Espera un momento y reinténtalo.</li><li><strong>No veo el botón «Dejar reseña».</strong> Solo aparece en las noches de la pestaña <strong>Pasadas</strong>. Si no ves tu noche, comprueba que la cartera conectada es la misma con la que la compraste.</li><li><strong>No puedo dejar una segunda reseña.</strong> Es lo previsto: hay una reseña por noche. Cambiar de cartera no lo evita.</li><li><strong>«Todavía no hay reseñas publicadas.»</strong> No es un error: el hotel aún no ha aprobado ninguna. Tu reseña puede ser la primera.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Puedo reseñar una noche que todavía no he dormido?</strong> No: solo las noches que ya han pasado y con el check-out hecho.</li><li><strong>¿Sale mi nombre en la reseña?</strong> No. Se publica la nota, tu comentario y el tipo de habitación.</li><li><strong>¿Cuántas reseñas puedo dejar por noche?</strong> Una sola. Si ya la enviaste, el sistema no deja enviar otra.</li><li><strong>¿Se publica sola al enviarla?</strong> No. Queda pendiente hasta que el hotel la aprueba.</li><li><strong>¿Cuándo aparece publicada mi reseña?</strong> Cuando el hotel la aprueba. Antes queda pendiente y solo la ve el hotel.</li><li><strong>¿Puedo cambiar una reseña ya enviada?</strong> Hoy la web no ofrece esa opción. Si te has equivocado, coméntalo en recepción.</li><li><strong>¿Puedo dejar solo la nota, sin comentario?</strong> Sí. El comentario es opcional.</li></ul>",
      },
    ],
  },
  {
    slug: "14-historico-de-ventas",
    order: 14,
    moment: "despues",
    title: "Mira el histórico de ventas del hotel",
    lead: "<blockquote><p>Es para cualquiera que quiera ver qué noches se han vendido y a qué precio.</p> No hace falta cartera, ni cuenta, ni iniciar sesión.</blockquote>",
    image: null,
    source: "docs/Manuales/06-huesped/14-historico-de-ventas.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Abre la página <strong>Histórico</strong>.</li><li>Verás las ventas de la más reciente a la más antigua.</li><li>Si quieres, pulsa <strong>Exportar CSV</strong> para descargar la lista.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li>Abre <strong>Histórico</strong> desde el menú de la web. No necesitas conectar nada.</li><li>La página se prepara de nuevo cada vez que la abres: siempre ves los datos del momento, sin copia guardada.</li><li>La primera fila de la lista es siempre la venta más reciente.</li><li>En una pantalla grande verás una tabla con estas columnas: <strong>Habitación</strong>, <strong>Noche</strong>, <strong>Tipo</strong>, <strong>Precio</strong>, <strong>Venta</strong>, <strong>Vendedor</strong>, <strong>Comprador</strong> y <strong>Transacción</strong>.</li><li>En el móvil, la tabla se convierte en tarjetas una debajo de otra, con cada dato con su etiqueta.</li><li>La columna <strong>Venta</strong> te dice de dónde sale la noche: <strong>Primaria</strong> (la vendió el hotel) o <strong>Reventa</strong> (la compró antes otro cliente y la revende).</li><li>Las carteras se ven acortadas, con una forma parecida a <code>0x1234…abcd</code>. Si pasas el ratón por encima, ves el identificador completo.</li><li>El <strong>Precio</strong> está en ETH, la moneda de esta red.</li><li>La fecha de la noche se ve como día/mes/año.</li><li>En la columna <strong>Transacción</strong> puede haber un enlace. Si lo hay, abre el detalle de la operación en otra pestaña. Si no lo hay, verás el código como texto con el identificador completo al pasar el ratón.</li><li>Pulsa <strong>Exportar CSV</strong> para descargar un fichero con todo el histórico. El fichero se llama <code>sales_history</code> seguido de una marca de tiempo.</li><li>El CSV trae 12 columnas: identificador de la noche, habitación, fecha de la noche, tipo, precio en ETH, precio en la unidad más pequeña, tipo de venta, vendedor, comprador, bloque, fecha de la operación y el código de la transacción.</li><li>El CSV descarga <strong>todo</strong> el histórico, no solo lo que ves en pantalla.</li><li>La tabla de la pantalla y el CSV leen de la misma fuente, así que no pueden decir cosas distintas.</li></ol>",
      },
      {
        id: "un-aviso-importante",
        title: "Un aviso importante",
        level: 3,
        html: "<p>Todo esto corre hoy en una <strong>red de pruebas</strong>. Sirve para practicar y comprobar que el sistema funciona. Las cifras que ves no valen dinero real.</p>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>«No se pudo cargar el histórico. Inténtalo de nuevo.»</strong> La fuente de datos no responde. Pulsa <strong>Reintentar</strong>.</li><li><strong>«Todavía no se ha registrado ninguna venta.»</strong> No es un error: aún no se ha vendido ninguna noche. Vuelve más tarde.</li><li><strong>La transacción no es un enlace.</strong> Esta red no tiene explorador configurado. Es normal: el código queda como texto para que lo copies a mano.</li><li><strong>Una venta no tiene fecha.</strong> Es un dato de una venta antigua que no se pudo recuperar. El sistema no se lo inventa: deja la fecha en blanco.</li><li><strong>El CSV no se descarga.</strong> La fuente que prepara el fichero no responde en ese momento. Vuelve a intentarlo más tarde.</li><li><strong>El navegador bloquea la descarga.</strong> Si no ves el fichero, revisa los avisos de tu navegador. El sistema no recibe ninguna respuesta en ese caso.</li><li><strong>La lista tarda o sale vacía un momento.</strong> Puede ser un corte momentáneo de conexión. Pulsa <strong>Reintentar</strong> o recarga la página.</li><li><strong>No veo una venta recién hecha.</strong> La lista se prepara en cada visita, así que recarga la página y vuelve a mirar.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Necesito una cartera para ver el histórico?</strong> No. La página es pública: se abre sin cartera y sin cuenta.</li><li><strong>¿Veo datos personales de otras personas?</strong> No. Solo direcciones de cartera, que son como un seudónimo, y los datos de la noche.</li><li><strong>¿El precio es en euros?</strong> No. Se muestra en ETH, la moneda de la red, y en esta red de pruebas no vale dinero real.</li><li><strong>¿Puedo descargar toda la lista?</strong> Sí. El botón <strong>Exportar CSV</strong> descarga el histórico completo.</li><li><strong>¿Por qué el CSV trae más columnas que la pantalla?</strong> Porque está pensado para quien quiere revisar los datos con detalle, incluido el precio en la unidad más pequeña.</li><li><strong>¿Por qué una venta antigua no tiene fecha?</strong> Porque ese dato no se pudo recuperar. El sistema lo deja vacío antes que poner una fecha falsa.</li><li><strong>¿Puedo abrir el detalle de una venta?</strong> Sí, si la red tiene explorador: el enlace abre la operación. Si no, el código queda como texto para copiarlo.</li><li><strong>¿Qué es eso de «Wei» que sale en el CSV?</strong> Es la unidad más pequeña de ETH. El CSV la incluye para que el dato sea exacto.</li></ul>",
      },
    ],
  },
  {
    slug: "15-tu-menu-de-cartera",
    order: 15,
    moment: "despues",
    title: "Tu menú de cartera y tu cuenta",
    lead: "<blockquote><p>Es el botón que está arriba a la derecha, en todas las páginas.</p> Desde ahí conectas tu cartera, cambias de red, la desconectas y ves tu cuenta.</blockquote>",
    image: null,
    source: "docs/Manuales/06-huesped/15-tu-menu-de-cartera.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Pulsa el botón de arriba a la derecha.</li><li>Elige tu cartera en la lista.</li><li>Aprueba el permiso en tu móvil.</li><li>Ya está: verás tu dirección acortada junto al botón.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li>El botón está arriba a la derecha y lleva un <strong>punto de color</strong>. Si el punto está encendido, hay una cartera conectada. Si está apagado, no.</li><li>Al lado del punto hay un título que cambia según el caso: <strong>Wallet no conectada</strong>, tu dirección acortada (con una forma parecida a <code>0x1234…abcd</code>) o tu nombre, si has iniciado sesión.</li><li>Pulsa el botón. Se abre un panel pequeño pegado a él y el foco se coloca en la primera opción.</li><li>Arriba del panel, el encabezado dice <strong>Billetera</strong> si no has iniciado sesión, o <strong>Sesión</strong> si la hay.</li><li>Si no tienes cartera conectada, verás la lista <strong>Elige tu billetera</strong>, con una entrada por cada cartera que tengas instalada, con su nombre y su icono.</li><li>Toca una cartera. Tu aplicación te pide permiso. Apruébalo y el panel se cierra solo.</li><li>Si no tienes ninguna cartera instalada, la web te lo dice y te ofrece un enlace para instalar MetaMask.</li><li>Con la cartera conectada y en la red correcta, la única acción de cartera es <strong>Desconectar wallet</strong>.</li><li>Si tu cartera está en <strong>otra red</strong>, la acción cambia a <strong>Cambiar de red</strong>. Al pulsarla, el sistema intenta añadir la red a tu cartera y cambiar a ella. Aprueba cuando te lo pida.</li><li>Al pie del panel puede aparecer el botón para <strong>conseguir dinero de prueba</strong>. Solo sale en el entorno de pruebas.</li><li>Cuando eliges una entrada del menú, el panel se cierra y te lleva a esa pantalla.</li></ol>",
      },
      {
        id: "si-trabajas-en-el-hotel",
        title: "Si trabajas en el hotel",
        level: 3,
        html: "<p>El mismo menú sirve para el personal. Si has iniciado sesión, el encabezado dice <strong>Sesión</strong>, aparece tu nombre y una insignia con tu tipo de usuario (por ejemplo <strong>OWNER</strong> o <strong>RECEPCIÓN</strong>), y el panel añade <strong>Tus suites</strong> con las pantallas de trabajo que te correspondan. Cada persona ve las suyas: el dueño las ve todas; recepción, front office; limpieza y mantenimiento, la suya; y los demás papeles de oficina entran por <strong>Administración</strong>. La cuenta del dueño ve también <strong>Usuarios</strong> y <strong>Roles</strong>. Cualquier persona con sesión tiene <strong>Seguridad y mis datos</strong> y <strong>Cerrar sesión</strong>. Sin sesión, la única entrada de navegación es <strong>Iniciar sesión</strong>.</p>",
      },
      {
        id: "como-se-cierra",
        title: "Cómo se cierra",
        level: 3,
        html: "<ul><li>Pulsa <strong>Escape</strong> y el panel se cierra. El foco vuelve al botón.</li><li>También se cierra si tocas fuera del panel, en la zona oscurecida.</li><li>Al elegir una entrada, el panel se cierra y vas a esa pantalla.</li></ul>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>«No detectamos una wallet web3.»</strong> No tienes ninguna cartera instalada. Pulsa el enlace para instalar MetaMask y vuelve a esta página.</li><li><strong>«Tu wallet aún no tiene esta red. Aprueba añadirla cuando MetaMask te lo pida y vuelve a intentarlo.»</strong> Tu cartera no conoce la red del hotel. Aprueba añadirla y repite.</li><li><strong>«Has cancelado el cambio de red. Para reservar, cambia a la red de la aplicación.»</strong> Cerraste el aviso sin aceptar. Vuelve a pulsar <strong>Cambiar de red</strong>.</li><li><strong>«No se pudo cambiar de red. Cámbiala manualmente en tu wallet a la red de la aplicación e inténtalo de nuevo.»</strong> Cámbiala a mano en tu cartera y recarga la página.</li><li><strong>No veo «Desconectar wallet».</strong> Es normal si estás en otra red: primero hay que cambiarla. Desconectar solo aparece cuando ya estás en la red correcta.</li><li><strong>No veo «Usuarios» ni «Roles».</strong> Son entradas solo para la cuenta del dueño del hotel.</li><li><strong>La sesión se ha cerrado sola.</strong> Por seguridad, las sesiones caducan. El menú vuelve al estado de visitante: inicia sesión otra vez.</li><li><strong>No aparece el botón del dinero de prueba.</strong> Falta configurarlo en este entorno, o tu cartera no está conectada en la red correcta.</li><li><strong>No aparece la lista de carteras.</strong> Tu navegador no detecta ninguna cartera instalada. Instálala y recarga la página.</li><li><strong>El menú solo enseña atajos.</strong> No decide permisos: cada pantalla comprueba por su cuenta si puedes entrar.</li><li><strong>No sé si estoy en la red correcta.</strong> Si no ves el aviso <strong>«Estás en la red equivocada.»</strong>, tu cartera está en la red buena.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Conectar mi cartera cuesta dinero?</strong> No. Conectar es gratis; solo se paga cuando firmas una compra y la confirmas.</li><li><strong>¿Puedo mirar la web sin conectar la cartera?</strong> Sí. Puedes ver el catálogo y el histórico; para comprar o revender necesitas la cartera.</li><li><strong>¿Qué significa el puntito de color?</strong> Encendido quiere decir que tu cartera está conectada; apagado, que no lo está.</li><li><strong>¿El menú decide lo que puedo hacer?</strong> No. El menú solo enseña atajos; cada pantalla comprueba por su cuenta si tienes permiso.</li><li><strong>¿Qué pasa si me equivoco de cartera?</strong> Puedes desconectarla y volver a conectarla con la correcta desde este mismo menú.</li><li><strong>¿Por qué a otra persona le salen más opciones?</strong> Porque tiene otro tipo de cuenta. Las pantallas de trabajo solo salen con sesión iniciada y con el permiso correspondiente.</li><li><strong>¿Puedo tener dos carteras conectadas a la vez?</strong> No. El menú trabaja con una cartera conectada cada vez; si cambias, se usa la nueva.</li></ul>",
      },
    ],
  },
  {
    slug: "16-dinero-de-prueba",
    order: 16,
    moment: "despues",
    title: "Consigue dinero de prueba (solo en el entorno de pruebas)",
    lead: "<blockquote><p>Es para el entorno de pruebas del hotel, no para el hotel real.</p> Sirve para practicar compras y reventas con dinero que no vale nada.</blockquote>",
    image: null,
    source: "docs/Manuales/06-huesped/16-dinero-de-prueba.md",
    sections: [
      {
        id: "empezar-en-5-minutos",
        title: "Empezar en 5 minutos",
        level: 2,
        html: "<ol><li>Conecta tu cartera y ponte en la red de la aplicación.</li><li>Busca el botón <strong>Conseguir ETH de prueba</strong>.</li><li>Púlsalo y firma con tu cartera.</li><li>Espera unos segundos y mira tu saldo.</li></ol>",
      },
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<ol><li>Entiende primero qué es esto: es dinero de mentira, de una red de pruebas. Es como el dinero del Monopoly. No se puede cambiar por euros ni sirve fuera de este entorno.</li><li>Conecta tu cartera (la aplicación del móvil que guarda tus llaves) y comprueba que estás en la red correcta. Si estás en otra red, el botón no aparece: cámbiala primero.</li><li>Busca el botón <strong>Conseguir ETH de prueba</strong>. Lo tienes arriba, junto a tu cartera conectada; también dentro del menú de la cartera, abajo del todo; y en el aviso de saldo insuficiente, cuando intentas reservar y no te llega.</li><li>Pulsa <strong>Conseguir ETH de prueba</strong>.</li><li>Tu cartera te pide una firma. Revisa lo que vas a firmar y confirma.</li><li>El botón te va contando el estado: primero <strong>Enviando ETH de prueba…</strong>, después la confirmación de la red.</li><li>Si sale bien, verás este aviso: <strong>«¡Listo! Recibiste ETH de prueba en tu wallet.»</strong></li><li>Mira tu saldo: habrá subido justo la cantidad que reparte el grifo, ni más ni menos. En el entorno de desarrollo son <strong>30 ETH de prueba</strong>.</li><li>Ya puedes usar ese saldo para firmar compras y reventas de práctica.</li><li>Cada cartera puede pedirlo <strong>una vez cada 24 horas</strong>.</li><li>Si vuelves a pulsar antes de tiempo, el sistema te dirá a qué hora puedes pedirlo otra vez.</li><li>Mientras el grifo no tenga dinero para una entrega, el botón se queda desactivado y pone <strong>Faucet sin fondos</strong>.</li></ol>",
      },
      {
        id: "cosas-que-conviene-saber",
        title: "Cosas que conviene saber",
        level: 3,
        html: "<ul><li>La cantidad es fija. No la eliges tú.</li><li>El grifo paga siempre a la cartera que firma. No puedes pedirlo para otra persona.</li><li>En el hotel real (producción) este botón no existe: no se despliega.</li><li>Si no ves el botón, es que este entorno no lo tiene configurado.</li><li>La hora que te dice para volver a pedirlo es la de tu reloj, así que puede ir con unos segundos de diferencia.</li></ul>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>No aparece el botón.</strong> Puede ser por tres motivos: este entorno no tiene grifo, no tienes la cartera conectada o estás en otra red. Conecta la cartera y cambia a la red de la aplicación.</li><li><strong>«Faucet sin fondos»</strong> o <strong>«El faucet se ha quedado sin fondos. Avisa al operador para que lo recargue.»</strong> El grifo se ha quedado sin dinero. No es culpa tuya: avisa a quien gestiona el entorno de pruebas.</li><li><strong>El botón está gris y no responde.</strong> O el grifo no tiene fondos, o ya hay una petición en marcha. Espera unos segundos y vuelve a mirar.</li><li><strong>«Ya solicitaste ETH hace poco. Vuelve a intentarlo a partir de las {hora}.»</strong> Ya lo pediste y aún no han pasado 24 horas. Espera a la hora que te indica.</li><li><strong>«No se pudo enviar ETH de prueba. Inténtalo de nuevo en unos segundos.»</strong> La operación no salió. Espera unos segundos y vuelve a intentarlo.</li><li><strong>Cancelas la firma en tu cartera.</strong> No se envía nada. Vuelve a pulsar el botón y firma esta vez.</li><li><strong>Firmas y no llega nada.</strong> A veces la red tarda un poco en reflejarlo. Espera un momento y refresca la página.</li><li><strong>El saldo sube menos de lo que esperabas.</strong> La cantidad del grifo es fija, no la eliges tú. Mira la cantidad configurada en este entorno.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Esto es dinero de verdad?</strong> No. Es dinero de una red de pruebas: no se cambia por euros ni sirve fuera de ese entorno.</li><li><strong>¿Cuánto me dan?</strong> En el entorno de desarrollo, 30 ETH de prueba por cartera. La cantidad es fija.</li><li><strong>¿Cada cuánto puedo pedirlo?</strong> Una vez cada 24 horas por cartera.</li><li><strong>¿Puedo pedirlo para otra persona?</strong> No. El grifo siempre paga a la cartera que firma la petición.</li><li><strong>¿Esto existe en el hotel real?</strong> No. En producción no se despliega: el botón no aparece.</li><li><strong>¿Para qué me sirve?</strong> Para pagar las comisiones y practicar compras y reventas sin arriesgar dinero de verdad.</li><li><strong>¿Me lo pueden quitar?</strong> No hay una opción para quitártelo; es dinero de pruebas y no vale nada, pero te sirve para practicar.</li></ul>",
      },
    ],
  },
  {
    slug: "17-si-algo-no-funciona",
    order: 17,
    moment: "cuando-algo-va-mal",
    title: "Si algo no funciona",
    lead: "<blockquote><p>Es una ayuda para cuando te atascas: la cartera, la red, una compra, el código QR</p> o una noche que se vende antes de que te dé tiempo a firmar.</blockquote><figure><img src=\"/manual/imagenes/doc-huesped-infografia-casos.svg\" alt=\"Mapa de todo lo que puedes hacer como huésped\" loading=\"lazy\" /><figcaption>Mapa de todo lo que puedes hacer como huésped</figcaption></figure>",
    image: "doc-huesped-infografia-casos.svg",
    source: "docs/Manuales/06-huesped/17-si-algo-no-funciona.md",
    sections: [
      {
        id: "paso-a-paso",
        title: "Paso a paso",
        level: 2,
        html: "<p><strong>Si tu cartera no conecta</strong></p><ol><li>Mira si tienes una cartera instalada en el navegador. Si no la tienes, la web te muestra un enlace para instalar MetaMask.</li><li>Si la tienes, pulsa <strong>Conectar wallet</strong> y aprueba el permiso en tu móvil.</li><li>Si cerraste el aviso sin querer, no pasa nada: vuelve a pulsar <strong>Conectar wallet</strong>.</li><li>Cuando esté conectada, verás tu dirección acortada arriba a la derecha, con una forma parecida a <code>0x1234…abcd</code>.</li></ol><p><strong>Si estás en la red equivocada</strong></p><ol><li>Verás el aviso <strong>«Estás en la red equivocada.»</strong> y un botón <strong>Cambiar de red</strong>.</li><li>Púlsalo. Tu cartera te pedirá aprobar el cambio.</li><li>Si te dice que tu cartera no tiene esa red, apruébala cuando te la ofrezca y vuelve a intentarlo.</li><li>Si cerraste el aviso sin aceptar, vuelve a pulsar <strong>Cambiar de red</strong>.</li><li>Si sigue sin funcionar, cambia la red a mano en tu cartera y recarga la página.</li></ol><p><strong>Si una compra no sale</strong></p><ol><li>Si cerraste la firma en tu cartera, no se te ha cobrado nada. Puedes intentarlo otra vez cuando quieras.</li><li>Si el mensaje dice que la reserva no se completó, tampoco hay cobro. Vuelve a intentarlo.</li><li>Si el aviso dice que te falta saldo, mira cuánto te falta y cuánto tienes.</li><li>Si el hotel ha pausado las ventas, verás un aviso. No se puede comprar hasta que las reanude.</li><li>Cuando la operación sale bien, aparece un recibo. Si la red tiene explorador, el recibo lleva un enlace. Si no, muestra un código que puedes copiar.</li></ol><p><strong>Si no ves el código QR de tu resguardo</strong></p><ol><li>Entra en <strong>Mis noches</strong>, busca la noche y pulsa <strong>Ver mi resguardo QR</strong>.</li><li>Firma con tu cartera. Es para demostrar que la noche es tuya.</li><li>Si el código no se dibuja en pantalla, tu resguardo <strong>sigue valiendo</strong>. Copia el texto largo que aparece debajo (el token) y enséñalo en recepción.</li><li>Recepción puede pegar ese texto a mano si el escáner no funciona.</li><li>Si abres la pantalla de check-in y te dice que no hay resguardo, vuelve a <strong>Mis noches</strong> y genéralo otra vez.</li><li>Si en recepción te dicen que el resguardo ya se usó, pide ayuda en el mostrador.</li></ol><p><strong>Si la noche que querías ya está vendida</strong></p><ol><li>Antes de que firmes, el sistema comprueba si la noche sigue disponible.</li><li>Si ya está vendida, verás <strong>«Esta noche ya está vendida. Elige otra noche del catálogo.»</strong></li><li>Pulsa el enlace y elige otra noche.</li><li>Si te lo dice el asistente, pídele otra noche o búscala tú en el catálogo.</li></ol><p><strong>Si una página no carga</strong></p><ol><li>Verás un aviso con un botón <strong>Reintentar</strong>. Púlsalo.</li><li>Si sigue igual, espera unos minutos y vuelve a probar.</li><li>Si el problema es del asistente, aparecerá un aviso con <strong>Reintentar</strong> y un enlace al catálogo.</li></ol>",
      },
      {
        id: "si-algo-no-funciona",
        title: "Si algo no funciona",
        level: 2,
        html: "<ul><li><strong>«No detectamos una wallet web3.»</strong> No tienes cartera instalada. Instala MetaMask desde el enlace que aparece.</li><li><strong>«Estás en la red equivocada.»</strong> Tu cartera está en otra red. Pulsa <strong>Cambiar de red</strong>.</li><li><strong>«Tu wallet aún no tiene esta red. Aprueba añadirla cuando MetaMask te lo pida y vuelve a intentarlo.»</strong> Aprueba añadirla y repite el cambio.</li><li><strong>«Has cancelado el cambio de red. Para reservar, cambia a la red de la aplicación.»</strong> Vuelve a pulsar <strong>Cambiar de red</strong> y acepta.</li><li><strong>«No se pudo cambiar de red. Cámbiala manualmente en tu wallet a la red de la aplicación e inténtalo de nuevo.»</strong> Cámbiala a mano en tu cartera.</li><li><strong>«Has cancelado la firma. Puedes intentarlo de nuevo cuando quieras.»</strong> No se ha cobrado nada. Reinténtalo si quieres.</li><li><strong>«No se pudo completar la reserva. Revisa que estés en la red correcta y vuelve a intentarlo.»</strong> Comprueba la red y reinténtalo.</li><li><strong>«El hotel ha pausado las operaciones: no se pueden comprar noches mientras dure la pausa.»</strong> No hay nada que puedas hacer desde la web. Inténtalo más tarde.</li><li><strong>No se pudo comprobar si las ventas están en pausa.</strong> El sistema te lo dice en vez de prometer que todo va bien. Si intentas comprar y siguen en pausa, la operación se rechazará.</li><li><strong>«Esta noche ya está vendida. Elige otra noche del catálogo.»</strong> Otra persona se te adelantó. Elige otra noche.</li><li><strong>«Conecta tu cartera para obtener el resguardo.»</strong> Conecta la cartera y vuelve a pedir el resguardo.</li><li><strong>«Firma cancelada en tu cartera.»</strong> No firmaste. Vuelve a pulsar para generar el resguardo y firma.</li><li><strong>«No se pudo dibujar el código QR, pero el resguardo sigue valiendo: copia el token y enséñalo en recepción.»</strong> El código no se pudo dibujar, pero tu resguardo sirve igual. Copia el texto y muéstralo en recepción.</li><li><strong>«Esta página no tiene ningún resguardo. Abre el enlace que generaste desde «Mis noches».»</strong> Genera el resguardo otra vez desde <strong>Mis noches</strong>.</li><li><strong>«No se pudo emitir el resguardo. Inténtalo de nuevo.»</strong> Vuelve a intentarlo. Si sigue fallando, no sabemos la causa exacta: coméntalo en recepción.</li><li><strong>«No se pudieron cargar tus noches. Inténtalo de nuevo.»</strong> Pulsa <strong>Reintentar</strong>.</li><li><strong>«No se pudo cargar el histórico. Inténtalo de nuevo.»</strong> Pulsa <strong>Reintentar</strong>.</li><li><strong>«El asistente no está disponible ahora mismo. Puedes seguir reservando desde el catálogo.»</strong> Pulsa <strong>Reintentar</strong> o reserva desde el catálogo.</li><li><strong>Un mensaje que no está en esta lista.</strong> No sabemos la causa exacta. Apunta lo que veías y coméntalo en recepción.</li></ul>",
      },
      {
        id: "preguntas-rapidas",
        title: "Preguntas rápidas",
        level: 2,
        html: "<ul><li><strong>¿Pierdo dinero si algo falla a mitad de una compra?</strong> No. Si cancelas la firma o la operación no se completa, no se te cobra nada.</li><li><strong>¿Necesito saber de tecnología?</strong> No. Solo tienes que pulsar los botones y aprobar en tu cartera cuando te lo pida.</li><li><strong>¿Con quién hablo si sigo atascado?</strong> Con recepción. En la página <strong>Contacto</strong> tienes el teléfono y el correo del hotel.</li><li><strong>¿A qué hora puedo pasar por recepción?</strong> &lt;!-- PENDIENTE DEL CLIENTE: horario de atención de recepción --&gt;</li><li><strong>¿Por qué no aparece el botón del dinero de prueba?</strong> Porque este entorno no lo tiene configurado, o porque tu cartera no está conectada en la red correcta.</li><li><strong>¿Puedo usar el hotel sin cartera?</strong> Puedes mirar el catálogo y el histórico; para comprar, revender o enseñar tu resguardo necesitas la cartera.</li></ul>",
      },
    ],
  },
];
