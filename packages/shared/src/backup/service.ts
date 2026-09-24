import crypto from 'node:crypto';

export interface BackupMetadata {
  id: string;
  timestamp: string; // ISO string
  filename: string;
  sizeBytes: number;
  sha256Checksum: string;
  encrypted: boolean;
  algorithm: string;
  tablesIncluded: string[];
  totalRows: number;
  status: 'SUCCESS' | 'FAILED';
}

export interface BackupPayload {
  metadata: BackupMetadata;
  encryptedData?: string; // Base64 si encrypted = true
  rawData?: string;       // JSON string de los datos si encrypted = false
  iv?: string;            // Base64 si encrypted
  authTag?: string;       // Base64 si encrypted
}

export interface RecoverySimulationResult {
  backupId: string;
  verifiedChecksum: boolean;
  rtoSeconds: number;
  rpoSeconds: number;
  tablesRestored: number;
  rowsRestored: number;
  meetsSla: boolean;
  notes: string;
}

export class DisasterRecoveryService {
  /**
   * Genera un snapshot lógico de las tablas críticas del sistema y calcula su checksum SHA-256.
   * Si se proporciona una encryptionKey, los datos se cifran con AES-256-GCM.
   */
  public static createBackup(
    tablesData: Record<string, unknown[]>,
    encryptionKey?: string
  ): BackupPayload {
    const backupId = `bkp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();
    const tablesIncluded = Object.keys(tablesData);
    const totalRows = tablesIncluded.reduce((acc, t) => acc + (tablesData[t]?.length || 0), 0);

    const serialized = JSON.stringify(tablesData);
    const rawSize = Buffer.byteLength(serialized, 'utf-8');
    const sha256Checksum = crypto.createHash('sha256').update(serialized).digest('hex');

    let encrypted = false;
    let algorithm = 'NONE';
    let encryptedData: string | undefined;
    let iv: string | undefined;
    let authTag: string | undefined;

    if (encryptionKey) {
      encrypted = true;
      algorithm = 'AES-256-GCM';
      const keyBuffer = crypto.scryptSync(encryptionKey, 'hotel_salt_dr', 32);
      const ivBuffer = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, ivBuffer);

      let enc = cipher.update(serialized, 'utf-8', 'base64');
      enc += cipher.final('base64');
      const tag = cipher.getAuthTag();

      encryptedData = enc;
      iv = ivBuffer.toString('base64');
      authTag = tag.toString('base64');
    }

    const metadata: BackupMetadata = {
      id: backupId,
      timestamp,
      filename: `${backupId}.dump${encrypted ? '.enc' : '.json'}`,
      sizeBytes: encrypted ? Buffer.byteLength(encryptedData || '', 'utf-8') : rawSize,
      sha256Checksum,
      encrypted,
      algorithm,
      tablesIncluded,
      totalRows,
      status: 'SUCCESS',
    };

    return {
      metadata,
      encryptedData,
      rawData: encrypted ? undefined : serialized,
      iv,
      authTag,
    };
  }

  /**
   * Verifica la integridad de un backup y restaura los datos.
   */
  public static restoreAndVerify(
    payload: BackupPayload,
    encryptionKey?: string
  ): { data: Record<string, unknown[]>; isValid: boolean } {
    let serializedData: string;

    if (payload.metadata.encrypted) {
      if (!encryptionKey) {
        throw new Error('DisasterRecoveryService: Se requiere clave de descifrado para este backup.');
      }
      if (!payload.encryptedData || !payload.iv || !payload.authTag) {
        throw new Error('DisasterRecoveryService: Payload cifrado incompleto (falta IV o AuthTag).');
      }

      const keyBuffer = crypto.scryptSync(encryptionKey, 'hotel_salt_dr', 32);
      const ivBuffer = Buffer.from(payload.iv, 'base64');
      const authTagBuffer = Buffer.from(payload.authTag, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer);
      decipher.setAuthTag(authTagBuffer);

      let decrypted = decipher.update(payload.encryptedData, 'base64', 'utf-8');
      decrypted += decipher.final('utf-8');
      serializedData = decrypted;
    } else {
      if (!payload.rawData) {
        throw new Error('DisasterRecoveryService: Payload sin datos planos disponibles.');
      }
      serializedData = payload.rawData;
    }

    // Verificar Checksum SHA-256 de los datos originales
    const calculatedChecksum = crypto.createHash('sha256').update(serializedData).digest('hex');
    const isValid = calculatedChecksum === payload.metadata.sha256Checksum;

    if (!isValid) {
      throw new Error(`DisasterRecoveryService: Checksum inválido. Esperado: ${payload.metadata.sha256Checksum}, Calculado: ${calculatedChecksum}`);
    }

    const data: Record<string, unknown[]> = JSON.parse(serializedData);
    return { data, isValid: true };
  }

  /**
   * Ejecuta un simulacro de recuperación ante desastres calculando el RTO (tiempo de recuperación)
   * y el RPO (antigüedad máxima de los datos respaldados), certificando el cumplimiento del SLA:
   * - RPO < 1 hora (3600 segundos)
   * - RTO < 4 horas (14400 segundos)
   */
  public static runDrSimulation(
    payload: BackupPayload,
    encryptionKey?: string,
    lastWriteTimestampMs?: number
  ): RecoverySimulationResult {
    const startTime = Date.now();

    const { data, isValid } = this.restoreAndVerify(payload, encryptionKey);

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const rtoSeconds = Math.max(0.1, Number((durationMs / 1000).toFixed(2)));

    const backupTimestampMs = new Date(payload.metadata.timestamp).getTime();
    const writeTime = lastWriteTimestampMs || backupTimestampMs;
    const rpoSeconds = Math.max(0, Math.floor((writeTime - backupTimestampMs) / 1000));

    const SLA_MAX_RPO_SECONDS = 3600;  // 1 hora
    const SLA_MAX_RTO_SECONDS = 14400; // 4 horas

    const meetsSla = isValid && rpoSeconds <= SLA_MAX_RPO_SECONDS && rtoSeconds <= SLA_MAX_RTO_SECONDS;

    const tablesRestored = Object.keys(data).length;
    const rowsRestored = Object.values(data).reduce((acc, rows) => acc + (Array.isArray(rows) ? rows.length : 0), 0);

    return {
      backupId: payload.metadata.id,
      verifiedChecksum: isValid,
      rtoSeconds,
      rpoSeconds,
      tablesRestored,
      rowsRestored,
      meetsSla,
      notes: meetsSla
        ? `SLA Cumplido: RPO=${rpoSeconds}s (<3600s), RTO=${rtoSeconds}s (<14400s), SHA-256 verificado.`
        : `SLA Incumplido: Verifique integridad o latencia de restauración.`,
    };
  }
}
