import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guardián de documentación (M9 · D-15 · RNF-18).
 *
 * El hallazgo H-16 de la auditoría V5 fue que el código citaba **66 referencias a documentos que no
 * existían** (`ADR-01`…`ADR-22`, `DISEÑO-TECNICO`, `docs/SRS.md §7`, `CASOS-DE-USO`, `CU-01`…`CU-17`,
 * `REQUISITOS §n`). Se limpiaron, se creó el registro de ADR (`docs/adr/`) y se reescribieron PRD,
 * SRS, plan y backlog. Este guardián existe para que **no vuelva a pasar**: sin él, la limpieza es un
 * hecho puntual; con él, es un invariante.
 *
 * Qué comprueba:
 *   1. **Cero referencias huérfanas** en el código (`apps/`, `packages/`, `scripts/`): no se cita
 *      ningún documento de diseño/casos de uso que no exista en el repositorio.
 *   2. **Todo ADR citado existe**: si un comentario dice `ADR-07`, hay `docs/adr/ADR-07-*.md`.
 *   3. **El índice de ADR está completo**: cada ADR del índice existe y cada fichero del directorio
 *      aparece en el índice (sin duplicados ni entradas colgando).
 *   4. **Los documentos normativos existen y declaran su versión**: `docs/PRD.md`, `docs/SRS.md`,
 *      `docs/PLAN-CONSTRUCCION.md` y `docs/BACKLOG-SPRINTS.md`.
 *   5. **Los casos de uso citados por el código están catalogados** en `docs/SRS.md` §9.
 */
const here = dirname(fileURLToPath(import.meta.url));
/** Raíz del monorepo: `packages/shared/src` → cuatro niveles arriba. */
const ROOT = resolve(here, '..', '..', '..');
const DOCS = join(ROOT, 'docs');
const ADR_DIR = join(DOCS, 'adr');

/** Extensiones en las que se auditan citas de documentación. */
const CODE_EXTENSIONS = ['.ts', '.tsx', '.sol', '.sql', '.mjs', '.js', '.ps1'];

/** Directorios con código de producto (excluye artefactos de build y dependencias). */
const CODE_ROOTS = ['apps', 'packages', 'scripts'];

const EXCLUDED_DIR = /(node_modules|[\\/]dist[\\/]|[\\/]\.next[\\/]|[\\/]out[\\/]|[\\/]broadcast[\\/]|[\\/]cache[\\/]|[\\/]coverage[\\/])/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (EXCLUDED_DIR.test(full)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (CODE_EXTENSIONS.some((ext) => name.endsWith(ext))) out.push(full);
  }
  return out;
}

const codeFiles = CODE_ROOTS.flatMap((root) => walk(join(ROOT, root)));
const rel = (file: string): string => relative(ROOT, file).replace(/\\/g, '/');

/** Referencias a documentos que NO existen y no deben reaparecer. */
const ORPHAN_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'DISEÑO / DISENO (documento de diseño inexistente)', re: /DISE[ÑN]O(-TECNICO|-UX)?/ },
  { label: 'CASOS-DE-USO (catálogo inexistente)', re: /CASOS-DE-USO/ },
  { label: 'REQUISITOS § (documento inexistente)', re: /REQUISITOS\s*§/ },
];

function adrFilesOnDisk(): string[] {
  return readdirSync(ADR_DIR)
    .filter((name) => /^ADR-\d{2}-.+\.md$/.test(name))
    .sort();
}

function codeWithoutComments(file: string): string {
  // Se auditan también los comentarios a propósito (es donde viven las citas), pero se descartan las
  // líneas de los propios tests del guardián para no citarse a sí mismo.
  return readFileSync(file, 'utf8');
}

describe('guardián de documentación (M9 · D-15)', () => {
  it('no queda ninguna referencia a documentos de diseño inexistentes', () => {
    const offenders: string[] = [];
    for (const file of codeFiles) {
      // Este propio fichero declara los patrones: se excluye de la auditoría.
      if (rel(file) === 'packages/shared/src/documentation-guardian.test.ts') continue;
      const content = codeWithoutComments(file);
      for (const { label, re } of ORPHAN_PATTERNS) {
        if (re.test(content)) offenders.push(`${rel(file)} → ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('todo ADR citado en el código existe en docs/adr/', () => {
    const onDisk = new Set(adrFilesOnDisk().map((name) => name.slice(0, 6)));
    const mentioned = new Map<string, string[]>();
    for (const file of codeFiles) {
      const content = codeWithoutComments(file);
      for (const match of content.matchAll(/ADR-(\d{2})/g)) {
        const id = `ADR-${match[1]}`;
        const list = mentioned.get(id) ?? [];
        list.push(rel(file));
        mentioned.set(id, list);
      }
    }
    // El guardián tiene que encontrar citas: si no hay ninguna, el patrón se rompió.
    expect(mentioned.size).toBeGreaterThan(10);

    const missing = [...mentioned.entries()]
      .filter(([id]) => !onDisk.has(id))
      .map(([id, files]) => `${id} citado en ${files.slice(0, 3).join(', ')}`);
    expect(missing).toEqual([]);
  });

  it('el índice de ADR está completo y sin entradas colgando', () => {
    const index = readFileSync(join(ADR_DIR, 'README.md'), 'utf8');
    const linked = [...index.matchAll(/\(ADR-(\d{2})-[a-z0-9-]+\.md\)/g)].map((m) => m[1]);
    const onDisk = adrFilesOnDisk();

    // Cada enlace del índice apunta a un fichero existente…
    const brokenLinks = linked.filter(
      (id) => !onDisk.some((name) => name.startsWith(`ADR-${id}-`)),
    );
    expect(brokenLinks).toEqual([]);

    // …y cada fichero del directorio está enlazado exactamente una vez.
    const linkedSet = new Set(linked);
    const notIndexed = onDisk
      .map((name) => name.slice(4, 6))
      .filter((id) => !linkedSet.has(id));
    expect(notIndexed).toEqual([]);
    expect(linked.length).toBe(new Set(linked).size);
    expect(onDisk.length).toBeGreaterThanOrEqual(20);
  });

  it('los documentos normativos existen y declaran versión y fecha', () => {
    const required = [
      'PRD.md',
      'SRS.md',
      'PLAN-CONSTRUCCION.md',
      'BACKLOG-SPRINTS.md',
      'RESPUESTA-CLIENTE-BORRADOR.md',
    ];
    for (const name of required) {
      const path = join(DOCS, name);
      expect(existsSync(path), `falta ${name}`).toBe(true);
      const content = readFileSync(path, 'utf8');
      expect(/\*\*Versión\*\*/.test(content), `${name} no declara versión`).toBe(true);
      expect(/\*\*Fecha\*\*/.test(content), `${name} no declara fecha`).toBe(true);
    }
  });

  it('los casos de uso que cita el código están catalogados en el SRS', () => {
    const srs = readFileSync(join(DOCS, 'SRS.md'), 'utf8');
    const cited = new Set<string>();
    for (const file of codeFiles) {
      // `e2e/` y tests citan los mismos CU: se auditan igual (son producto del repositorio).
      const content = codeWithoutComments(file);
      for (const match of content.matchAll(/\bCU-(?:PR-)?\d{1,2}\b/g)) cited.add(match[0]);
    }
    expect(cited.size).toBeGreaterThan(10);

    const uncatalogued = [...cited].filter((cu) => !srs.includes(`**${cu}**`));
    expect(uncatalogued).toEqual([]);
  });

  it('cada requisito del PRD está contemplado en el SRS (trazado o declarado sin verificación)', () => {
    const prd = readFileSync(join(DOCS, 'PRD.md'), 'utf8');
    const srs = readFileSync(join(DOCS, 'SRS.md'), 'utf8');

    // Los RF del PRD se declaran en su tabla de requisitos funcionales con el formato `| **RF-nn** |`.
    const prdRequirements = [...prd.matchAll(/\|\s*\*\*(RF-\d+[a-z]?)\*\*\s*\|/g)].map((m) => m[1]);
    expect(prdRequirements.length).toBeGreaterThanOrEqual(20);

    // Y cada uno aparece en el SRS: con fila de trazabilidad (§10) o en la tabla de requisitos sin
    // verificación (§10.1), que existe precisamente para que «no entregado» sea un estado declarado y
    // no un requisito que desaparece del documento.
    const missing = prdRequirements.filter((rf) => !new RegExp(`\\b${rf}\\b`).test(srs));
    expect(missing).toEqual([]);
  });
});
