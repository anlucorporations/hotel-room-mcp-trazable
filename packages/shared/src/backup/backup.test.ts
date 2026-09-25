import { describe, it, expect } from 'vitest';
import { DisasterRecoveryService } from './service';

describe('DisasterRecoveryService (Fase 2: Resiliencia & DR)', () => {
  const mockDatabaseData = {
    nfts: [
      { id: '1', token_id: 1, room_number: 101, status: 'AVAILABLE' },
      { id: '2', token_id: 2, room_number: 102, status: 'CHECKED_IN' },
    ],
    admin_sessions: [
      { id: 'sess_1', user_id: 'admin', ip_address: '127.0.0.1' },
    ],
    email_notifications: [
      { id: 'notif_1', recipient: 'guest@example.com', status: 'SENT' },
    ],
  };

  it('debe generar un backup plano con checksum SHA-256 y validar su restauración', () => {
    const backup = DisasterRecoveryService.createBackup(mockDatabaseData);

    expect(backup.metadata.id).toBeDefined();
    expect(backup.metadata.encrypted).toBe(false);
    expect(backup.metadata.totalRows).toBe(4);
    expect(backup.metadata.tablesIncluded).toEqual(['nfts', 'admin_sessions', 'email_notifications']);
    expect(backup.metadata.sha256Checksum).toHaveLength(64);

    const { data, isValid } = DisasterRecoveryService.restoreAndVerify(backup);
    expect(isValid).toBe(true);
    expect(data.nfts).toHaveLength(2);
    expect(data.admin_sessions).toHaveLength(1);
    expect(data.email_notifications).toHaveLength(1);
  });

  it('debe generar un backup cifrado con AES-256-GCM y restaurarlo correctamente con la clave', () => {
    const key = 'SuperSecretRecoveryKey2026!';
    const backup = DisasterRecoveryService.createBackup(mockDatabaseData, key);

    expect(backup.metadata.encrypted).toBe(true);
    expect(backup.metadata.algorithm).toBe('AES-256-GCM');
    expect(backup.encryptedData).toBeDefined();
    expect(backup.iv).toBeDefined();
    expect(backup.authTag).toBeDefined();
    expect(backup.rawData).toBeUndefined();

    const { data, isValid } = DisasterRecoveryService.restoreAndVerify(backup, key);
    expect(isValid).toBe(true);
    expect(data.nfts).toHaveLength(2);
    expect(data.nfts![1]).toMatchObject({ status: 'CHECKED_IN' });
  });

  it('debe rechazar la restauración si la clave de descifrado es incorrecta', () => {
    const key = 'CorrectKey123!';
    const wrongKey = 'WrongKey456!';
    const backup = DisasterRecoveryService.createBackup(mockDatabaseData, key);

    expect(() => {
      DisasterRecoveryService.restoreAndVerify(backup, wrongKey);
    }).toThrow();
  });

  it('debe rechazar la restauración si el checksum SHA-256 fue manipulado o corrupto', () => {
    const backup = DisasterRecoveryService.createBackup(mockDatabaseData);
    backup.metadata.sha256Checksum = '0000000000000000000000000000000000000000000000000000000000000000';

    expect(() => {
      DisasterRecoveryService.restoreAndVerify(backup);
    }).toThrow(/Checksum inválido/);
  });

  it('debe validar y certificar los SLAs RPO < 1h y RTO < 4h en el simulacro de recuperación', () => {
    const key = 'ProductionVaultRecoveryKey!';
    const backup = DisasterRecoveryService.createBackup(mockDatabaseData, key);

    const writeTimestamp = Date.now() + 900 * 1000;
    const simResult = DisasterRecoveryService.runDrSimulation(backup, key, writeTimestamp);

    expect(simResult.verifiedChecksum).toBe(true);
    expect(simResult.meetsSla).toBe(true);
    expect(simResult.rpoSeconds).toBeLessThanOrEqual(3600);
    expect(simResult.rtoSeconds).toBeLessThanOrEqual(14400);
    expect(simResult.tablesRestored).toBe(3);
    expect(simResult.rowsRestored).toBe(4);
    expect(simResult.notes).toContain('SLA Cumplido');
  });
});
