# A9 · Drill de restauración a una instancia aislada — guía de ejecución

**Estado:** pendiente **solo** del permiso IAM. El resto del criterio A9 (backups + PITR + outbox) está
cerrado y medido; ver [`evidencias/a9-dr-rpo-rto.json`](./evidencias/a9-dr-rpo-rto.json).

| Dato | Valor |
|---|---|
| Proyecto | `mcc-ecommerce` |
| Instancia origen | `hotel-mcp-pg` (POSTGRES_18, `europe-west1`, IP privada `10.104.0.3`, base `hotel_nft`) |
| PITR | **habilitado**, retención de logs transaccionales **7 días**, backups retenidos 7 (diarios 02:00) |
| Cuenta de automatización | `ds-dev@mcc-ecommerce.iam.gserviceaccount.com` |
| Bloqueo actual | el restore a instancia nueva devuelve **403** por falta de `cloudsql.backups.restore` |
| Drill ya medido (equivalente lógico) | dump 1,2 s + create 0,4 s + restore 1,1 s = **2,76 s**, checksums idénticos en 6 tablas |

> **Quién puede ejecutarlo:** una cuenta con `resourcemanager.projects.setIamPolicy` (Owner o IAM Admin)
> para conceder el permiso a la cuenta de automatización. Después, el drill lo puede correr `ds-dev`
> (o la cuenta que tenga el permiso) sin intervención humana.

---

## 1. Permisos exactos

El drill a **instancia nueva** necesita, como mínimo:

| Permiso | Para |
|---|---|
| `cloudsql.backups.restore` | restaurar un backup en la instancia aislada |
| `cloudsql.backups.get` / `cloudsql.backups.list` | localizar el backup a restaurar |
| `cloudsql.instances.create` / `cloudsql.instances.get` | crear y esperar la instancia destino |
| `cloudsql.instances.delete` | borrar la instancia de prueba al terminar |
| `cloudsql.instances.connect` + `roles/cloudsql.client` | verificar el contenido con `psql` |

**Opción A (rápida, recomendada para la ventana):** conceder `roles/cloudsql.editor` a `ds-dev`
(incluye restore, create y delete), con la ventana acotada y revocándolo al terminar.

```bash
gcloud projects add-iam-policy-binding mcc-ecommerce \
  --member="serviceAccount:ds-dev@mcc-ecommerce.iam.gserviceaccount.com" \
  --role="roles/cloudsql.editor" --condition=None
# propagación ~1-2 min
```

**Opción B (mínimo privilegio):** rol personalizado con los permisos de la tabla.

```bash
gcloud iam roles create hotelMcpDrillRestore --project=mcc-ecommerce \
  --title="Hotel MCP — drill de restore" \
  --permissions=cloudsql.backups.restore,cloudsql.backups.get,cloudsql.backups.list,cloudsql.instances.create,cloudsql.instances.get,cloudsql.instances.delete,cloudsql.instances.connect \
  --stage=GA
gcloud projects add-iam-policy-binding mcc-ecommerce \
  --member="serviceAccount:ds-dev@mcc-ecommerce.iam.gserviceaccount.com" \
  --role="projects/mcc-ecommerce/roles/hotelMcpDrillRestore"
```

**Para el clon PITR (prueba de RPO al instante),** añadir `cloudsql.instances.clone`
(o usar la Opción A, que lo incluye).

---

## 2. Precondiciones

```bash
source /home/dsh/workspace/gcp-env.sh          # carga proyecto y cuenta
GCP_SA=ds-dev bash /home/dsh/workspace/gcp-env.sh   # si se ejecuta con la SA dev
gcloud auth list
gcloud sql instances describe hotel-mcp-pg \
  --format='value(settings.tier,region,databaseVersion,settings.backupConfiguration)'
gcloud sql backups list --instance=hotel-mcp-pg --limit=5
```

Anotar en el JSON de evidencia: **ID del backup**, **tier**, **región** y hora UTC de inicio.

---

## 3. Drill A — restore de backup en instancia aislada (permiso `cloudsql.backups.restore`)

> Mediciones: `T0` = lanzar la creación, `T1` = instancia `RUNNABLE`, `T2` = restore completado,
> `T3` = verificación terminada. **RTO del drill = T3 − T0**.

```bash
set -euo pipefail
SRC=hotel-mcp-pg
DRILL=hotel-mcp-pg-drill
BACKUP_ID="$(gcloud sql backups list --instance="$SRC" --limit=1 --format='value(id)')"
TIER="$(gcloud sql instances describe "$SRC" --format='value(settings.tier)')"

T0=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gcloud sql instances create "$DRILL" \
  --project=mcc-ecommerce --region=europe-west1 \
  --database-version=POSTGRES_18 --tier="$TIER" \
  --no-assign-ip --quiet

gcloud sql backups restore "$BACKUP_ID" \
  --restore-instance="$DRILL" --backup-instance="$SRC" --quiet
T2=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Verificación (con cloud-sql-proxy o desde un job en la VPC):
#   psql "$DATABASE_URL_DRILL" -c "SELECT version();"
#   comparar conteos y checksums con la instancia origen (tablas de abajo)
T3=$(date -u +%Y-%m-%dT%H:%M:%SZ); echo "T0=$T0 T2=$T2 T3=$T3"
```

**Tablas a verificar** (mismas del drill lógico): `nfts`, `rooms`, `on_chain_signatures`,
`worker_sale_history`, `operator_audit_log`, `email_notifications`, más `SELECT COUNT(*)` de
`on_chain_signatures WHERE status='PENDING'` para demostrar que **el outbox no pierde filas**.

```sql
SELECT 'nfts' t, count(*) FROM nfts UNION ALL
SELECT 'rooms', count(*) FROM rooms UNION ALL
SELECT 'on_chain_signatures', count(*) FROM on_chain_signatures UNION ALL
SELECT 'worker_sale_history', count(*) FROM worker_sale_history UNION ALL
SELECT 'operator_audit_log', count(*) FROM operator_audit_log UNION ALL
SELECT 'email_notifications', count(*) FROM email_notifications;
```

Comparación de contenido (opcional, como en el drill de 2026-10-19):

```sql
SELECT md5(string_agg(id::text, ',' ORDER BY id)) FROM nfts;
-- repetir en origen y destino y comparar
```

---

## 4. Drill B — clon PITR (prueba de RPO al instante, permiso `cloudsql.instances.clone`)

Demuestra que se puede recuperar **a un instante concreto** dentro de la retención de 7 días:

```bash
gcloud sql instances clone hotel-mcp-pg hotel-mcp-pg-pitr \
  --point-in-time '2026-10-20T02:30:00.000Z' \
  --project=mcc-ecommerce --quiet
```

Elegir un instante **anterior** al último cambio conocido y comprobar que ese cambio **no** aparece en el
clon (oráculo de RPO); para el RTO, medir `T_clone_ready − T_lanzamiento`.

---

## 5. Limpieza (obligatoria: coste y superficie)

```bash
gcloud sql instances delete hotel-mcp-pg-drill --quiet
gcloud sql instances delete hotel-mcp-pg-pitr --quiet   # si se ejecutó el Drill B
# Revocar la ventana si se usó la Opción A:
gcloud projects remove-iam-policy-binding mcc-ecommerce \
  --member="serviceAccount:ds-dev@mcc-ecommerce.iam.gserviceaccount.com" \
  --role="roles/cloudsql.editor"
```

---

## 6. Evidencia a registrar

Crear `RepoTecnico/evidencias/a9-drill-instancia-aislada-<fecha>.json` con:

```json
{
  "id": "a9-drill-instancia-aislada-2026-XX-XX",
  "criterio": "A9 · restore drill a instancia aislada",
  "proyecto": "mcc-ecommerce",
  "origen": "hotel-mcp-pg",
  "destino": "hotel-mcp-pg-drill",
  "backupId": "…",
  "permisoConcedido": "cloudsql.backups.restore (rol …)",
  "medicionesUtc": { "t0": "…", "instanciaRunnable": "…", "restoreCompletado": "…", "verificacionCompletada": "…" },
  "rtoSegundos": 0,
  "rpo": "PITR 7 días; instante restaurado …",
  "checksums": [{ "tabla": "nfts", "origen": "…", "destino": "…", "coincide": true }],
  "outboxFilasRestauradas": 0,
  "limpieza": "instancia eliminada; rol revocado",
  "resultado": "CUMPLE"
}
```

Después: actualizar la fila **A9** de [`aceptacion_fase3.md`](./aceptacion_fase3.md) con la evidencia
nueva y anotar el cierre en `estado_proyecto.md`. Con eso la **Fase 3 queda al 100%**.

> **Coste orientativo:** una instancia `POSTGRES_18` del mismo tier que producción factura por hora
> mientras exista; el drill completo (crear + restaurar + verificar + borrar) cabe en **< 30 min**.
