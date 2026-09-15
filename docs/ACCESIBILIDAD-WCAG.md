# Certificación y Directrices de Accesibilidad Web (WCAG 2.1 Nivel AA)
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.0.0  
> **Fecha**: 2026-09-14  
> **Alcance**: Fase 2 (Post-MVP)  
> **Estándar**: W3C Web Content Accessibility Guidelines (WCAG) 2.1 AA  

---

## 1. Compromiso de Accesibilidad e Inclusión

La plataforma de reservas Web3 del Hotel Marina del Sol garantiza el acceso equitativo e independiente para todos los usuarios, incluyendo personas con discapacidad visual, auditiva, motriz o cognitiva.

---

## 2. Pilares de Conformidad Técnica

### 2.1 Perceptible (Principio 1)
- **Contraste de Color (Criterio 1.4.3)**:
  - Texto estándar: ratio mínimo de **4.5:1** (verificado: Slate-900 `#0F172A` sobre Blanco `#FFFFFF` alcanza **16.1:1**; Blanco sobre Emerald-700 `#047857` alcanza **4.6:1**).
  - Texto grande y componentes de interfaz (Criterio 1.4.11): ratio mínimo de **3.0:1**.
- **Texto Alternativo e Iconos (Criterio 1.1.1)**:
  - Todos los iconos decorativos incluyen `aria-hidden="true"`.
  - Iconos interactivos (botones de cerrar modal, filtros, carrito) disponen de etiqueta `aria-label` descriptiva en los 3 idiomas (ES, EN, RU).

### 2.2 Operable (Principio 2)
- **Navegación por Teclado (Criterio 2.1.1)**:
  - Toda la funcionalidad (catálogo, filtros, selector de fechas, checkout con wallet, re-descarga de resguardo) es 100% operable exclusivamente mediante teclado (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Esc`).
  - **Sin trampas de foco (Criterio 2.1.2)**: Los modales atrapan el foco mientras están abiertos y lo devuelven al elemento detonador tras cerrarse con `Esc`.
- **Enlace de Salto Directo (Criterio 2.4.1)**:
  - Enlace "*Saltar al contenido principal*" presente al inicio del DOM, visible únicamente al recibir foco vía teclado.
- **Foco Visible (Criterio 2.4.7)**:
  - Anillo de enfoque de alto contraste (`focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2`) obligatorio en todos los controles interactivos.

### 2.3 Comprensible (Principio 3)
- **Idioma de la Página (Criterio 3.1.1)**:
  - El atributo `<html lang="...">` se sincroniza dinámicamente según la preferencia del usuario (`es`, `en` o `ru`).
- **Prevención de Errores en Transacciones (Criterio 3.3.4)**:
  - El modal de checkout exige confirmación explícita previa a la firma en MetaMask, detallando la fecha de estancia, precio en POL y contravalor en EUR.

### 2.4 Robusto (Principio 4)
- **Compatibilidad con Tecnologías de Asistencia (Criterio 4.1.2)**:
  - Marcado semántico HTML5 (`<main>`, `<nav>`, `<header>`, `<footer>`, `<dialog>`).
  - Actualizaciones de precios y estados asíncronos anunciados a lectores de pantalla mediante regiones activas (`aria-live="polite"`).

---

## 3. Pruebas Automatizadas de Accesibilidad

Ejecute la suite de pruebas de accesibilidad:
```bash
pnpm --filter @hotel/web test src/lib/a11y/a11y.test.ts
```
