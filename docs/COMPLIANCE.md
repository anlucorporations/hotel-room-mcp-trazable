# Marco Regulatorio, Fiscal y de Cumplimiento Normativo (H-COMPLIANCE)
## Hotel Marina del Sol — Plataforma NFT de Reservas Hoteleras

> **Versión**: 1.0.0  
> **Fecha**: 2026-09-13  
> **Estado**: Aprobado — Hito Regulatorio H-COMPLIANCE (US-25)  
> **Jurisdicción**: Reino de España / Unión Europea  

---

## 1. Dictamen de Calificación Jurídica bajo el Reglamento MiCA (UE 2023/1114)

### 1.1. Naturaleza Jurídica del Activo: Token de Utilidad Consumible (Utility Token)
Los tokens no fungibles (NFT) emitidos por el Hotel Marina del Sol bajo el estándar ERC-721 representan única y exclusivamente un **derecho de hospedaje físico y temporal** en una habitación determinada durante una fecha de calendario específica.

- **No es un Instrumento Financiero (MiFID II)**: Conforme a la Directiva 2014/65/UE, el token no confiere derechos de crédito, dividendos, participación en beneficios ni derecho a liquidación patrimonial. Su valor deriva de la prestación del servicio de alojamiento hotelero físico.
- **No es un Token Referenciado a Activos (ART)**: No busca mantener un valor estable por referencia a cestas de monedas, materias primas u otros activos (Título III MiCA).
- **No es un Token de Dinero Electrónico (EMT)**: No tiene por finalidad servir de medio general de intercambio ni está denominado en una divisa fiduciaria única con obligación de reembolso a la par (Título IV MiCA).
- **Subsunción bajo MiCA**: Se clasifica como un **criptoactivo distinto de ART y EMT** regulado bajo el Título II del Reglamento (UE) 2023/1114, con carácter no fungible representativo de una reserva hotelera única.

### 1.2. Arquitectura 100% No Custodial y Exención de Licencia CASP
De conformidad con los considerandos y el Título V de MiCA:
1. **Auto-custodia estricta**: Los usuarios interactúan directamente con los contratos inteligentes (`HotelNFT.sol` y `HotelMarketplace.sol`) a través de sus propias billeteras no custodiales (MetaMask, WalletConnect, etc.).
2. **Ausencia de custodia por el hotel**: La entidad operadora ni sus servidores en la nube acceden, administran, retienen o bloquean claves privadas ni fondos criptográficos de los usuarios.
3. **Mecanismo de Retiro Pull-over-Push**: Los fondos devengados por ventas secundarias se mantienen en el saldo del contrato del marketplace (`pendingWithdrawals`) y solo el titular de la wallet vendedora puede liberarlos hacia su propia dirección ejecutando la función `withdraw()`.
4. **Exención**: La sociedad hotelera opera exclusivamente como proveedor de software y prestador del servicio hostelero final, quedando expresamente **exenta de la necesidad de autorización como proveedor de servicios de criptoactivos (CASP)**.

---

## 2. Guía Fiscal y Tributaria (España)

### 2.1. Impuesto sobre el Valor Añadido (IVA)
- **Calificación**: Prestación de servicios de hospedaje y alojamiento turístico.
- **Tipo Impositivo**: **Tipo reducido del 10%** con arreglo al artículo 91.uno.2.2ª de la Ley 37/1992 del Impuesto sobre el Valor Añadido (LIVA).
- **Momento del Devengo**: Conforme al artículo 75.Dos de la LIVA (pagos anticipados anteriores a la realización del hecho imponible), el impuesto se devenga en el momento del cobro efectivo del precio de emisión primaria on-chain.
- **Facturación y RD 1619/2012**:
  - Para clientes particulares (B2C), se genera justificante simplificado con ID del token y hash de transacción.
  - El cliente puede solicitar en recepción o vía canal soporte la expedición de factura ordinaria completa desglosando base imponible y cuota del 10% de IVA, aportando su NIF/CIF.

### 2.2. Tratamiento de los Royalties del Hotel (5%)
- Los ingresos percibidos por el hotel derivados del 5% de royalty sobre transacciones en el marketplace secundario se integran en la base imponible del Impuesto sobre Sociedades (IS) como ingresos de explotación complementarios a la actividad turística.
- Quedan sujetos a IVA al tipo general del 21% al considerarse remuneración por cesión de plataforma y derechos de gestión técnica sobre el contrato.

### 2.3. Tributación de Vendedores Particulares en el Mercado Secundario (IRPF)
- Las personas físicas residentes en España que obtengan un sobreprecio en la reventa de su noche NFT tributarán en el Impuesto sobre la Renta de las Personas Físicas (IRPF) por la **ganancia patrimonial en la base del ahorro** (escalas del 19% al 28% según tramos vigentes de la Ley 35/2006).
- Si la reventa se efectúa por importe inferior al de adquisición, se genera una pérdida patrimonial computable para compensar ganancias patrimoniales.

---

## 3. Seguridad Ciudadana y Registro Oficial de Viajeros (RD 933/2021)

### 3.1. Delegación en Recepción Física
El Real Decreto 933/2021, de 26 de octubre, impone la obligación legal a los establecimientos de hospedaje de comunicar a la plataforma del Ministerio del Interior (SES.HOSPEDAJES) los datos de filiación de los viajeros.

- **Anonimato en la compra Web3**: La compraventa on-chain se mantiene 100% anónima sin recopilar nombres, DNI ni datos personales, garantizando el principio de minimización de datos del RGPD (art. 5.1.c).
- **Cumplimiento presencial obligatorio**: El cumplimiento del RD 933/2021 se produce físicamente en el mostrador de recepción al realizar el check-in:
  1. El huésped exhibe su QR criptográfico JWS o resguardo de contingencia.
  2. El personal de recepción verifica la autenticidad y solicita el documento oficial de identidad físico (DNI o Pasaporte).
  3. Los datos personales del viajero se registran directamente en el PMS oficial del hotel y se comunican al Ministerio del Interior.
  4. Ningún dato de filiación personal es almacenado en la blockchain ni en la base de datos pública del proyecto.

---

## 4. Protección de Datos y Privacidad (RGPD — Reglamento UE 2016/679)

1. **Minimización de Datos (Art. 5.1.c RGPD)**: No se recogen identificadores personales en base de datos. Las wallets son tratadas como pseudónimos.
2. **Cifrado Fuerte**: Los secretos de validación (`checkInSecret`) se almacenan cifrados con AES-256-GCM, con clave custodiada en Google Secret Manager / HashiCorp Vault.
3. **Despacho Efímero de Correos**: Los correos con resguardos QR solicitados por los usuarios se procesan exclusivamente en la memoria volátil del worker de BullMQ (`enqueueEphemeralEmail`), sin persistencia en disco ni asociación a la wallet compradora.

---

## 5. Gobernanza y Custodia Multisig (Gnosis Safe 2 de 3)

En cumplimiento de las mejores prácticas de gobernanza institucional:
- El rol `DEFAULT_ADMIN_ROLE` se transfiere en producción a un Gnosis Safe Multisig 2 de 3 (`docs/GUIA-GNOSIS-SAFE.md`).
- Los roles operativos (`MINTER_ROLE`, `BURNER_ROLE`, `RECEPTION_ROLE`) están estrictamente segregados con hot-wallets de privilegios mínimos protegidas por re-confirmación TOTP (MFA).
