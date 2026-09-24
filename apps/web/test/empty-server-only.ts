/**
 * Doble vacío de `server-only` para la suite de Vitest.
 *
 * El paquete real resuelve a su entrada que **lanza** ("This module cannot be imported from a
 * Client Component module") salvo bajo la condición de exportación `react-server`, que Next activa
 * en el servidor pero Vitest no. Sin este alias, cualquier prueba que importe una ruta que use un
 * módulo de servidor (`@/lib/server-client`, `@/lib/ticket-ownership`, …) fallaría al cargar el
 * módulo, no por un fallo real del código.
 *
 * El marcador `import "server-only"` sigue presente en producción: la protección para el bundle de
 * cliente la aplica Next en la compilación.
 */
export {};
