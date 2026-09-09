# Plan de Implementación: Sprint 1 — Smart Contracts Core, Pausable y Protección Anti-evasión

> **Historias**:  
> - `US-01: Contrato HotelNFT.sol con AccessControl, Pausable y markCheckedIn` (8 SP)  
> - `US-02: Contrato HotelMarketplace.sol con Pull-over-Push y minListingPrice` (8 SP)  
> - `US-03: Entorno Local Anvil y Scripts de Despliegue Foundry` (5 SP)  
> **Estimación Total**: 21 Story Points · 2 Semanas  
> **Alineación**: `docs/SRS.md` v1.3.0 (§3) y `docs/BACKLOG-SPRINTS.md` v1.2.0 (Sprint 1)  

---

## 1. Descripción del Objetivo

El **Sprint 1** implementa la arquitectura modular definitiva de smart contracts para la plataforma NFT del Hotel Marina del Sol:
1. **`HotelNFT.sol`**: Token ERC-721 + EIP-2981 (royalties 5% simples/dobles, 10% suites), `AccessControl` con 4 roles segregados, `Pausable` para emergencias, `mintBatch()` restringido a relayer (`MINTER_ROLE`), `markCheckedIn()` on-chain (`RECEPTION_ROLE`) para blindar el sistema contra doble gasto tras check-in, y quema exclusiva (`BURNER_ROLE`).
2. **`HotelMarketplace.sol`**: Marketplace primario y secundario con liquidación **Pull-over-Push** (`pendingWithdrawals` + `withdraw()`), umbral mínimo anti-evasión de royalties (`minListingPrice`), protección `nonReentrant` y control `whenNotPaused`.
3. **Scripts y Toolchain**: Script de despliegue unificado `Deploy.s.sol` que enlaza ambos contratos, configura roles, exporta artefactos/ABIs hacia `@hotel/shared` y suite de pruebas en Foundry con cobertura $\ge 80\%$.

---

## 2. Detalle de Implementación por Componente

### US-01: Contrato `HotelNFT.sol`
- **Herencia**: `ERC721`, `ERC2981`, `AccessControl`, `Pausable`.
- **Roles On-chain**:
  - `DEFAULT_ADMIN_ROLE`: Administración global, `setMarketplaceContract()`, `pause()`, `unpause()`.
  - `MINTER_ROLE`: Acuñación por lotes mediante `mintBatch()` ($\le 50$ tokens).
  - `BURNER_ROLE`: Quema de tokens no vendidos expirados (`burn()` y `burnBatch()`).
  - `RECEPTION_ROLE`: Marcado de estancia presencial (`markCheckedIn()`).
- **Lógica de Doble Gasto (`_update`)**:
  - Intercepta transferencias entre cuentas no nulas (`from != address(0)` y `to != address(0)`).
  - Exige que el token no esté marcado como `isCheckedIn`.
  - Restringe transferencias únicamente a través del contrato `marketplaceContract`.
  - Valida `whenNotPaused`.
- **Royalties (EIP-2981)**:
  - 500 bps (5%) para habitaciones `SIMPLE` (101-115) y `DOBLE` (116-130).
  - 1000 bps (10%) para `SUITE` (201-220).

### US-02: Contrato `HotelMarketplace.sol`
- **Herencia**: `ReentrancyGuard`, `AccessControl`, `Pausable`.
- **Mecanismos Financieros y de Seguridad**:
  - **Pull-over-Push**: Los pagos recibidos en `buy()` no se envían directamente por transferencia activa, sino que se acreditan en `mapping(address => uint256) public pendingWithdrawals`.
  - **Función `withdraw()`**: Retiro seguro no reentrante invocable por el vendedor o receptor de royalties.
  - **Protección Anti-evasión (`minListingPrice`)**: Variable configurable por `DEFAULT_ADMIN_ROLE` para evitar ventas ficticias a 1 wei en mercado secundario.
  - **Validación de Check-in**: `listForSale()` comprueba que `!rooms[tokenId].isCheckedIn` y que `block.timestamp < checkInTimestamp`.

### US-03: Scripts de Despliegue y Pruebas
- **`Deploy.s.sol`**:
  - Despliega `HotelNFT` con tesorería configurada.
  - Despliega `HotelMarketplace` pasando la dirección de `HotelNFT` y el `minListingPrice` inicial.
  - Asigna `setMarketplaceContract` en `HotelNFT`.
  - Otorga roles correspondientes (`MINTER_ROLE`, `BURNER_ROLE`, `RECEPTION_ROLE`).
  - Genera/sincroniza ABIs hacia `packages/shared/src/abi/`.
- **Pruebas Foundry**:
  - `HotelNFT.t.sol`: Minteo masivo, roles, pausable, `markCheckedIn`, bloqueo de transferencias post check-in y cálculo de royalties.
  - `HotelMarketplace.t.sol`: Compra primaria, reventa, división de royalties, Pull-over-Push (`withdraw()`), bloqueo ante `minListingPrice` y `nonReentrant`.

---

## 3. Cambios Propuestos en Archivos

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| **[NEW]** | [`packages/contracts/src/HotelNFT.sol`](file:///c:/Users/lucci/MasterCodeCripto/GitLab/hotel-room-mcp-trazable/packages/contracts/src/HotelNFT.sol) | Contrato ERC-721 + EIP-2981 + AccessControl + Pausable + `markCheckedIn` |
| **[NEW]** | [`packages/contracts/src/HotelMarketplace.sol`](file:///c:/Users/lucci/MasterCodeCripto/GitLab/hotel-room-mcp-trazable/packages/contracts/src/HotelMarketplace.sol) | Contrato de Marketplace con Pull-over-Push y `minListingPrice` |
| **[MODIFY]** | [`packages/contracts/script/Deploy.s.sol`](file:///c:/Users/lucci/MasterCodeCripto/GitLab/hotel-room-mcp-trazable/packages/contracts/script/Deploy.s.sol) | Script de despliegue coordinado para ambos contratos |
| **[NEW]** | [`packages/contracts/test/HotelNFT.t.sol`](file:///c:/Users/lucci/MasterCodeCripto/GitLab/hotel-room-mcp-trazable/packages/contracts/test/HotelNFT.t.sol) | Suite de tests exhaustivos de `HotelNFT` |
| **[NEW]** | [`packages/contracts/test/HotelMarketplace.t.sol`](file:///c:/Users/lucci/MasterCodeCripto/GitLab/hotel-room-mcp-trazable/packages/contracts/test/HotelMarketplace.t.sol) | Suite de tests exhaustivos de `HotelMarketplace` |
| **[NEW]** | [`packages/shared/src/abi/hotel-nft.ts`](file:///c:/Users/lucci/MasterCodeCripto/GitLab/hotel-room-mcp-trazable/packages/shared/src/abi/hotel-nft.ts) | Exportación tipada del ABI de `HotelNFT` |
| **[NEW]** | [`packages/shared/src/abi/hotel-marketplace.ts`](file:///c:/Users/lucci/MasterCodeCripto/GitLab/hotel-room-mcp-trazable/packages/shared/src/abi/hotel-marketplace.ts) | Exportación tipada del ABI de `HotelMarketplace` |

---

## 4. Plan de Verificación

1. **Compilación Limpia**:
   ```powershell
   cd packages/contracts ; forge build
   ```
2. **Ejecución de Pruebas Unitarias y de Fuzzing**:
   ```powershell
   cd packages/contracts ; forge test -vvv
   ```
3. **Cobertura de Código**:
   ```powershell
   cd packages/contracts ; forge coverage
   ```
   *Criterio*: Cobertura de líneas y funciones $\ge 80\%$.
4. **Análisis Estático con Slither**:
   ```powershell
   cd packages/contracts ; slither . --config-file slither.config.json --fail-high
   ```
   *Criterio*: 0 vulnerabilidades de severidad HIGH o CRITICAL.

---

## 5. Solicitud de Aprobación

El plan respeta al 100% las especificaciones aprobadas en el SRS v1.3.0 y las 21 resoluciones de auditoría. ¿Confirmas para proceder con la ejecución del **Sprint 1**?
