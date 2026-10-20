# Revisión legal de distribución de la APK — Play Billing, NFT y consumo (H-02)

> **Tipo:** artefacto para cierre del hallazgo **H-02** de
> [`INFORME_AUDITORIA_CASOS_USO_V1.md`](./INFORME_AUDITORIA_CASOS_USO_V1.md).
> **Estado:** **borrador para dictamen externo**. No sustituye el asesoramiento jurídico.
> **Fecha:** 2026-10-20 · **Responsable sugerido:** asesoría legal del cliente + dirección de producto.
> **Alcance:** APK Android del huésped (`RepoTecnico/casos_uso_apk.md`, decisiones A-1/A-2/A-3) en la UE
> (España) y las políticas de Google Play **vigentes en la fecha de publicación**.

---

## 1. Por qué este documento bloquea la publicación

La APK v1 permite **comprar noches (NFT), pujar en subastas y contratar servicios de alojamiento**. Eso
cruza tres marcos que hay que resolver **antes** de publicar:

1. **Política de pagos de Google Play** para bienes y servicios digitales (¿la compra de una noche/NFT es
   un bien digital sujeto a Play Billing? ¿cabe tratarlo como servicio del mundo real?).
2. **Políticas específicas de NFT/blockchain** de la tienda (requisitos de transparencia, tokens,
   contenidos restringidos y verificación).
3. **Derecho de consumo de la UE/ES**: información precontractual, precio total, **desistimiento** y su
   excepción para servicios de ocio con fecha determinada; garantías y reclamaciones.

> El riesgo no es solo de rechazo de la app: una compra fuera de la política puede suponer retirada de la
> ficha, suspensión de la cuenta de desarrollador y obligaciones de reembolso.

---

## 2. Decisiones que debe tomar el cliente (con recomendación de producto)

| # | Decisión | Opción A (recomendada si la ley/tienda lo permite) | Opción B | Opción C |
|---|---|---|---|---|
| L-1 | **Dónde se paga en v1** | **Todo el pago en la web** (`/reservar`/`/catalogo`); la APK muestra la noche y **abre el checkout web** (sin compra dentro de la app) | Compra **dentro de la app** con Play Billing (si la política lo admite para NFT/servicio) | Compras in-app solo en regiones donde la política lo permita |
| L-2 | **Naturaleza del NFT** | Vender la **noche como servicio de alojamiento** y el NFT como resguardo/registro (no como activo especulativo) | Vender el NFT como activo digital (requiere análisis MiCA/consumo adicional) | Modelo mixto por tipo de noche |
| L-3 | **Desistimiento** | Informar y aplicar la **excepción de servicios de ocio con fecha determinada** (art. 103.1.i TRLGDCU), con confirmación expresa del huésped | Desistimiento estándar de 14 días (inviable para una noche concreta) | Política híbrida (reventa permitida como mitigación) |
| L-4 | **Reventa y subastas en la app** | **Fuera de la APK v1**; solo web (reduce superficie regulatoria) | Incluir con Play Billing y condiciones específicas | Incluir solo reventa a precio fijo |
| L-5 | **Información precontractual** | Pantalla de resumen con precio total (impuestos incluidos), condiciones, política de cancelación y enlace a términos antes de firmar | Solo enlace a la web | — |

**Recomendación de producto:** **L-1 Opción A + L-4 fuera de la APK v1** (la app descubre, guarda el
resguardo y hace check-in; el pago ocurre en la web). Reduce el riesgo de Play Billing y acelera la
publicación; la compra in-app se reevalúa cuando exista dictamen legal.

---

## 3. Checklist para la asesoría legal (preguntas concretas)

### Google Play
- [ ] ¿La venta de una **noche de hotel** tokenizada como NFT se considera *digital good* sujeta a Play
      Billing, o *real-world service*?
- [ ] ¿Qué requisitos de la **política de NFT/blockchain** aplican (divulgación de términos, wallet,
      secondary market, contenidos restringidos) y hay que registrar la app en algún programa?
- [ ] ¿Se permite **enlazar a un checkout web** para el pago? ¿Con qué restricciones por región?
- [ ] ¿Qué datos de la ficha (capturas, descripción, clasificación de edad) exige la tienda para un
      producto con criptoactivos?
- [ ] ¿Riesgo de rechazo por la palabra «NFT»/«blockchain» en la ficha? ¿Alternativas de copy?

### Consumo (UE/ES)
- [ ] Texto de **información precontractual** y confirmación del pedido (precio total con impuestos,
      fecha, política de cancelación/reventa).
- [ ] ¿Es aplicable la **excepción de desistimiento** del art. 103.1.i TRLGDCU? Redacción del
      consentimiento expreso y su registro.
- [ ] Condiciones de **reventa** (¿el huésped revende un servicio? implicaciones de consumo y fiscalidad).
- [ ] **Atención al cliente** y resolución de reclamaciones (canal, plazos, enlace en la app).

### MiCA / fiscalidad
- [ ] ¿El NFT-noche es un **instrumento financiero/criptoactivo** sujeto a MiCA o queda fuera por su
      finalidad de uso (alojamiento)? Dictamen explícito (RF-23).
- [ ] Tratamiento de **IVA** de la venta primaria y de la reventa con royalty.
- [ ] Obligaciones de **prevención de blanqueo** si se opera con criptoactivos (¿aplica al hotel?).

---

## 4. Cambios que se aplicarían a los artefactos según la decisión

| Decisión | Cambios en `casos_uso_apk.md` | Cambios en web/PRD |
|---|---|---|
| L-1 = A (checkout web) | CU-A-07/08/13 pasan a «descubrir y abrir checkout web»; se elimina la firma en la app; CU-A-18 sigue protegiendo el resguardo | PRD: nota de canal de pago por plataforma |
| L-1 = B (Play Billing) | CU-A-07/08/13 con flujo de compra Play + entrega del NFT; nuevos criterios de recibo/restauración | PRD/SRS: requisito de facturación multiplataforma |
| L-4 = fuera de v1 | CU-A-12/13 se marcan «v1.1»; matriz de paridad se actualiza | — |
| L-3 | Nuevo criterio en CU-A-01/07 de consentimiento informado y registro | Textos legales y `/terminos` |

---

## 5. Criterio de cierre de H-02

H-02 se considerará **cerrado** cuando exista:
1. Dictamen escrito de la asesoría legal sobre §3 (al menos Play y consumo).
2. Decisión registrada de L-1…L-5 en `estado_proyecto.md`.
3. Artefactos actualizados (§4) y criterios de aceptación de la APK ajustados.
4. Evidencia de la **ficha de Play** revisada (textos, capturas, clasificación) antes del envío.
