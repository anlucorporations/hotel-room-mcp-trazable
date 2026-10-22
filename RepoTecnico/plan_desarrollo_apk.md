# Plan de desarrollo — APK Android del huésped (v1)

> **Tipo:** plan de desarrollo vertical (Fase 3) para la app definida en
> [`casos_uso_apk.md`](./casos_uso_apk.md) y la decisión [`ADR-31`](../docs/adr/ADR-31-app-android-huesped.md).
> **Fecha:** 2026-10-20 · **Estado:** propuesta para aprobación · **No hay código de app todavía.**
> **Entorno actual:** sin toolchain Android (JDK/Gradle/Android SDK); el primer ciclo incluye dejarlo
> disponible en CI/local.

---

## 1. Principios de entrega

- **Verticales operativos**: cada ciclo deja una función completa (UI + API + pruebas + manual), no capas
  a medias.
- **Una sola fuente de dominio**: la app **no reimplementa** reglas de negocio; consume las APIs de la web
  y firma en la wallet. Contrato y BD no cambian.
- **Seguridad y privacidad desde A1**: Keystore, biometría, minimización y sin claves privadas.
- **Gates por ciclo**: unitarias + UI (Compose) + integración contra Anvil/backend de pruebas; E2E de
  dispositivo/emulador cuando aplique; accesibilidad TalkBack; i18n.
- **Legal antes de tienda, no antes de desarrollo**: H-02/H-03 son gate de **publicación**, no de código.

## 2. Ciclos verticales

### A1 · Esqueleto + onboarding + wallet (≈ 8–10 días-persona)

| Tarea | Entregable |
|---|---|
| A1.1 Proyecto Gradle/Compose, CI de build y lint | `apps/mobile` compilando `assembleDebug` en CI |
| A1.2 Onboarding (3 pantallas, términos/privacidad, idioma ES/EN/RU) | CU-A-01, CU-A-20 |
| A1.3 WalletConnect v2 + deep link MetaMask; red `81234` | CU-A-02, CU-A-03 |
| A1.4 Tema de marca (tokens Brisa Marina) y navegación | UI base accesible |
| A1.5 Pruebas: unitarias de estado + UI de onboarding y conexión | Gate A1 |

**Gate:** onboarding completo en emulador; wallet conecta y detecta red incorrecta; textos ES/EN/RU sin
hardcodeos.

### A2 · Catálogo y compra (≈ 10–12 días-persona)

| Tarea | Entregable |
|---|---|
| A2.1 Catálogo con filtros y caché offline | CU-A-04 |
| A2.2 Ficha de noche/habitación | CU-A-05 |
| A2.3 Disponibilidad y retención | CU-A-06 |
| A2.4 Compra primaria (checkout web + retorno por deep link) y estado de tx | CU-A-07 |
| A2.5 Compra de reventa con royalty | CU-A-08 |
| A2.6 Pruebas: integración contra Anvil + UI | Gate A2 |

**Gate:** compra de prueba en red de test con tx confirmada y noche en «Mis noches»; sin firmar en servidor.

### A3 · Resguardo y estancia (≈ 8–10 días-persona)

| Tarea | Entregable |
|---|---|
| A3.1 «Mis noches» con estados | CU-A-09 |
| A3.2 Resguardo QR/JWS, guardado cifrado y visor **offline** | CU-A-10 |
| A3.3 Check-in: presentar pase y ver estado de la estancia | CU-A-11 |
| A3.4 Deep links de noche/resguardo/subasta/cargos | CU-A-17 |
| A3.5 Pruebas: offline real (modo avión) y biometría | Gate A3 |

**Gate:** el QR se muestra sin red tras reiniciar la app; el check-in en recepción lo acepta; sin doble uso.

### A4 · Postventa y avisos (≈ 8–10 días-persona)

| Tarea | Entregable |
|---|---|
| A4.1 Mis reventas (listar/editar/retirar/cobrar) | CU-A-12 |
| A4.2 Subastas (ver/pujar/retirar) | CU-A-13 |
| A4.3 Reseñas | CU-A-14 |
| A4.4 Cargos y reclamación | CU-A-15 |
| A4.5 Push FCM, preferencias y baja; deep links | CU-A-16 |
| A4.6 Pruebas de integración y push | Gate A4 |

**Gate:** aviso push abre el detalle correcto; reventa/cobro completan; reclamación cambia de estado.

### A5 · Protección, privacidad y plataforma (≈ 6–8 días-persona)

| Tarea | Entregable |
|---|---|
| A5.1 Bloqueo biométrico/PIN obligatorio y Keystore | CU-A-18 |
| A5.2 Offline global y recuperación de red | CU-A-19 |
| A5.3 Privacidad: exportación/supresión, consentimientos, telemetría opt-in | CU-A-21, CU-A-24 |
| A5.4 Ayuda offline y contacto | CU-A-22 |
| A5.5 Versión mínima/actualización y Play Integrity opcional | CU-A-23 |
| A5.6 Pruebas de seguridad, accesibilidad y matriz de dispositivos | Gate A5 |

**Gate:** DPIA/H-03 aplicada en la app; TalkBack completo; dispositivos 8/10/13/15 sin fallos.

### A6 · Release candidate y tienda (≈ 6–8 días-persona)

| Tarea | Entregable |
|---|---|
| A6.1 Build firmado reproducible + shrinking | APK/AAB de release |
| A6.2 Ficha de Play (ES/EN), política de privacidad, clasificación | Ficha revisada |
| A6.3 Cierre de H-02 (legal) y H-03 (DPIA/RAT) | Evidencia firmada |
| A6.4 Manuales de la app (técnico + literal) y ayuda | Documentación |
| A6.5 Beta cerrada y correcciones | RC aprobado |

**Gate de publicación:** dictamen legal + DPIA aprobada + matriz de aceptación de `casos_uso_apk.md` §7 en
verde + ficha de Play revisada.

**Estimación total:** ≈ 46–58 días-persona + revisión legal/DPO en paralelo.

## 3. Dependencias

| Dependencia | Estado | Impacto |
|---|---|---|
| APIs web existentes (catálogo, compra, pases, cargos, push) | **listas** | la app no necesita backend nuevo salvo endpoints de app (registro push, versión mínima, auth de wallet) |
| WalletConnect projectId | **✅ disponible** (`de053…f200a`, público; valor por defecto en `infra/gcp/gcp-env.sh`) | desbloqueado: A1.3 lo inyecta en la config de la app; puede requerir registrar el dominio/enlaces de la app en WalletConnect Cloud |
| Toolchain Android en CI | **pendiente** | bloquea A1.1 |
| H-02/H-03 | **borradores listos** | bloquean A6 (publicación), no A1–A5 |
| Cuentas Play Console + firma | **pendiente del cliente** | bloquea A6 |
| FCM (proyecto Firebase) | **pendiente** | bloquea A4.5 |

## 4. Riesgos del plan

| Riesgo | Mitigación |
|---|---|
| Pago in-app bloqueado por política de Play | v1 con checkout web (ADR-31 §5); reevaluar con dictamen |
| Sin toolchain/CI Android al arrancar | A1.1 lo resuelve; usar `ubuntu-latest` + SDK/emulador en CI |
| Dos superficies de UI divergen | contrato de diseño de marca compartido (tokens) y pruebas de paridad de copy |
| Push poco fiable | email/estado in-app como respaldo |
| Confianza del huésped en el resguardo | offline + biometría + validación en recepción; nunca QR inventado |

## 5. Criterios de aceptación del plan

1. Los 24 CU-A quedan cubiertos por algún ciclo (trazabilidad CU-A → ciclo).
2. Cada ciclo tiene gate verificable y evidencia (como F1–F10 en la web).
3. La publicación queda condicionada a H-02/H-03 y a la matriz de aceptación de la app.
4. Los manuales de la app se generan en A6 con la misma tubería (`build-manuals`) que la web.

## 6. Próximo paso

Aprobar este plan y `ADR-31`, provisionar toolchain Android + WalletConnect projectId + Play Console, y
arrancar **A1**. Mientras no haya aprobación, la app queda como propuesta especificada (casos de uso,
diagramas, DPIA y plan), sin código.
