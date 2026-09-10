# Guía Operativa de Gobernanza: Gnosis Safe Multisig 2-of-3
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.0.0  
> **Fecha**: 2026-09-08  
> **Ámbito**: Producción (Polygon PoS - ChainId 137)  
> **Referencia**: PRD v1.1.0, SRS v1.3.0  

---

## 1. Introducción y Rol de la Multisig

En el entorno de producción, la multisig **Gnosis Safe 2-of-3** ostenta de manera exclusiva el rol on-chain `DEFAULT_ADMIN_ROLE` en los contratos inteligentes `HotelNFT.sol` y `HotelMarketplace.sol`.

Para ejecutar cualquier transacción administrativa se requiere la firma coordinada de al menos **2 de los 3 custodios designados**:
- **Custodio 1**: Carlos (Propietario / Dirección General del Hotel).
- **Custodio 2**: Director de Operaciones / Finanzas.
- **Custodio 3**: Líder Técnico / Responsable DevOps.

---

## 2. Procedimientos Operativos de Emergencia (Runbooks)

### 2.1 Pausado de Emergencia de Contratos (`pause()`)

**Cuándo aplicar**: Ante la detección de una vulnerabilidad activa, intento de explotación o comportamiento anómalo en la lógica de transferencias o compraventa.

1. **Creación de la Propuesta**:
   - Acceder a la interfaz web oficial de [Safe{Wallet}](https://app.safe.global/) conectando con la wallet del Custodio inicial.
   - Seleccionar la Safe de producción en Polygon PoS.
   - Ir a **"New Transaction"** -> **"Contract Interaction"**.
   - Ingresar la dirección del contrato afectado (`HotelNFT` o `HotelMarketplace`).
   - Cargar el ABI del contrato y seleccionar el método `pause()`.
   - Crear y firmar la transacción como proponente inicial.

2. **Revisión y Segunda Firma**:
   - Notificar al segundo custodio mediante canal cifrado verificado (Signal / Llamada telefónica directa).
   - El segundo custodio accede a la app de Safe, verifica los parámetros de la transacción y añade su firma.
   - La transacción se difunde a la red Polygon; el contrato pasa inmediatamente a estado `paused()`.

3. **Reanudación (`unpause()`)**:
   - Una vez mitigada la causa raíz del incidente, se repite el mismo flujo invocando el método `unpause()`.

---

### 2.2 Revocación Inmediata de Roles Comprometidos (`revokeRole`)

**Cuándo aplicar**: En caso de sospecha o confirmación de compromiso de la clave privada de la hot-wallet del backend relayer (`MINTER_ROLE`) o del bot burner (`BURNER_ROLE`).

1. En Safe{Wallet}, generar transacción hacia `HotelNFT`.
2. Seleccionar el método `revokeRole(bytes32 role, address account)`.
   - Para el relayer: `role = keccak256("MINTER_ROLE")` (`0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`).
   - Para el bot burner: `role = keccak256("BURNER_ROLE")` (`0x3c11d16cbaffd01df69ce1c404f6340ee057498f5f00246190ea54220d3d18fb`).
   - `account`: Dirección pública de la wallet comprometida.
3. Firmar por 2 custodios y ejecutar. El acceso de minteo o quema queda bloqueado on-chain inmediatamente.
4. Una vez aprovisionada la nueva wallet segura en el vault, asignar el rol invocando `grantRole(role, newAccount)`.

---

### 2.3 Actualización de Dirección del Marketplace (`setMarketplaceContract`)

**Cuándo aplicar**: Despliegue de una nueva versión o auditoría del contrato `HotelMarketplace.sol`.

1. En Safe{Wallet}, interactuar con `HotelNFT.sol`.
2. Invocar `setMarketplaceContract(address _newMarketplace)`.
3. Validar dos veces la dirección destino en Polygonscan antes de confirmar la segunda firma.

---

### 2.4 Ajuste del Precio Mínimo de Reventa (`setMinListingPrice`)

**Cuándo aplicar**: Actualización del umbral mínimo de listado en el marketplace para prevenir wash trading y evasión de royalties ante fluctuaciones significativas en la cotización de POL/EUR.

1. En Safe{Wallet}, interactuar con `HotelMarketplace.sol`.
2. Invocar `setMinListingPrice(uint256 _newMinPrice)` especificando el valor en wei.

---

### 2.5 Retiro Periódico de Fondos de Tesorería (`withdraw()`)

**Cuándo aplicar**: Liquidación periódica (semanal / mensual) de los fondos acumulados en el contrato `HotelMarketplace.sol` por concepto de ventas primarias (100% del importe) y royalties de reventa (5% simples, 10% suites).

1. **Verificación de Saldo Pendiente**:
   - En Polygonscan o mediante Safe{Wallet}, consultar la función de lectura `pendingWithdrawals(address treasuryAddress)`.
   - Constatar que el saldo acumulado en wei sea mayor a 0.
2. **Creación de la Propuesta de Retiro**:
   - Acceder a [Safe{Wallet}](https://app.safe.global/) con la cuenta de Tesorería configurada en los contratos.
   - Ir a **"New Transaction"** -> **"Contract Interaction"**.
   - Ingresar la dirección del contrato `HotelMarketplace`.
   - Seleccionar el método `withdraw()`.
   - Generar y firmar la transacción inicial (Custodio 1).
3. **Confirmación y Ejecución**:
   - El segundo custodio verifica en Safe{Wallet} que la transacción transfiere los fondos directamente a la dirección de la Safe / Tesorería.
   - Tras la segunda firma, la llamada se ejecuta en Polygon PoS y los fondos POL son transferidos íntegramente al balance líquido de la Tesorería.

---
*Guía Operativa Gnosis Safe v1.0.0 — Documento de gobernanza y respuesta a incidentes.*
