# Integración de Recepción con PMS Hotelero y Cumplimiento RD 933/2021
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.0.0  
> **Fecha**: 2026-09-14  
> **Alcance**: Fase 2 (Post-MVP)  
> **Sistemas Compatibles**: Opera, Cloudbeds, Sihot, Custom PMS API  

---

## 1. Flujo Integrado de Recepción Físico-Digital

```
 [ Huésped llega a Recepción ]
               │
               ▼ Escaneo QR en /recepcion (< 500ms)
    [ HotelNFT.markCheckedIn() ] ──> Bloqueo On-Chain Irreversible
               │
               ▼ Sincronización Inmediata
    [ PmsAdapter.syncCheckIn() ]
               │
       ┌───────┴──────────────────────────────┐
       ▼                                      ▼
[ PMS Hotelero ]                    [ Parte de Entrada RD 933/2021 ]
• Asignación llave de habitación    • Envío a Policía/Guardia Civil
• Facturación de consumos           • Archivo obligatorio 3 años
```

---

## 2. Campos Estandarizados del Real Decreto 933/2021

El adaptador `PmsAdapter` estructura y valida los campos exigidos por el Ministerio del Interior:
1. **Código de Establecimiento**: Identificador oficial del Hotel Marina del Sol.
2. **Datos del Huésped**: Nombre y apellidos, tipo de documento (DNI/Pasaporte/NIE), número y nacionalidad recogidos físicamente por el recepcionista.
3. **Datos de la Reserva**: Número de habitación, fecha/hora de entrada, fecha de salida prevista.
4. **Trazabilidad Web3**: Código de verificación vinculado al `tokenId` de Polygon.

---

## 3. Resiliencia ante Caídas del PMS

Si el software PMS local o la red experimenta cortes, `PmsAdapter` almacena la ficha en una cola local de reintentos con persistencia, asegurando que **ningún registro policial se pierda** y se transmita tan pronto se restablezca el servicio.
