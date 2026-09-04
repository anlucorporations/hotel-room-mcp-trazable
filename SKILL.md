---
name: equipo-auditoria
description: >-
  Equipo de auditoría en 3 fases activado por el comando "@audita": Fase 1 con 7
  revisores en paralelo (Ambigüedad/testabilidad, Consistencia, Completitud RNF
  ISO 25010, Stakeholders, Trazabilidad con el brief, Riesgos técnicos,
  Seguridad y legal); Fase 2 de verificación adversarial (filtra falsos
  positivos, deduplica, ajusta severidades; ante la duda descarta); Fase 3 de
  síntesis en un informe priorizado (veredicto, tabla por severidad, hallazgos
  críticos, RNF y stakeholders faltantes, plan de acción).
whenToUse: >-
  Se activa cuando el prompt contenga "@audita" (p. ej. "@audita el proyecto",
  "@audita la plataforma") o frases equivalentes de auditoría integral
  ("auditar", "informe de optimización", "detectar ambigüedades e
  inconsistencias", "RNF y stakeholders faltantes") en cualquier proyecto.
---

# Equipo de Auditoría — 3 Fases (comando `@audita`)

Plugin reutilizable que se ejecuta **cuando el prompt contiene `@audita`**
(además de frases equivalentes). NO depende de ningún repositorio concreto:
parametriza por el directorio de trabajo. Vive en `~/.dsh/skills/` (nivel
usuario), disponible en todos los proyectos y sesiones.

## 📖 Cómo usarlo en cualquier proyecto

1. Abre una sesión de DSH con el proyecto a auditar.
2. Escribe el prompt con el comando: **`@audita`** + alcance opcional:
   - `@audita el proyecto` — auditoría completa.
   - `@audita solo contratos` / `@audita backend` / `@audita frontend` (limita el alcance).
   - `@audita y emite informe v3` / `@audita en inglés` (versión/idioma).
3. El equipo ejecuta automáticamente las 3 fases y escribe el informe en el
   proyecto: `INFORME_OPTIMIZACION_V<n>.md` (no sobrescribe versiones previas).

Reglas transversales:
- **Lectura-only**: los 7 revisores y el verificador NUNCA modifican archivos;
  solo el sintetizador escribe.
- **Evidencia**: cada hallazgo con `ruta:línea`; lo no verificable se marca
  "necesita verificación"; no inventar.
- **Severidades**: CRITICA | ALTA | MEDIA | BAJA.
- **Métricas reales**: cuando el entorno lo permita, ejecutar tests/lint/
  typecheck e incluir los números en el informe.

## Las 3 fases

### Fase 1 — REVISAR (7 revisores en paralelo, cada uno con su lente)

| # | Lente | Qué revisa |
|---|-------|-----------|
| R1 | **Ambigüedad y testabilidad** | Términos vagos ("rápido", "moderno", "~5@", "óptimo", "en breve") y criterios no medibles ni verificables en código o tests. |
| R2 | **Consistencia** | Contradicciones internas (docs vs código, nombres, estados, versiones), requisitos funcionales sin hito/plazo, dependencias de fases rotas (MP-Fase 2 sin base), flujos que se contradicen. |
| R3 | **Completitud RNF** | Categorías de la norma ISO 25010 ausentes: usabilidad, accesibilidad, fiabilidad, observabilidad, rendimiento, seguridad, mantenibilidad, portabilidad, backup/recuperación, monitoreo, cumplimiento. |
| R4 | **Stakeholders** | Actores ausentes o sin rol definido: huésped real (usuario final), operador de red, recepción/entrega, custodia de claves, soporte, moderación, auditoría, regulación. |
| R5 | **Trazabilidad con el brief** | Deseos del cliente perdidos (no implementados ni documentados) y requisitos INVENTADOS (implementados o documentados sin base en el brief). |
| R6 | **Riesgos técnicos** | Puntos únicos de fallo y riesgos de escala: RPC sin indexador al escalar, chat IA + plazo (promesas no cumplibles), faucet, IPFS (persistencia), mini-worker SPOF, servicios externos sin fallback. |
| R7 | **Seguridad y legal** | Reentrancy, bypass de royalties/pagos, abuso del faucet, exposición de PII, GDPR / registro de viajeros (o normativa equivalente), controles de acceso. |

### Fase 2 — VERIFICAR (crítico adversarial por dimensión)

- 7 verificadores en paralelo, **uno por lente** (R1…R7), que reciben los
  hallazgos del revisor correspondiente.
- Cada verificador **filtra falsos positivos** (reproduce/contrasta contra el
  código), **deduplica**, y **ajusta severidades** (sube o baja con justificación).
- **Por defecto DESCARTA ante la duda**: si no puede confirmar la evidencia, el
  hallazgo se elimina (no se arrastra al informe).
- Salida: lista de hallazgos SUPERVIVIENTES + resumen de descartados (con
  motivo).

### Fase 3 — SINTETIZAR (informe priorizado)

- Consolida los hallazgos verificados de las 7 dimensiones (deduplicación
  cruzada, IDs únicos H-01…, priorización por severidad).
- Escribe el informe: veredicto, tabla por severidad, hallazgos críticos, RNF
  faltantes, stakeholders faltantes y plan de acción (Quick wins / Mejoras /
  Roadmap, con responsables sugeridos y esfuerzo S/M/L).

## Plantilla del workflow (adaptar)

```js
const PROJECT_ROOT = process.cwd() // o la ruta del proyecto
const PROJECT_NAME = '<nombre>'
const OUT_DIR = join(PROJECT_ROOT, '<docs|RepoTecnico|raíz>')
const REPORT_VERSION = '<V2|V3|…>' // default: siguiente versión disponible

const LENS = {
  R1: 'AMBIGÜEDAD Y TESTABILIDAD — términos vagos ("rápido","moderno","~5@","óptimo") y criterios no medibles ni verificables.',
  R2: 'CONSISTENCIA — contradicciones internas, RF sin hito/plazo, dependencias de fases rotas (MP-Fase 2 sin base), flujos contradictorios.',
  R3: 'COMPLETITUD RNF — categorías ISO 25010 ausentes (usabilidad, accesibilidad, fiabilidad, observabilidad, rendimiento, backup/recuperación, monitoreo, cumplimiento).',
  R4: 'STAKEHOLDERS — actores ausentes o sin rol (huésped real, operador de red, recepción/entrega, custodia de claves, soporte, moderación, auditoría, regulación).',
  R5: 'TRAZABILIDAD CON EL BRIEF — deseos del cliente perdidos o requisitos inventados (sin base en el brief).',
  R6: 'RIESGOS TÉCNICOS — RPC sin indexador al escalar, chat IA + plazo, faucet, IPFS, mini-worker SPOF, servicios externos sin fallback.',
  R7: 'SEGURIDAD Y LEGAL — reentrancy, bypass de royalties, abuso del faucet, PII, GDPR/registro de viajeros, control de acceso.',
}

const base = `PROYECTO: ${PROJECT_ROOT} (${PROJECT_NAME}).
TAREA: auditoría LECTURA-ONLY (no modifiques archivos; solo el sintetizador escribe).
Método: lee con read/grep/glob; evidencia ruta:línea; lo no verificable =
"necesita verificación"; no inventes. Máx 12 hallazgos, prioriza los más importantes.
ENTREGABLE: SOLO JSON {summary, findings:[{severity, area, title, detail,
evidence, recommendation}]}, severity ∈ CRITICA|ALTA|MEDIA|BAJA.`

const schema = { type:'object', additionalProperties:true, required:['summary','findings'],
  properties:{ summary:{type:'string'},
    findings:{ type:'array', items:{ type:'object', additionalProperties:true,
      required:['severity','area','title','detail','evidence','recommendation'],
      properties:{ severity:{type:'string',enum:['CRITICA','ALTA','MEDIA','BAJA']},
        area:{type:'string'}, title:{type:'string'}, detail:{type:'string'},
        evidence:{type:'string'}, recommendation:{type:'string'} } } } } }

phase('Fase 1 — Revisar (7 lentes en paralelo)')
const reviewed = {}
const reviewPromises = Object.entries(LENS).map(([k, lense]) =>
  agent(base + `\nLENTE ${k}: ${lense}.`, { label: `R${k.slice(1)}`, phase: 'Fase 1 — Revisar', schema })
    .then((r) => { reviewed[k] = r }))
await Promise.all(reviewPromises)

phase('Fase 2 — Verificar (adversarial por dimensión)')
const verified = {}
const verifyPromises = Object.entries(LENS).map(([k, lense]) =>
  agent(`
Eres el VERIFICADOR adversarial de la dimensión ${k} (${lense}).
Recibes los hallazgos del revisor. Para cada uno: contrástalo contra el código
real de ${PROJECT_ROOT} (read/grep). FILTRA falsos positivos, DEDUPLICA y
AJUSTA severidades con justificación. REGLA: ante la duda, DESCARTA (no lo
arrastres). 
Hallazgos del revisor: ${JSON.stringify(reviewed[k])}
ENTREGABLE: SOLO JSON {summary, discarded:[{title, reason}],
findings:[{severity, area, title, detail, evidence, recommendation}]} con los
hallazgos SUPERVIVIENTES (máx 10).`, { label: `V${k.slice(1)}`, phase: 'Fase 2 — Verificar', schema: { type:'object', additionalProperties:true, required:['summary','findings'],
  properties:{ summary:{type:'string'}, discarded:{type:'array',items:{type:'object',additionalProperties:true}},
    findings:{ type:'array', items:{ type:'object', additionalProperties:true,
      required:['severity','area','title','detail','evidence','recommendation'],
      properties:{ severity:{type:'string',enum:['CRITICA','ALTA','MEDIA','BAJA']},
        area:{type:'string'}, title:{type:'string'}, detail:{type:'string'},
        evidence:{type:'string'}, recommendation:{type:'string'} } } } } } })
    .then((r) => { verified[k] = r }))
await Promise.all(verifyPromises)

phase('Fase 3 — Sintetizar (informe priorizado)')
const report = await agent(`
Eres el SINTETIZADOR. Consolida los hallazgos VERIFICADOS de las 7 dimensiones
(JSON abajo): deduplica entre dimensiones, asigna IDs únicos H-01…, prioriza
por severidad y ESCRIBE con la herramienta write:
${OUT_DIR}\\INFORME_OPTIMIZACION_${REPORT_VERSION}.md
con: 1) Resumen ejecutivo (veredicto: ¿apto para producción?); 2) Metodología
(3 fases, 7 lentes); 3) Estado de calidad (métricas si las hubo); 4) Tabla por
severidad; 5) Hallazgos críticos detallados (evidencia + recomendación); 6) RNF
faltantes; 7) Stakeholders faltantes; 8) Plan de acción (Quick wins / Mejoras /
Roadmap con responsable y esfuerzo S/M/L). NO añadas hallazgos que no estén en
los informes verificados.
VERIFICADOS: ${JSON.stringify(verified)}
Respóndeme un resumen breve (5-8 líneas).`, { label: 'Síntesis', phase: 'Fase 3 — Sintetizar' })

return { reviewed: Object.keys(reviewed).length, verified: Object.keys(verified).length, report }
```

## Calidad de salida

- Informe con veredicto explícito (¿apto para producción?), métricas reales si
  el entorno lo permite, hallazgos accionables con responsable y esfuerzo
  (S/M/L), y criterios de aceptación para la siguiente versión.
- Fase 2 garantiza que solo lleguen al informe hallazgos **confirmados**
  (los dudosos se descartan y se listan con motivo).
- Si el proyecto no tiene alguna área (p. ej. sin frontend), los revisores lo
  indican en su resumen en lugar de forzar hallazgos.
