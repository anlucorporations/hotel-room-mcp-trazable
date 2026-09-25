# ADR-20 · El registro de viajeros queda fuera de la plataforma

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-13, D-14

## Contexto

El sistema decía cumplir el RD 933/2021 generando una «ficha policial» simulada que no enviaba nada, y el
camino de contingencia del check-in aceptaba y **persistía** datos personales (nombre, teléfono, DNI) que
la plataforma afirmaba no recoger.

## Decisión

El registro de viajeros se cumple en el **PMS/mostrador del hotel**, fuera del sistema; la plataforma no
acepta ni devuelve datos de filiación: la ruta de sincronización de PMS queda protegida con
`RECEPTION_ROLE` y **rechaza con 400** cualquier cuerpo con `guestName`, `documentNumber`, `documentType`
o `guestNationality`. La prueba de posesión del camino de contingencia exige un patrón estricto por tipo
(dirección, hash de transacción o código de resguardo emitido por el hotel `MDS-` + 6-12 en mayúsculas)
para que un nombre o un DNI no puedan satisfacerlo, y el motivo de contingencia pasa de texto libre a
**vocabulario cerrado** (`SIN_DISPOSITIVO`, `RESGUARDO_IMPRESO`, `FALLO_TECNICO`, `OTRO`).

## Consecuencias

- Si el hotel no puede conectar su PMS, el registro se sigue haciendo a mano como hoy.
- La detección de documentos normaliza separadores (`12345678-Z`, `123.456.78z`).
- La obligación legal es del hotel y así se declara en los textos legales.

## Dónde se ve

`packages/shared/src/pms/adapter.ts`, `apps/web/src/app/api/reception/pms-sync/route.ts`, `packages/shared/src/reception/service.ts`, `docs/COMPLIANCE.md`.
