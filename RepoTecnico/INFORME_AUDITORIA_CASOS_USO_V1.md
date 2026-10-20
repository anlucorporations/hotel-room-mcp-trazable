# Informe de auditoría — Casos de uso WEB y APK (V1)

> **Tipo:** auditoría `@audita` (3 fases: revisar → verificar → sintetizar) sobre los artefactos de Fase 2.
> **Fecha:** 2026-10-20 · **Alcance:** `RepoTecnico/casos_uso_web.md`, `RepoTecnico/casos_uso_apk.md` y sus
> 4 documentos de diagramas en `RepoTecnico/casos_uso/`.
> **Regla:** los revisores y verificadores **no** modifican archivos; solo el sintetizador escribe este
> informe. Las correcciones de esta sección se aplicaron **después** de verificar los hallazgos (se indica
> «Corregido»), sin ocultar los que siguen abiertos.

---

## 1. Resumen ejecutivo

**Veredicto:** los casos de uso son **aptos con reservas** para aprobar el alcance de Fase 2 y pasar a
los diagramas/planificación. **No hay bloqueos para la web** (los hallazgos de trazabilidad y redacción
quedan mitigados o declarados). **La APK no debe publicarse** sin cerrar dos requisitos externos:
**revisión legal de facturación de Play para bienes digitales/NFT** y **DPIA** por la linkabilidad de la
dirección de wallet.

- **16 hallazgos** verificados: **0 críticos**, **4 altos**, **8 medios**, **4 bajos**.
- **Corregidos en esta pasada:** 11 (redacción no medible, RNF/stakeholders ausentes, riesgos técnicos,
  diagrama con actor equivocado, cobertura contada, presupuestos móviles).
- **Pendientes:** 3 requieren decisión/acción externa (numeración RF unificada, legal de Play, DPIA) y 2
  son verificaciones de API/estado que se cierran en pruebas.

---

## 2. Metodología

1. **Fase 1 — Revisar (7 lentes):** ambigüedad/testabilidad, consistencia, completitud RNF (ISO 25010),
   stakeholders, trazabilidad con el brief, riesgos técnicos y seguridad/legal.
2. **Fase 2 — Verificar (adversarial):** cada hallazgo se contrastó contra los ficheros con evidencia
   `ruta:línea`; los dudosos se descartaron y los que se corrigieron quedan marcados.
3. **Fase 3 — Sintetizar:** este informe, con tabla por severidad, hallazgos críticos/altos, RNF y
   stakeholders faltantes, y plan de acción.

> **Nota de ejecución:** el workflow multiagente de 7 revisores en paralelo no completó su Fase 1 (quedó
> sin progreso); la auditoría se completó en **pase dirigido** con las mismas 7 lentes y verificación
> directa contra los ficheros. Se documenta para que la trazabilidad del proceso sea honesta.

**Métricas de los artefactos auditados:** `casos_uso_web.md` (1.196 líneas, 24 CU-W, 24 bloques Gherkin);
`casos_uso_apk.md` (863 líneas, 24 CU-A, 25 bloques Gherkin); 6 diagramas Mermaid en 4 documentos
(685 líneas). Fuentes contrastadas: `docs/PRD.md`, `docs/SRS.md`, `docs/REQUISITOS.md`,
`docs/CASOS-DE-USO.md`, `propuesta_vNext/casos_uso.md`, `estado_proyecto.md`, `aceptacion_fase3.md`.

---

## 3. Hallazgos por severidad

| ID | Sev. | Área / lente | Hallazgo | Evidencia | Estado |
|---|---|---|---|---|---|
| H-01 | **ALTA** | Trazabilidad (R5/R2) | **Numeración RF divergente**: `PRD` renumera `RF-01…RF-23` y `REQUISITOS/SRS` usan otro significado para los mismos IDs; un RF citado puede leerse al revés | `docs/PRD.md:94` (RF-01 = catálogo) vs `docs/REQUISITOS.md:81` (RF-01 = tokenizar); `casos_uso_web.md:126` | **Mitigado** con «Anexo A» de correspondencia; **deuda abierta**: unificar numeración |
| H-02 | **ALTA** | Legal (R7) | **APK: política de facturación de Play** para bienes digitales/NFT y **desistimiento** (servicios de ocio) no evaluados antes de publicar | `casos_uso_apk.md` §3, §7 | **Abierto** (revisión legal); criterio añadido en §7.9 |
| H-03 | **ALTA** | Privacidad (R7) | **Dirección de wallet = dato personal vinculable** (RGPD Cons. 26): falta **DPIA**, base legal y retención explícitas | `casos_uso_apk.md` §3/A-7; `casos_uso_web.md` §7 | **Abierto**; DPIA añadida como criterio (web §7.11, APK §7.10) |
| H-04 | **ALTA** | Consistencia (R2) | El catálogo `SRS` no recogía los **RF-61…RF-65** aprobados, dejando sus CU (CU-W-12/15/16/17/21/22) sin anclaje en el catálogo canónico | `docs/SRS.md` §9/§10; `docs/PRD.md:118-122` | **Corregido**: nota en SRS §9 con la correspondencia |
| H-05 | MEDIA | Testabilidad (R1) | Criterios con lenguaje **no medible** («mensaje claro», «página honesta», «error claro») sin oráculo concreto | `casos_uso_web.md:260,332,655,897`; `casos_uso_apk.md:461,483,536,603` | **Corregido**: `data-testid`/códigos (`tx-error`, `not-found`, `REVIEW_DUPLICATED`, `deeplink-not-found`, …) |
| H-06 | MEDIA | Completitud RNF (R3) | Matriz web **omitía** RNF-03/04/07/08/09/15/16 (gas, seguridad, escalabilidad, plazos, coste, pausa/fondos, pruebas) | `casos_uso_web.md` §6 | **Corregido**: filas añadidas con justificación de alcance |
| H-07 | MEDIA | Stakeholders (R4) | Faltaban actores: **hotel (negocio)**, proveedor **PMS**, proveedor de **wallet**, **auditor externo** (web) | `casos_uso_web.md` §2 | **Corregido**: 4 filas añadidas |
| H-08 | MEDIA | Stakeholders (R4) | Faltaban actores: **hotel**, **Play Store**, proveedor de wallet, **regulador**, **comité de privacidad** (APK) | `casos_uso_apk.md` §2 | **Corregido**: 5 filas añadidas |
| H-09 | MEDIA | Riesgos técnicos (R6) | APK sin tabla de riesgos: relay de WalletConnect, entrega FCM, falsos negativos de Integrity, secuestro de deep links, desfase de reloj, fragmentación | `casos_uso_apk.md` §7 | **Corregido**: §7.1 con 8 riesgos y mitigación |
| H-10 | MEDIA | Riesgos técnicos (R6) | Web sin riesgos explícitos de RPC/worker/CSRF y su mitigación en los CU | `casos_uso_web.md` §7 | **Corregido**: §7.1 con 6 riesgos |
| H-11 | MEDIA | Consistencia (R2) | Diagrama web: la compra de reventa aparecía asociada al **portador** (`PORT-->W06`) en vez del comprador, y una relación «extend» mal ubicada | `casos_uso/diagrama_casos_uso_web.md:60,69` | **Corregido**: `COMP-->W06`; relación sustituida por «include: verificar propiedad» |
| H-12 | BAJA | Trazabilidad (R5) | La cobertura «109 objetivos» contaba **CU-V-11 fusionado** en CU-V-19 | `casos_uso_web.md:1032` | **Corregido**: «108 únicos + 1 fusionado» |
| H-13 | BAJA | Testabilidad (R1) | APK CU-A-01: «carrusel breve» no medible | `casos_uso_apk.md:107` | **Corregido**: 3 pantallas máximo y omitible |
| H-14 | BAJA | RNF (R3) | APK sin presupuestos de **tamaño**, **batería** y **crash-free** | `casos_uso_apk.md` §7 | **Corregido**: APK ≤ 25 MB, crash-free ≥ 99,5 %, < 3 %/h |
| H-15 | BAJA | Seguridad (R7) | Web: mitigaciones **CSRF/rate-limit** en rutas mutantes con cookies no verificadas en la suite | `casos_uso_web.md` §7.11 | **Abierto** («necesita verificación»): criterio registrado |
| H-16 | BAJA | Consistencia (R2) | APK usa estados (`PENDING`, `SIGNED`, `MINED`, `DISPUTED`, …) sin contraste formal contra el diccionario canónico en ese documento | `casos_uso_apk.md` §5 (CU-A-15 y vocabulario) | **Abierto** («necesita verificación»): remisión al diccionario en §7 |

**Resumen de verificación adversarial:** se descartaron 2 candidatos por no poder confirmarse con evidencia
(«falta de RNF de usabilidad en la web» — sí está en RNF-20/§7; «CU-A sin actor de soporte» — el soporte
es externo y está declarado). El resto de la lista son hallazgos confirmados con `ruta:línea`.

---

## 4. Hallazgos altos — detalle y recomendación

### H-01 · Numeración RF divergente (trazabilidad)
- **Problema:** `RF-01` significa «tokenizar la noche» en `docs/REQUISITOS.md:81` y «catálogo público» en
  `docs/PRD.md:94`; `RF-07` es reventa en REQUISITOS y resguardo QR en PRD. Cualquier trazabilidad que
  mezcle fuentes puede citar el requisito equivocado.
- **Recomendación:** una sola fuente de numeración (propuesta: la de REQUISITOS/SRS, que usan todos los
  CU) y un **anexo de correspondencia** en el PRD; renumerar el PRD en su próxima versión.
- **Aplicado:** `casos_uso_web.md` §9 «Anexo A» con tabla PRD ↔ REQUISITOS/SRS de los 23 RF + nota de
  deuda en §6. Queda abierto el renombrado definitivo del PRD.

### H-02 · Legal: Play billing y desistimiento (APK)
- **Problema:** vender NFTs/noches dentro de una app Android puede quedar sujeto a la política de
  facturación de Google Play (bienes digitales) y al régimen de desistimiento de servicios de ocio.
- **Recomendación:** revisión legal antes del lanzamiento; decidir si la compra vive fuera de la app
  (web) o se declara el flujo permitido; documentar información precontractual.
- **Aplicado:** criterio de aceptación §7.9 (APK) exige la revisión legal previa. **Abierto** hasta el
  dictamen.

### H-03 · Privacidad: wallet como dato personal (ambos)
- **Problema:** la dirección de wallet puede ser un dato personal vinculable (Cons. 26 RGPD); la APK
  almacena resguardo/tokens y el modelo de identidad es la wallet.
- **Recomendación:** **DPIA**, base legal (ejecución de contrato/interés legítimo), retención y derechos.
- **Aplicado:** criterios de privacidad reforzada (web §7.11 y APK §7.10). **Abierto** hasta completar la
  DPIA.

### H-04 · RF-61…RF-65 sin catálogo (trazabilidad)
- **Problema:** los RF nuevos estaban en el PRD y en los CU-W, pero el catálogo canónico `SRS` §9 no los
  mencionaba, dejando los CU sin anclaje en el catálogo.
- **Recomendación:** nota de correspondencia en el catálogo.
- **Aplicado:** `docs/SRS.md` §9 con los CU-W asociados a cada RF. **Corregido.**

---

## 5. RNF faltantes (tras la corrección)

| Categoría ISO 25010 | Estado en los CU |
|---|---|
| Adecuación funcional | cubierta (matriz RF → CU) |
| Eficiencia de desempeño | cubierta: RNF-01/02/11 y gate A8; APK §7 (arranque, catálogo, tamaño/batería) |
| Compatibilidad | cubierta: RNF-18 (navegadores/Android), APK `minSdk 26`/matriz de dispositivos |
| Usabilidad | cubierta: RNF-19 y §7 (áreas táctiles, TalkBack, i18n) |
| Fiabilidad | cubierta: RNF-12, RNF-17, degradación honesta y riesgos §7.1 |
| Seguridad | cubierta: RNF-13/14, Keystore/biometría, Integrity opcional, DPIA declarada |
| Mantenibilidad | RNF-21 + guardianes y `informe_pruebas_fase4.md` |
| Portabilidad | APK: Android 8–15; Web: navegadores objetivo |
| **Cumplimiento** | **deuda**: legal Play/MiCA/desistimiento y DPIA (H-02/H-03) |
| **Backup/recuperación** | RNF-M-12 y A9 (drill aislado pendiente de IAM) |

---

## 6. Stakeholders faltantes (tras la corrección)

- **Web**: hotel (negocio), proveedor PMS, proveedor de wallet y auditor externo → añadidos a §2.
- **APK**: hotel, Play Store, proveedor de wallet, regulador (consumo/MiCA) y comité de privacidad →
  añadidos a §2.
- **Siguen fuera de los diagramas** (deliberadamente): el operador de red Besu/Anvil (infraestructura, no
  actor de negocio) y el equipo de soporte de app store (proceso, no actor funcional). Se documentan en
  riesgos y operación.

---

## 7. Plan de acción

### Quick wins (S) — aplicados en esta pasada
1. Oráculos concretos en los criterios vagos (H-05).
2. RNF y stakeholders añadidos a las matrices y tablas (H-06/07/08).
3. Riesgos técnicos con mitigación en web y APK (H-09/10).
4. Corrección de flechas del diagrama web y presupuestos móviles (H-11/13/14).
5. Anexo de correspondencia RF (H-01, mitigación) y nota SRS para RF-61…65 (H-04).

### Mejoras (M) — siguiente iteración
6. **Renumerar el PRD** o congelar la numeración de REQUISITOS/SRS y eliminar el anexo (H-01).
7. Verificación de **CSRF/rate-limit** y de estados canónicos en la APK contra el diccionario (H-15/16).
8. Añadir a los CU-W/CU-A un campo «prueba asociada» explícito por criterio (trazabilidad a test).

### Roadmap (L) — antes de publicar
9. **DPIA** y revisión legal de Play/MiCA/desistimiento (H-02/H-03); actualizar §3 de la APK y el PRD.
10. Cerrar **A9** (drill a instancia aislada) y publicar la evidencia.
11. Ejecutar el workflow de auditoría multiagente completo cuando el proveedor lo permita, para contraste
    independiente de este informe.

---

## 8. Criterios de aceptación para la próxima versión (V2)

1. Numeración RF única y sin ambigüedad (o anexo vigente y declarado como deuda con fecha).
2. Cero criterios con lenguaje no medible: todo `Entonces` cita oráculo.
3. DPIA completada y revisión legal de Play/MiCA adjunta.
4. Matriz RNF completa por categoría ISO 25010 y stakeholders sin huecos.
5. Cada criterio con prueba asociada (unitaria/UI/E2E) y cada CU con evidencia de implementación.
6. Diagramas coherentes con los CU (actores, IDs, estados) y validados visualmente.
