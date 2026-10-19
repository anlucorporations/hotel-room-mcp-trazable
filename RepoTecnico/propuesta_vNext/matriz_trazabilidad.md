# Matriz de trazabilidad — requisitos y casos de uso de la Fase 3

Generada el 2026-10-19 a partir de `plan_desarrollo.md` y cerrada con la verificación de A2: **ningún requisito ni CU-V queda huérfano**.

- Requisitos cubiertos: **51/51** (30 RF + 21 RNF)
- Casos de uso cubiertos: **45/45**
- Huérfanos: requisitos=ninguno, CU-V=ninguno

## Requisitos → ciclo(s)

| Requisito | Ciclo(s) |
|---|---|
| RF-K-01 | F6 |
| RF-K-02 | F6 |
| RF-K-03 | F6 |
| RF-K-04 | F6 |
| RF-K-05 | F6 |
| RF-K-06 | F6 |
| RF-K-07 | F6 |
| RF-K-08 | F10, F7 |
| RF-K-09 | F8 |
| RF-K-10 | F6 |
| RF-M-01 | F10, F4 |
| RF-M-02 | F4 |
| RF-M-03 | F4 |
| RF-M-04 | F4 |
| RF-M-05 | F4 |
| RF-M-06 | F4 |
| RF-M-07 | F4 |
| RF-M-08 | F4, F5 |
| RF-M-09 | F4, F5 |
| RF-M-10 | F4 |
| RF-M-11 | F4 |
| RF-M-12 | F4 |
| RF-S-01 | F2 |
| RF-S-02 | F2, F4 |
| RF-S-03 | F2, F6 |
| RF-S-04 | F7 |
| RF-S-05 | F2, F4, F9 |
| RF-S-06 | F5, F8 |
| RF-S-07 | F4 |
| RF-S-08 | F9 |
| RNF-M-01 | F9 |
| RNF-M-02 | F4 |
| RNF-M-03 | F3 |
| RNF-M-04 | F6 |
| RNF-M-05 | F10, F4, F6 |
| RNF-M-06 | F1, F4 |
| RNF-M-07 | F2 |
| RNF-M-08 | F2 |
| RNF-M-09 | F5 |
| RNF-M-10 | F7 |
| RNF-M-11 | F9 |
| RNF-M-12 | F3, F9 |
| RNF-M-13 | F10, F3 |
| RNF-M-14 | F3 |
| RNF-M-15 | F9 |
| RNF-M-16 | F9 |
| RNF-M-17 | F5 |
| RNF-M-18 | F5 |
| RNF-M-19 | F1, F7 |
| RNF-M-20 | F5 |
| RNF-M-21 | F8 |

## Casos de uso → ciclo(s)

| CU-V | Ciclo(s) |
|---|---|
| CU-V-01 | F4 |
| CU-V-02 | F4 |
| CU-V-03 | F10, F2, F3, F4 |
| CU-V-04 | F4 |
| CU-V-05 | F10, F4 |
| CU-V-06 | F4 |
| CU-V-07 | F4 |
| CU-V-08 | F4, F5 |
| CU-V-09 | F4, F8 |
| CU-V-10 | F4 |
| CU-V-11 | F4 |
| CU-V-12 | F5 |
| CU-V-13 | F5 |
| CU-V-14 | F5 |
| CU-V-15 | F5 |
| CU-V-16 | F6 |
| CU-V-17 | F6 |
| CU-V-18 | F6 |
| CU-V-19 | F6 |
| CU-V-20 | F6 |
| CU-V-21 | F6 |
| CU-V-22 | F6 |
| CU-V-23 | F6 |
| CU-V-24 | F7 |
| CU-V-25 | F8 |
| CU-V-26 | F6 |
| CU-V-27 | F5 |
| CU-V-28 | F6 |
| CU-V-29 | F5, F6 |
| CU-V-30 | F8 |
| CU-V-31 | F10 |
| CU-V-32 | F10 |
| CU-V-33 | F7 |
| CU-V-34 | F7 |
| CU-V-35 | F9 |
| CU-V-36 | F9 |
| CU-V-37 | F9 |
| CU-V-38 | F9 |
| CU-V-39 | F8, F9 |
| CU-V-40 | F1, F9 |
| CU-V-41 | F7 |
| CU-V-42 | F7 |
| CU-V-43 | F9 |
| CU-V-44 | F9 |
| CU-V-45 | F9 |

## Notas de cierre

- `RF-K-10` (informes de productividad) y `CU-V-26` se cubren con el informe `/ama-de-llaves/informes` (F6).
- `CU-V-27` (autenticación por PIN) y `CU-V-29` (registrar estado/completar tarea) se cubren con el terminal (F5); `CU-V-28` (habitaciones asignadas del turno) con el tablero de asignaciones (F6).
- La evidencia de pruebas por ciclo está en `RepoTecnico/evidencias/` y en `estado_proyecto.md`.
