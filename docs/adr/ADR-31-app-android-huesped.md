# ADR-31 · App Android del huésped (v1): nativa, no custodial y con el pago fuera de la app hasta dictamen legal

> **Estado:** propuesta (pendiente de aprobación del cliente y del dictamen legal H-02).
> **Fecha:** 2026-10-20 · **Origen:** decisiones A-1/A-2/A-3 ratificadas en
> [`RepoTecnico/casos_uso_apk.md`](../../RepoTecnico/casos_uso_apk.md) §8 y auditoría
> [`INFORME_AUDITORIA_CASOS_USO_V1.md`](../../RepoTecnico/INFORME_AUDITORIA_CASOS_USO_V1.md).
> **Normas relacionadas:** ADR-11 (nunca firmar sin verificar), ADR-30 (mensajes legibles),
> ADR-24 (privacidad/minimización), RF-04/RF-11/RF-18/RNF-05/RNF-13/RNF-18/RNF-20.

## Contexto

La plataforma actual es **web responsive**. El huésped necesita una app móvil por tres motivos concretos:
(1) el **resguardo QR** debe mostrarse sin cobertura en el hotel; (2) las **notificaciones** de reventa,
cargo y check-in son más fiables con push nativo; (3) la **protección local** (biometría/Keystore) no
tiene equivalente sólido en navegador. No hay app nativa en el repositorio ni toolchain Android en el
entorno de trabajo, así que esta decisión fija el **plan** para construirla.

Alternativas evaluadas:

| Alternativa | Por qué no (o sí) |
|---|---|
| **PWA/TWA** envolviendo la web | Barata, pero Web Push en iOS/Android y el almacenamiento seguro del resguardo no son equivalentes; la experiencia de campo (QR a pantalla completa, biometría) es peor |
| **React Native / Expo** | Reutiliza TypeScript del monorepo, pero añade puente nativo para Keystore/WalletConnect y una cadena de build distinta; el equipo ya mantiene Kotlin para el terminal… *no aplica*: el terminal es web |
| **Flutter** | Excelente UI, pero introduce Dart (tercer lenguaje) y duplica lógica de dominio |
| **Nativa Android (Kotlin + Compose)** | Máximo control de Keystore/biometría/FCM/App Links; una sola plataforma en v1; el dominio sigue en el backend (sin reimplementar reglas) |

## Decisión

1. **App Android nativa** (Kotlin + Jetpack Compose), `minSdk 26`, `targetSdk 35`, idiomas ES/EN/RU.
2. **No custodial**: la app nunca ve ni guarda claves privadas. La wallet se conecta por
   **WalletConnect v2** (vía principal) con **deep link a MetaMask** como alternativa.
3. **Identidad = wallet**; no hay login por contraseña de huésped ni cuentas propias en la app.
4. **Alcance v1 = huésped**: descubrir/comprar/reventa/subasta, resguardo QR **offline**, check-in,
   reseñas, cargos, push, deep links, privacidad y ayuda. **Back-office, recepción y suites del personal
   quedan fuera** (se operan en la web, D-49/D-50).
5. **Pago en el checkout web durante v1** (decisión de producto recomendada en H-02) hasta que el
   dictamen legal de Google Play permita otra cosa; la app enlaza al pago con App Links y vuelve por deep
   link. Si el dictamen autoriza compra in-app, se revisará este ADR.
6. **Protección local obligatoria**: bloqueo biométrico/PIN del dispositivo para abrir la app y ver el
   resguardo; almacenamiento cifrado con **Android Keystore**; **Play Integrity opcional** (si está
   activo y el dispositivo no es aprobado → modo solo lectura).
7. **Offline parcial**: el resguardo ya emitido se muestra sin red; el catálogo cacheado se marca como no
   verificado; las escrituras se bloquean sin conexión.
8. **Build y distribución**: Gradle + Play Console; sin secretos en el repositorio (Keystore de firma en
   CI/Secret Manager); `networkSecurityConfig` sin tráfico en claro.

## Consecuencias

**Positivas:** experiencia de campo fiable (QR offline + biometría), push nativo, menos fricción en
recepción; reutiliza el backend y el contrato sin cambios; el dominio sigue siendo una sola fuente.
**Negativas / costes:** un equipo y una cadena de build nuevos (Gradle/Play), dos superficies de UI que
mantener (web y app), revisión de tienda y obligaciones de privacidad (DPIA ya preparada), y dependencia
de WalletConnect/FCM.
**Riesgos y mitigación:** relay de WalletConnect caído → deep link alternativo; FCM sin entrega →
email/estado in-app; Integrity con falso negativo → solo lectura reversible; deep links secuestrados →
App Links verificados; reloj desviado → vigencia validada en servidor.

## Cumplimiento y gates antes de publicar

- **H-02** (legal Play/MiCA/consumo) y **H-03** (DPIA + registro art. 30) cerrados con dictamen/aprobación.
- Política de privacidad publicada y enlazada desde la app y la web.
- Matriz de pruebas §7 de `casos_uso_apk.md` en verde (build, seguridad, offline, a11y, i18n, rendimiento,
  compatibilidad, distribución).
- Manuales de la app generados (Fase 5 del proyecto) cuando exista build.

## Plan de ejecución

Ver [`RepoTecnico/plan_desarrollo_apk.md`](../../RepoTecnico/plan_desarrollo_apk.md) (ciclos A1–A6,
tareas, gates y dependencias).
