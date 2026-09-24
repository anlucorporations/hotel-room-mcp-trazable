# Registro de decisiones de arquitectura (ADR)

> **Proyecto**: `hotel-room-mcp-trazable` — Hotel Marina del Sol
> **Creado**: 2026-09-23 (hito **M9**, decisión **D-15**)
> **Estado**: vigente. Es el documento **normativo** de las decisiones técnicas del sistema.
> **Origen**: las decisiones se tomaron en la entrevista posterior a la auditoría V5
> (`RepoTecnico/DECISIONES-AUDITORIA-V5.md`, D-01…D-20) y en el trabajo de cierre de los hitos M0–M8
> (`RepoTecnico/estado_proyecto.md` §9).

## Por qué existe este registro

El código contenía **66 referencias** a documentos que no existían (`ADR-01`…`ADR-22`, `DISEÑO-TECNICO`,
`DISEÑO-UX`, `CASOS-DE-USO`, `CU-01`…`CU-17`, `REQUISITOS`). Eso es el hallazgo **H-16** de la auditoría y
la razón de la decisión **D-15**: cada referencia huérfana tiene aquí su destino. Este registro es la
fuente única de las decisiones; el código, el PRD y el SRS apuntan a él.

## Cómo se usa

- **En el código**: el comentario cita el ADR que explica *por qué* esa pieza es como es (`ADR-11`), no un
  documento de diseño que ya no existe.
- **En el PRD/SRS**: el requisito cita el ADR que fija su comportamiento verificable.
- **Al cambiar una decisión**: se **añade** un ADR que supersede al anterior. Los ADR no se reescriben:
  se sustituyen, y el índice refleja el estado (`vigente`, `sustituido por ADR-XX`).

## Índice

| ADR | Título | Decisiones de origen | Estado |
|---|---|---|---|
| [ADR-01](ADR-01-red-y-contrato-canonicos.md) | Red canónica local (`chainId 81234`) y contrato único `HotelNights` | D-01, D-02 | vigente |
| [ADR-02](ADR-02-contrato-unico-hotel-nights.md) | Un solo contrato: `HotelNights`; la generación `HotelNFT`+`HotelMarketplace` fuera del runtime | D-02 | vigente |
| [ADR-03](ADR-03-postgresql-unica-persistencia.md) | PostgreSQL como única persistencia (también checkpoints y agregados del worker) | D-09, D-10 | vigente |
| [ADR-04](ADR-04-autenticacion-password-totp-jwt.md) | Autenticación: contraseña + TOTP obligatorio + JWT 15 min con rotación y blocklist | D-04 | vigente |
| [ADR-05](ADR-05-check-in-on-chain.md) | Check-in anclado on-chain (`markCheckedIn` + `RECEPTION_ROLE`) y resguardo de un solo uso | D-05, D-18 | vigente |
| [ADR-06](ADR-06-bootstrap-roles-y-revocacion.md) | Bootstrap de roles en el despliegue y revocación del desplegador | D-04, D-11 | vigente |
| [ADR-07](ADR-07-guardas-transferencia-y-cei.md) | Guardas de transferencia (solo mercado propio, CEI) y compra separada del listado | D-05, D-07 | vigente |
| [ADR-08](ADR-08-fechas-utc-y-calendario.md) | Fechas `AAAAMMDD` en UTC y caducidad por umbral; zona del hotel solo off-chain | D-05, D-06 | vigente |
| [ADR-09](ADR-09-bloque-despliegue-fuente-unica.md) | El bloque de despliegue es la fuente única del inicio del escaneo | D-02, D-12 | vigente |
| [ADR-10](ADR-10-confirmaciones-y-getlogs.md) | Confirmaciones, rango de `getLogs` y parámetros de Anvil (Polygon como configuración) | D-12 | vigente |
| [ADR-11](ADR-11-nunca-firmar-tx-no-verificada.md) | Nunca se firma una transacción no verificada (calldata y destino) | D-07 | vigente |
| [ADR-12](ADR-12-metadatos-ipfs-y-cdn.md) | Metadatos en IPFS y entrega por gateway/CDN propio | D-11 | vigente |
| [ADR-13](ADR-13-faucet-de-pruebas.md) | Faucet de pruebas: solo en red local y con `DEPLOY_FAUCET=true` | D-11 | vigente |
| [ADR-14](ADR-14-cotizacion-eur.md) | Cotización EUR desde la cadena con respaldo declarado | — | vigente |
| [ADR-15](ADR-15-pull-over-push.md) | Cobros por *pull* (`claim`) en lugar de envío directo | D-06, D-07 | vigente |
| [ADR-16](ADR-16-venta-primaria-unica.md) | Una sola venta primaria por noche (`soldOnce`) | D-05, D-18 | vigente |
| [ADR-17](ADR-17-espejo-besu.md) | La red local es espejo de la Besu de Codecrypto (mismo `chainId 81234`) | D-01 | vigente |
| [ADR-18](ADR-18-royalty-por-tipo-inmutable.md) | Royalty por tipo de habitación, fijado en el mint e inmutable | D-06 | vigente |
| [ADR-19](ADR-19-suelo-de-precio-de-listado.md) | Suelo de precio de listado, gobernable y nunca nulo | D-06, D-19 | vigente |
| [ADR-20](ADR-20-registro-de-viajeros-fuera.md) | El registro de viajeros (RD 933/2021) queda fuera de la plataforma | D-13, D-14 | vigente |
| [ADR-21](ADR-21-una-cola-y-un-planificador.md) | Una cola única de correo y un planificador en el worker; el monitor conserva su canal | D-03, D-12 | vigente |
| [ADR-22](ADR-22-contrato-inmutable-redeploy.md) | El contrato no se actualiza: un cambio es un redespliegue con dirección nueva | D-02, D-12 | vigente |
| [ADR-23](ADR-23-verificacion-reproducible-y-gates.md) | Verificación reproducible y gates de CI bloqueantes | D-08 | vigente |
| [ADR-24](ADR-24-privacidad-y-minimizacion-pii.md) | Minimización de PII y textos legales conforme al sistema real | D-14 | vigente |
| [ADR-25](ADR-25-dashboard-fuente-unica.md) | El dashboard lee una fuente única (agregados del worker) | D-16 | vigente |
| [ADR-26](ADR-26-resiliencia-y-observabilidad.md) | Resiliencia y observabilidad sin Sentry y sin failover multi-RPC | D-12 | vigente |

## Trazabilidad con las decisiones de la auditoría V5

| Decisión | ADR que la recoge |
|---|---|
| D-01 | ADR-01, ADR-17 |
| D-02 | ADR-01, ADR-02, ADR-09, ADR-22 |
| D-03 | ADR-03, ADR-21 |
| D-04 | ADR-04, ADR-06, ADR-11 |
| D-05 | ADR-05, ADR-07, ADR-08, ADR-16 |
| D-06 | ADR-18, ADR-19, ADR-15 |
| D-07 | ADR-11, ADR-15 |
| D-08 | ADR-23 |
| D-09 | ADR-03 |
| D-10 | ADR-03 |
| D-11 | ADR-06, ADR-12, ADR-13 |
| D-12 | ADR-09, ADR-10, ADR-21, ADR-22, ADR-26 |
| D-13 | ADR-20 |
| D-14 | ADR-20, ADR-24 |
| D-15 | este registro |
| D-16 | ADR-25 |
| D-17 | `docs/RESPUESTA-CLIENTE-BORRADOR.md` |
| D-18 | ADR-05, ADR-16 |
| D-19 | ADR-19 |
| D-20 | ADR-01, ADR-18 |

## Equivalencias con los documentos retirados

Las referencias huérfanas del código se resuelven así:

| Referencia antigua | Significado observado | Destino |
|---|---|---|
| `DISEÑO-TECNICO` / `DISEÑO §n` | documento de diseño que nunca existió en el repositorio | el ADR del asunto citado + `docs/SRS.md` |
| `DISEÑO-UX` | guía de interfaz que nunca existió | `docs/SRS.md` §7 (interfaz) y `docs/ACCESIBILIDAD-WCAG.md` |
| `CASOS-DE-USO §n` | catálogo de casos de uso inexistente | `docs/SRS.md` §9 (catálogo de casos de uso) |
| `CU-nn` (`CU-01`…`CU-17`) | casos de uso citados en comentarios | `docs/SRS.md` §9, tabla de casos de uso |
| `CU-PR-01` | aprovisionamiento de operadores | `docs/SRS.md` §4.9 |
| `REQUISITOS §2.2` | documento de requerimientos inexistente | `RepoTecnico/requerimientos.md` §1 y `docs/PRD.md` §4 |
| `RF-nn`, `RNF-nn`, `RT-nn` | requisitos | se conservan: siguen vigentes en `docs/PRD.md` y `docs/SRS.md` |
| `US-nn` | historias de usuario | se conservan: siguen vigentes en `docs/BACKLOG-SPRINTS.md` |
| `TC-*` | casos de prueba | se conservan: viven en las suites de pruebas |

---

*Registro de ADR · creado en M9 · toda decisión nueva entra aquí antes de tocar el código.*
