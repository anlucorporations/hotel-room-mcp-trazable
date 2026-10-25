package com.marinadelsol.app.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * Tema Compose de la propuesta A «Cal & Sal» — BORRADOR para el ciclo A1.4 del plan de la APK
 * (`apps/mobile` aún no existe). Paridad 1:1 con los tokens de `packages/config/tailwind/preset.cjs`:
 * el mismo rol semántico tiene el mismo valor en web, AdminLTE y Android.
 *
 * Reglas:
 *  · NO se usa Material You dinámico: la marca no se sustituye por el color del fondo de pantalla.
 *  · Área táctil mínima 48 dp (Android) — el mínimo web de 44 px queda por debajo.
 *  · Tipografía: body 16 sp mínimo; display/titulares con la familia Cormorant Garamond.
 *  · Modo noche del personal: PROPUESTO Y NO APROBADO (fuera de esta entrega).
 *
 * Generado por `scripts/design/proposals-v3.mjs`. Candidato, no aplicado.
 */
object MarinaColors {
    val mist = Color(0xFFF8F3E9)
    val mist2 = Color(0xFFEFE7D6)
    val shell = Color(0xFFFFFFFF)
    val arena = Color(0xFFE9DDC8)
    val ink = Color(0xFF15222C)
    val inkSoft = Color(0xFF495764)
    val azure = Color(0xFF0B5C74)
    val azureDeep = Color(0xFF084659)
    val navy = Color(0xFF0F2833)
    val navySoft = Color(0xFF1A3B49)
    val pearl = Color(0xFFD9E8EC)
    val coral = Color(0xFFAE4E2A)
    val coralText = Color(0xFF8F3D1E)
    val amber = Color(0xFF9A6A12)
    val fern = Color(0xFF56682F)
    val line = Color(0xFFE4D9C5)
    val lineStrong = Color(0xFF8B7A62)
    val success = Color(0xFF1C6E48)
    val successBg = Color(0xFFE2F0E8)
    val warning = Color(0xFF875A0B)
    val warningBg = Color(0xFFF9EFD4)
    val error = Color(0xFFA62A1F)
    val errorBg = Color(0xFFF7E3DF)
    val info = Color(0xFF1E6273)
    val infoBg = Color(0xFFE1EDF1)
}

val MarinaLightScheme: ColorScheme = lightColorScheme(
    primary = MarinaColors.azure,
    onPrimary = MarinaColors.shell,
    primaryContainer = MarinaColors.mist2,
    onPrimaryContainer = MarinaColors.azureDeep,
    secondary = MarinaColors.coral,
    onSecondary = MarinaColors.shell,
    secondaryContainer = MarinaColors.warningBg,
    onSecondaryContainer = MarinaColors.coralText,
    tertiary = MarinaColors.fern,
    onTertiary = MarinaColors.shell,
    tertiaryContainer = MarinaColors.successBg,
    onTertiaryContainer = MarinaColors.success,
    background = MarinaColors.mist,
    onBackground = MarinaColors.ink,
    surface = MarinaColors.shell,
    onSurface = MarinaColors.ink,
    surfaceVariant = MarinaColors.mist2,
    onSurfaceVariant = MarinaColors.inkSoft,
    outline = MarinaColors.lineStrong,
    outlineVariant = MarinaColors.line,
    error = MarinaColors.error,
    onError = MarinaColors.shell,
    errorContainer = MarinaColors.errorBg,
    onErrorContainer = MarinaColors.error,
    inverseSurface = MarinaColors.navy,
    inverseOnSurface = MarinaColors.mist,
    inversePrimary = MarinaColors.pearl,
)
