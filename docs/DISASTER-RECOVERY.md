# Plan de Recuperación ante Desastres y Continuidad de Negocio (Disaster Recovery)
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.0.0  
> **Fecha**: 2026-09-13  
> **Alcance**: Fase 2 (Post-MVP)  
> **Métricas Comprometidas**: **RPO < 1 hora** | **RTO < 4 horas**  

---

## 1. Arquitectura de Resiliencia y Datos Críticos

La plataforma combina componentes **on-chain** (Polygon PoS) y **off-chain** (PostgreSQL, Redis, Next.js).

1. **Datos On-Chain (Inmutables por Diseño)**:
   - Propiedad de tokens NFT, estado de minteo, depósitos en marketplace y markCheckedIn() residen en Polygon PoS. La blockchain actúa como fuente definitiva de verdad (Source of Truth) descentralizada y no requiere backup convencional.
2. **Datos Off-Chain (Sujetos a Backup y RPO < 1h)**:
   - Tabla nfts: Contiene los secretos check_in_secret_enc cifrados con AES-256-GCM necesarios para validar el acceso en recepción.
   - Tabla admin_sessions y mfa_recovery_codes: Gestión de sesiones administrativas protegidas con MFA.
   - Tabla email_notifications y push_subscriptions: Registro de trazabilidad y comunicaciones a huéspedes.
   - Tabla checkin_contingency_logs: Auditoría de check-ins asistidos para cumplimiento con la normativa policial (RD 933/2021).

---

## 2. Estrategia de Backup Automatizado

- **Frecuencia**: Volcados lógicos diarios programados (pg_dump) con snapshots de disco en GCP cada 1 hora.
- **Cifrado en Reposo**: Los volcados se comprimen con gzip y se cifran simétricamente con AES-256 antes de salir de la instancia de base de datos.
- **Almacenamiento Secundario**: Réplica inmediata en Google Cloud Storage (gsutil) en multirregión con política de retención inmutable de 30 días (Lifecycle Management).
- **Control de Integridad**: Cada archivo de backup genera un fichero .sha256 emparejado. El sistema rechaza cualquier restauración cuyo hash no coincida exactamente.

---

## 3. Runbook Operativo de Restauración (RTO < 4h)

En caso de fallo catastrófico de la instancia GCP o corrupción de la base de datos:

### Paso 1: Re-aprovisionamiento de Instancia (< 30 min)
```bash
# 1. Crear nueva VM en GCP con imagen Debian 12 / Docker
gcloud compute instances create hotel-vm-recovery --zone=europe-west1-b --machine-type=e2-standard-2

# 2. Re-asociar IP estática de producción
gcloud compute instances add-access-config hotel-vm-recovery --address=HOTEL_STATIC_IP
```

### Paso 2: Descarga y Verificación Criptográfica (< 15 min)
```bash
# 3. Descargar el backup más reciente desde GCS
gsutil cp gs://hotel-backup-bucket/hotel_backup_latest.sql.gz.enc .
gsutil cp gs://hotel-backup-bucket/hotel_backup_latest.sql.gz.enc.sha256 .

# 4. Verificar integridad SHA-256
sha256sum -c hotel_backup_latest.sql.gz.enc.sha256

# 5. Descifrar con la clave de Secret Manager
openssl enc -d -aes-256-cbc -in hotel_backup_latest.sql.gz.enc -out hotel_backup.sql.gz -k "$BACKUP_ENCRYPTION_KEY"
gunzip hotel_backup.sql.gz
```

### Paso 3: Restauración en PostgreSQL (< 20 min)
```bash
# 6. Restaurar tablas
psql -h 127.0.0.1 -U hotel_user -d hotel_db < hotel_backup.sql
```

### Paso 4: Reconciliación con la Blockchain Polygon (< 15 min)
```bash
# 7. El Event Listener WebSocket lee automáticamente desde el último bloque indexado
# y ejecuta eth_getLogs para re-sincronizar ventas o check-ins ocurridos durante la contingencia.
pnpm --filter @hotel/worker start
```

**Tiempo Total Estimado de Recuperación**: ~1 hora y 20 minutos (**RTO < 4h holgadamente cumplido**).

---

## 4. Script de Prueba y Simulación

La verificación puede ejecutarse en cualquier momento mediante:
```bash
pnpm test:dr
```
