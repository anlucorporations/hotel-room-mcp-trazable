# F8 · Preflight — checklist y ejecución del corte

> **⚠️ DOCUMENTO HISTÓRICO: el corte ya se ejecutó (2026-09-27), con autorización del responsable.**
> La baseline de rollback del §2 y los comandos del §4 describen el estado **previo** al corte. El
> estado vigente está en [`F8-runbook.md`](./F8-runbook.md) §2/§10 y en
> [`despliegue_gcp.md`](./despliegue_gcp.md) §18 (contrato `0xc66A…7b6F`, bloque 314, imágenes `f8`).
> Se conserva porque el §5 (respaldo y rollback) sigue siendo el procedimiento de vuelta atrás.
>
> **Regla de esta preparación**: **no se toca ningún servicio global de GCP** (Anvil global, Cloud
> SQL, Cloud Build, Cloud Run) hasta que el responsable autorice la ejecución con una ventana de
> mantenimiento. Este documento y los scripts asociados están **listos pero sin ejecutar**.
>
> Fase F8 · corte único (D-24) · Fecha: 2026-09-27 · Continúa a [`F8-runbook.md`](./F8-runbook.md) y
> [`F8-ventana-acunado.md`](./F8-ventana-acunado.md)

---

## 1. Artefactos de preparación

| Artefacto | Qué hace |
|---|---|
| `infra/gcp/f8-cut.sh` | Orquestador por fases. **Sin `--execute` solo imprime el plan** (no llama a GCP). |
| `infra/gcp/f8-build-images.sh` | Construye las 4 imágenes (web, worker, mcp, monitor) con el registro vigente. **Dry-run por defecto**. |
| `scripts/dev/f8-rehearsal.sh` | Ensayo **local** desechable: despliega el contrato, siembra y registra las 50 habitaciones e intenta el minteo. **No toca GCP ni el registro real**. |
| `packages/contracts/scripts/inject-data.ts` | Paso 3.5: vuelca el maestro en `rooms` y registra on-chain (idempotente). |
| `packages/shared/scripts/reset-index.ts` | Reset coordinado (D-15): vacía `nfts`, `listings`, `sale_events` y el estado del worker; **conserva** `admin_users`. |

Ensayo ya ejecutado (evidencia): `bash scripts/dev/f8-rehearsal.sh` → **OK** (isRoomRegistered 101/220,
`roomTypeOf` 116/201, 6 eventos `Mint`).

---

## 2. Baseline de rollback (estado **previo** al corte, 2026-09-27)

| Elemento | Valor actual |
|---|---|
| Contrato en el Anvil global | `0x70bDA08DBe07363968e9EE53d899dFE48560605B` · bloque **288** · chainId 31337 |
| Faucet | `0xaB7B4c595d3cE8C85e16DA86630f2fc223B05057` |
| Registro | `packages/shared/deployments/31337.json` |
| Web | revisión `hotel-mcp-web-00007-9f5` (`web:v7`) |
| Worker | revisión `hotel-mcp-worker-00004-pqp` (`worker:v5`) |
| MCP | revisión `hotel-mcp-mcp-00002-j4r` (`mcp:v2`) |
| Monitor | worker pool `hotel-mcp-monitor` (`monitor:v1`) |

> **Histórico**: son los valores **de partida del corte**. El estado en vigor es
> `0xc66A…7b6F` (bloque 314) y las revisiones `web-00008-vnh` / `worker-00005-v52` /
> `mcp-00003-sjj` / `monitor-00002-hn4` (`F8-runbook.md` §2, `despliegue_gcp.md` §18).

---

## 3. Precondiciones (no ejecutar sin todas)

- [ ] **Autorización explícita** del responsable y **ventana de mantenimiento** acordada.
- [ ] **Respaldo de Cloud SQL** verificado (fase A) y su identificador anotado.
- [ ] `DEPLOYER_PRIVATE_KEY` (cuenta 0, con `DEFAULT_ADMIN_ROLE`) disponible en el entorno.
- [ ] Árbol de git **limpio** y commit fijado (los scripts avisan si no lo está).
- [ ] `forge`/`cast` disponibles (`~/.foundry/bin`) para el despliegue y la verificación.
- [ ] Aviso a quien consuma el Anvil **compartido** con `mcc-ecommerce` (P-5).
- [ ] Las 4 imágenes se reconstruirán en la fase E (mcp/monitor llevan hoy imágenes antiguas).

---

## 4. Fases (una a una; cada una con `--execute`)

```bash
source infra/gcp/gcp-env.sh
source "$HOME/google-cloud-sdk/bin/completion.bash" 2>/dev/null || true
export PATH="$HOME/google-cloud-sdk/bin:$HOME/.foundry/bin:$PATH"

bash infra/gcp/f8-cut.sh                       # plan completo, no toca nada
```

### Fase A · Respaldo
```bash
bash infra/gcp/f8-cut.sh --phase=backup --execute
# el script crea un backup bajo demanda; verifica:
gcloud sql backups list --instance=hotel-mcp-pg --project=hotel-mcp --limit=3
```

### Fase B · Contrato nuevo + sincronizar el registro
```bash
export DEPLOYER_PRIVATE_KEY=0x…            # cuenta 0
bash infra/gcp/f8-cut.sh --phase=contract --execute
node -e "console.log(require('./packages/shared/deployments/31337.json'))"   # dirección y bloque NUEVOS
```

### Fase C · Reset coordinado (D-15) — **job de Cloud Run**
Cloud SQL es de IP privada: **no** se puede ejecutar desde aquí. Se hace con el job de siembra.
```bash
# 1) Captura la config actual del job (para poder restaurarla):
gcloud run jobs describe hotel-mcp-inject-data --project=hotel-mcp --region=europe-west1 --format=export
# 2) Pon la imagen F8 (conserva command/args/env/red/secretos):
gcloud run jobs update hotel-mcp-inject-data --project=hotel-mcp --region=europe-west1 \
  --image=europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/mcp:f8
# 3) Modo seco y aplicación:
gcloud run jobs execute hotel-mcp-inject-data --project=hotel-mcp --region=europe-west1 \
  --args='node --import tsx packages/shared/scripts/reset-index.ts'
gcloud run jobs execute hotel-mcp-inject-data --project=hotel-mcp --region=europe-west1 \
  --args='node --import tsx packages/shared/scripts/reset-index.ts --apply'
```
> Si el job no admite override de `--args`, créale un gemelo `hotel-mcp-f8-reset` con la misma
> imagen, red, secretos y variables (cópialos del `describe`).

### Fase D · Sembrar habitaciones + `registerRoom`
```bash
gcloud run jobs execute hotel-mcp-inject-data --project=hotel-mcp --region=europe-west1
# el paso 3.5 de inject-data siembra rooms y registra las 50 (idempotente)
```

### Fase E · Imágenes y redespliegue
```bash
bash infra/gcp/f8-cut.sh --phase=build  --execute   # 4 imágenes con el registro nuevo
bash infra/gcp/f8-cut.sh --phase=deploy --execute   # worker, mcp, web
# monitor (worker pool): captura su config y redespliega solo la imagen
gcloud run worker-pools describe hotel-mcp-monitor --project=hotel-mcp --region=europe-west1 --format=export
gcloud run worker-pools deploy hotel-mcp-monitor --project=hotel-mcp --region=europe-west1 \
  --image=europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/monitor:f8
```

### Verificación
```bash
curl -s https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app/health/ready | jq .
cast call <NUEVO> "isRoomRegistered(uint256)(bool)" 101 --rpc-url "$GCP_ANVIL_URL"   # true
cast call <NUEVO> "roomTypeOf(uint256)(string)" 116 --rpc-url "$GCP_ANVIL_URL"       # doble
```
Más: publicar una ficha en `/admin/habitacion` y comprobar que ancla la huella (200 con `txHash`),
`/api/public/rooms` coherente, `/api/nfts` con las noches sembradas y worker `lag: 0`.

---

## 5. Respaldo y rollback

- **Respaldo**: `gcloud sql backups create` (fase A) + export opcional a GCS
  (`GCP_BACKUP_BUCKET`) y `~/.config/hotel-mcp/inject-data-output.txt` (credenciales de operador).
- **Rollback del contrato**: restaurar `packages/shared/deployments/31337.json` a
  `0x70bD…605B`/bloque 288, reconstruir imágenes con esos valores y redesplegar. El contrato
  antiguo **no exige registro** pero tampoco ancla publicaciones.
- **Rollback de la BD**: restaurar desde el backup de la fase A (destructivo: coordinar y verificar).
- **Rollback de imágenes**: volver a las revisiones del §2.

---

## 6. Riesgos abiertos

| Riesgo | Mitigación |
|---|---|
| Corte **destructivo** (D-15) | Respaldo verificado + ventana + este checklist |
| Anvil global **compartido** con `mcc-ecommerce` (P-5) | Despliegue aditivo; no reiniciar el servicio |
| Reset por job con override de `args` no soportado | Crear job gemelo con la config del `describe` |
| 50 `registerRoom` secuenciales | Idempotente y reanudable |
| `mcp`/`monitor` con imágenes antiguas | Se reconstruyen en la fase E (alinea ABIs) |
| Tarifas/descripciones **provisionales** del seed | Editarlas en la ficha antes de publicar (D-6) |
