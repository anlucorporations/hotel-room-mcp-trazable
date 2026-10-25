package com.marinadelsol.app.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * Tema Compose de la propuesta B «Posidonia» — BORRADOR para el ciclo A1.4 del plan de la APK
 * (`apps/mobile` aún no existe). Paridad 1:1 con los tokens de `packages/config/tailwind/preset.cjs`:
 * el mismo rol semántico tiene el mismo valor en web, AdminLTE y Android.
 *
 * Reglas:
 *  · NO se usa Material You dinámico: la marca no se sustituye por el color del fondo de pantalla.
 *  · Área táctil mínima 48 dp (Android) — el mínimo web de 44 px queda por debajo.
 *  · Tipografía: body 16 sp mínimo; display/titulares con la familia Spectral.
 *  · Modo noche del personal: PROPUESTO Y NO APROBADO (fuera de esta entrega).
 *
 * Generado por `scripts/design/proposals-v3.mjs`. Candidato, no aplicado.
 */
object MarinaColors {
    val mist = Color(0xFFF2F8F7)
    val mist2 = Color(0xFFE3EFEE)
    val shell = Color(0xFFFFFFFF)
    val ink = Color(0xFF0C2226)
    val inkSoft = Color(0xFF44605F)
    val azure = Color(0xFF0B6A5A)
    val azureDeep = Color(0xFF074B40)
    val agua = Color(0xFF0C7A87)
    val navy = Color(0xFF052528)
    val navySoft = Color(0xFF0A3A3D)
    val pearl = Color(0xFFBFD8D4)
    val coral = Color(0xFFB44D33)
    val coralText = Color(0xFF963C24)
    val amber = Color(0xFFC9A66B)
    val fern = Color(0xFF2F7A58)
    val line = Color(0xFFD5E5E1)
    val lineStrong = Color(0xFF5C7B76)
    val success = Color(0xFF196A45)
    val successBg = Color(0xFFDFF0E7)
    val warning = Color(0xFF855A0C)
    val warningBg = Color(0xFFF9EFD4)
    val error = Color(0xFFA3291E)
    val errorBg = Color(0xFFF8E3DF)
    val info = Color(0xFF0C6673)
    val infoBg = Color(0xFFDEEEF1)
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
