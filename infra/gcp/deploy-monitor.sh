#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Actualiza SOLO la imagen del worker pool del monitor (Cloud Run v2 por REST).
#
# Por qué por REST: `gcloud run worker-pools update` falla en este SDK con
# `No module named 'grpc'` (módulo Python ausente). Se conserva el resto de la
# plantilla —entorno, secretos, escalado y service account— porque se **reenvía
# el array de contenedores completo** con la imagen sustituida y la máscara se
# limita a `template.containers` (nunca a `template`, que borraría lo demás).
#
#   bash infra/gcp/deploy-monitor.sh europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/monitor:v9
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"

IMAGE="${1:-}"
if [[ -z "$IMAGE" ]]; then
  echo "uso: $0 <imagen-completa>" >&2
  echo "ej.: $0 ${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GCP_AR_REPO}/monitor:v9" >&2
  exit 2
fi

API="https://run.googleapis.com/v2/projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/workerPools/${GCP_MONITOR_POOL}"
TOKEN="$(gcloud auth print-access-token)"
TMP_JSON="$(mktemp)"
TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_JSON" "$TMP_BODY"' EXIT

echo "==> Monitor actual:"
curl -sS -H "Authorization: Bearer ${TOKEN}" "$API" -o "$TMP_JSON"
# Se lee con `readFileSync` y NO con `require`: el fichero temporal no tiene extensión `.json` y
# `require` lo interpretaría como JavaScript (falló en el primer intento real de despliegue).
node -e "const p=JSON.parse(require('node:fs').readFileSync('$TMP_JSON','utf8'));console.log('   pool:',p.name,'\n   imagen:',p.template.containers[0].image,'\n   contenedores:',p.template.containers.length,'· secretos/env:',(p.template.containers[0].env??[]).length)"

# Se conserva TODO el contenedor (entorno, secretos, recursos) y se cambia la imagen.
node -e "
const fs=require('fs');const p=JSON.parse(fs.readFileSync('$TMP_JSON','utf8'));
p.template.containers[0].image='$IMAGE';
fs.writeFileSync('$TMP_BODY', JSON.stringify({ template: { containers: p.template.containers } }));
"
echo "==> Desplegando ${IMAGE}"
curl -sS -X PATCH \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data @"$TMP_BODY" \
  "${API}?updateMask=template.containers" -o /dev/null -w "   HTTP %{http_code}\n"

echo "==> Verificación:"
curl -sS -H "Authorization: Bearer ${TOKEN}" "$API" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);console.log('   imagen:',p.template.containers[0].image);console.log('   env/secretos conservados:',(p.template.containers[0].env??[]).length);})"
