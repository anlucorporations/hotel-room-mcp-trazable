Basado en la maqueta y el concepto del proyecto **Marina Sol**, a continuación se presenta un análisis detallado junto con una **propuesta integral de UI/UX y Sistema de Diseño Visual** tanto para la plataforma Web como para la Aplicación Móvil.

# **1\. Análisis del Proyecto: Marina Sol**

* **Sector e Industria:** Hotelería de lujo, resort mediterráneo, bienestar (wellness) y experiencias exclusivas.  
* **Propuesta de valor:** Exclusividad, serenidad frente al mar, gastronomía de alto nivel y servicio personalizado.  
* **Público Objetivo:** Viajeros de alto poder adquisitivo (parejas, familias, ejecutivos/nómadas de lujo) que buscan desconexión, confort y reservas sin fricciones.  
* **Pilares de la experiencia:**  
  1. *Alojamiento prémium* (Suites con vista al océano, mayordomía 24/7).  
  2. *Experiencias* (Piscina infinita, Spa mediterráneo, gastronomía al atardecer).  
  3. *Exploración local curada* (Calas ocultas, tours privados).

# **2\. Propuesta de Estilo Visual (Design System)**

El estilo debe transmitir **lujo sobrio, calidez costera y modernidad atemporal** (*Quiet Luxury / Mediterranean Serenity*).

### **2.1 Paleta de Color**

* **Primario / Océano Profundo:** \#0F2C3F (Azul marino mediterráneo; elegancia, base para tipografía y headers).  
* **Secundario / Arena Cálida:** \#F7F4EE (Blanco roto/marfil; fondo principal para dar amplitud y descanso visual).  
* **Acento / Terracota Puesta de Sol:** \#C86446 o \#D96B43 (Inspirado en el atardecer y el badge de testimonios; para CTAs primarios y estados activos).  
* **Acento Suave / Dorado Champagne:** \#C5A880 (Detalles de lujo, líneas divisorias, estrellas de calificación y bordes sutiles).  
* **Superficies / Blanco Puro:** \#FFFFFF (Tarjetas de reserva, modales y campos interactivos).  
* **Texto Neutro:**  
  * Primario: \#1C242B  
  * Secundario / Placeholder: \#6B7280

### **2.2 Tipografía**

* **Títulos (Display / Serif):** *Cormorant Garamond* o *Playfair Display*. Aporta distinción editorial, sofisticación y ritmo visual clásico de resorts 5 estrellas.  
* **Cuerpo e Interfaz (Sans-serif):** *Inter*, *Plus Jakarta Sans* o *Outfit*. Excelente legibilidad en pantallas pequeñas, alturas de x generosas y aspecto contemporáneo y limpio.

### **2.3 Iconografía y Componentes Visuales**

* **Iconos:** Trazo fino (*outline* de 1.5px), geométricos y minimalistas (ej. Phosphor Icons o Lucide Icons).  
* **Bordes y Sombras:**  
  * Esquinas sutilmente redondeadas (border-radius: 8px a 12px en web; 16px a 24px en tarjetas móviles y hojas modales).  
  * Sombras difusas y elegantes: box-shadow: 0 10px 30px rgba(15, 44, 63, 0.06).  
* **Tratamiento Fotográfico:** Fotografía inmersiva, iluminación natural dorada (hora mágica), balance de blancos cálido y encuadres limpios con aire compositivo.

# **3\. Propuesta UX/UI: Plataforma Web (Desktop & Tablet)**

La web debe funcionar como el escaparate principal de conversión y reserva, con una navegación fluida y una narrativa editorial envolvente.

### **Arquitectura de Información & Pantallas Clave**

> 1. **Hero Section Inmersivo:**  
   * Fondo con video sutil o carrusel de alta resolución en transición lenta.  
   * **Booking Engine Flotante (Barra de Reserva):** Con campos limpios (Check-In, Check-Out, Huéspedes/Habitación) y botón de acción destacado (Check Availability) fijo o pegajoso al scroll.  
> 2. **Sección de Experiencias:**  
   * Grid asimétrico con microinteracciones al pasar el ratón (*hover zoom* suave, aparición de botones de reserva rápida para Spa y Cenas).  
> 3. **Catálogo de Alojamiento (Suites & Villas):**  
   * Tarjetas horizontales de suites con detalles esenciales visibles (tamaño, amenidades clave, vista, precio promedio).  
   * Selector dinámico con visualizador 360° o galería integrada sin salir de la página.  
> 4. **Prueba Social y Testimonios:**  
   * Tarjetas editoriales con citas destacadas, calificaciones de huéspedes verificados y tipografía refinada.  
> 5. **Flujo de Checkout / Reserva:**  
   * Proceso de 3 pasos lineales con resumen flotante (*Sticky Order Summary*): Selección de habitación \> Extras personalizados (Spa, traslados) \> Pago seguro.

# **4\. Propuesta UX/UI: Aplicación Móvil (iOS / Android)**

Mientras la web atrae y concreta la reserva inicial, la **App Móvil** se enfoca en el **acompañante digital del huésped durante su estancia** (*Guest Experience Hub*) y en el viajero frecuente.

### **4.1 Estructura de Navegación (Bottom Navigation Bar)**

> 1. **Inicio (Discover):**  
   * Cuenta regresiva para la estancia o estado del check-in.  
   * Acceso rápido a la llave digital de la suite (Apple Wallet / NFC Google Wallet).  
   * Temperatura actual, hora de puesta de sol y agenda del resort del día.  
> 2. **Experiencias (Book & Indulge):**  
   * Catálogo táctil para agendar tratamientos de spa, reservar mesa en el restaurante o alquilar experiencias náuticas en pocos toques.  
> 3. **Servicios (Concierge / In-Room):**  
   * Pedidos de *Room Service* con selector interactivo y tiempos de entrega en tiempo real.  
   * Solicitud de mayordomía 24/7 (asistencia de equipaje, servicio de cortesía nocturna).  
> 4. **Chat (Personal Butler):**  
   * Canal directo de mensajería instantánea con el equipo de conserjería para peticiones especiales.  
> 5. **Perfil / Mi Estancia:**  
   * Detalles de reserva, historial de gastos de la habitación, preferencias de almohadas/dietas y programa de fidelidad.

### **4.2 Patrones de Interacción Móvil**

* **Hojas deslizantes (Bottom Sheets):** Para selección de fechas, filtros de suites y detalles de tratamientos sin cambiar de pantalla.  
* **Micro-retroalimentación háptica:** Confirmación sensorial al reservar o desbloquear la puerta de la habitación.  
* **Modo Día / Modo Noche Dinámico:** Interfaz que pasa a tonos más cálidos y oscuros durante la noche para acompañar la relajación del huésped.

# **5\. Hoja de Ruta para Implementación Técnica**

> 1. **Fase 1 – UI Kit & Tokens:**  
   * Definición de variables de diseño (colores, escala tipográfica de 8pt, espaciados y elevación) en Figma.  
> 2. **Fase 2 – Prototipado Interactivo:**  
   * Flujo Web de reserva completa (Landing \-\> Disponibilidad \-\> Checkout).  
   * Flujo App de conserjería y llave digital.  
> 3. **Fase 3 – Pruebas de Usabilidad:**  
   * Pruebas de contraste WCAG AA/AAA (especialmente sobre fondos arena/dorados).  
   * Verificación de tiempos de respuesta táctiles en dispositivos móviles reales.