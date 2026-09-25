#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 20 — Cuentas de servicio, roles y Workload Identity Federation
#
# Crea:
#   - ci-deployer      : identidad de los pipelines CI/CD
#   - hotel-mcp-run    : identidad de ejecución de los servicios Cloud Run
#
# NO crea claves JSON: la organización aplica la política
# constraints/iam.disableServiceAccountKeyCreation. La autenticación de la CI
# se hace por Workload Identity Federation (OIDC de GitHub y de GitLab).
#
# Idempotente.
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./gcp-env.sh
source "$HERE/gcp-env.sh"

PROJECT="$GCP_PROJECT_ID"
PN="$GCP_PROJECT_NUMBER"

create_sa() {
  local id="$1" display="$2" desc="$3"
  if gcloud iam service-accounts describe "${id}@${PROJECT}.iam.gserviceaccount.com" \
       --project="$PROJECT" >/dev/null 2>&1; then
    echo "    ya existe: $id"
  else
    gcloud iam service-accounts create "$id" \
      --display-name="$display" --description="$desc" --project="$PROJECT"
  fi
}

add_role() {
  local member="$1" role="$2"
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$member" --role="$role" \
    --condition=None --quiet >/dev/null
  echo "    $member <- $role"
}

echo "==> Cuentas de servicio"
create_sa ci-deployer "hotelMCP CI/CD Deployer" \
  "Cuenta de servicio para pipelines CI/CD del proyecto hotelMCP"
create_sa hotel-mcp-run "hotelMCP Cloud Run runtime" \
  "Identidad de ejecucion de los servicios Cloud Run"

echo "==> Roles de ci-deployer"
for r in roles/artifactregistry.writer roles/run.admin roles/cloudsql.client \
         roles/iam.serviceAccountUser roles/logging.logWriter \
         roles/monitoring.metricWriter roles/secretmanager.secretAccessor; do
  add_role "$GCP_CI_SA" "$r"
done

echo "==> Roles de hotel-mcp-run"
for r in roles/cloudsql.client roles/secretmanager.secretAccessor \
         roles/logging.logWriter roles/monitoring.metricWriter; do
  add_role "$GCP_RUN_SA" "$r"
done

# --- Workload Identity Federation -----------------------------------------
ensure_pool() {
  local pool="$1" display="$2" desc="$3"
  if gcloud iam workload-identity-pools describe "$pool" \
       --location=global --project="$PROJECT" >/dev/null 2>&1; then
    echo "    pool ya existe: $pool"
  else
    gcloud iam workload-identity-pools create "$pool" \
      --location=global --project="$PROJECT" \
      --display-name="$display" --description="$desc"
  fi
}

ensure_gh_provider() {
  if gcloud iam workload-identity-pools providers describe github-provider \
       --location=global --workload-identity-pool=github-pool \
       --project="$PROJECT" >/dev/null 2>&1; then
    echo "    provider ya existe: github-provider"
    return
  fi
  gcloud iam workload-identity-pools providers create-oidc github-provider \
    --location=global --workload-identity-pool=github-pool --project="$PROJECT" \
    --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '${GCP_GITHUB_REPO}'"
}

ensure_gl_provider() {
  if gcloud iam workload-identity-pools providers describe gitlab-provider \
       --location=global --workload-identity-pool=gitlab-pool \
       --project="$PROJECT" >/dev/null 2>&1; then
    echo "    provider ya existe: gitlab-provider"
    return
  fi
  gcloud iam workload-identity-pools providers create-oidc gitlab-provider \
    --location=global --workload-identity-pool=gitlab-pool --project="$PROJECT" \
    --display-name="GitLab codecrypto OIDC" \
    --issuer-uri="${GCP_GITLAB_ISSUER}" \
    --attribute-mapping="google.subject=assertion.sub,attribute.project_path=assertion.project_path,attribute.namespace_id=assertion.namespace_id,attribute.ref=assertion.ref,attribute.ref_type=assertion.ref_type" \
    --attribute-condition="assertion.project_path == '${GCP_GITLAB_PROJECT_PATH}'"
}

echo "==> Workload Identity Federation"
ensure_pool github-pool "GitHub Actions pool" \
  "Federacion OIDC para CI/CD sin claves de servicio"
ensure_gh_provider
ensure_pool gitlab-pool "GitLab pool" \
  "Federacion OIDC para CI/CD de GitLab autoalojado"
ensure_gl_provider

bind_wif() {
  local member="$1"
  gcloud iam service-accounts add-iam-policy-binding "$GCP_CI_SA" \
    --project="$PROJECT" --role=roles/iam.workloadIdentityUser \
    --member="$member" >/dev/null
  echo "    ci-deployer <- $member"
}

echo "==> Enlaces Workload Identity -> ci-deployer"
bind_wif "principalSet://iam.googleapis.com/projects/${PN}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${GCP_GITHUB_REPO}"
bind_wif "principalSet://iam.googleapis.com/projects/${PN}/locations/global/workloadIdentityPools/gitlab-pool/attribute.project_path/${GCP_GITLAB_PROJECT_PATH}"

echo "==> Hecho."
