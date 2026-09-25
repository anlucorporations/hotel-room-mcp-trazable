/**
 * Comprobaciones estructurales del HTML generado para los manuales (sin dependencias).
 *
 * Existe porque la sección de Ayuda compila el HTML del módulo generado dentro de la página y axe
 * evalúa el DOM resultante: si una lista está mal formada, la regla `list` («<ul> and <ol> must only
 * directly contain <li>, <script> or <template> elements») y la regla `listitem` («<li> must be
 * contained in a <ul>, <ol> or <menu>») fallan con impacto `serious` (WCAG 1.3.1).
 *
 * El conversor de markdown tiene que cumplir, por tanto, tres invariantes:
 *   1. Ningún `<li>` sin un `<ul>`/`<ol>` como padre directo (regla `listitem`).
 *   2. Ningún `<ul>`/`<ol>` como hijo directo de otro `<ul>`/`<ol>` (regla `list`).
 *   3. Toda lista tiene al menos un `<li>` y las etiquetas están balanceadas.
 *
 * El analizador es propio y mínimo: solo entiende etiquetas, sus atributos y el texto, que es todo
 * lo que produce `apps/web/scripts/build-manuals.mjs` (no se inyecta HTML de terceros).
 */

/** Etiquetas sin cierre. */
const VOID_ELEMENTS = new Set(["br", "hr", "img", "input", "meta", "link", "source", "col"]);

const LIST_TAGS = new Set(["ul", "ol"]);
const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;

/**
 * Construye un árbol mínimo de elementos a partir del HTML.
 * Devuelve la raíz con `children`; cada nodo es `{ tag, children }` o `{ text }`.
 */
export function parseHtml(html) {
  const root = { tag: "#root", children: [] };
  const stack = [root];
  let lastIndex = 0;

  for (const match of html.matchAll(TAG_PATTERN)) {
    const [raw, closing, rawTag, selfClosing] = match;
    const index = match.index ?? 0;
    const text = html.slice(lastIndex, index);
    if (text) stack[stack.length - 1]?.children.push({ text });
    lastIndex = index + raw.length;

    const tag = String(rawTag).toLowerCase();
    if (closing === "/") {
      const top = stack[stack.length - 1];
      // Cierra hasta encontrar la etiqueta correspondiente (tolerante a cierres sobrantes).
      const position = stack.findLastIndex((node) => node.tag === tag);
      if (position > 0) stack.length = position;
      else if (top && top.tag !== tag) stack.length = Math.max(1, stack.length - 1);
      continue;
    }
    if (selfClosing || VOID_ELEMENTS.has(tag)) {
      stack[stack.length - 1]?.children.push({ tag, children: [] });
      continue;
    }
    const node = { tag, children: [] };
    stack[stack.length - 1]?.children.push(node);
    stack.push(node);
  }

  const tail = html.slice(lastIndex);
  if (tail) root.children.push({ text: tail });
  return root;
}

/** Recorre el árbol y devuelve todos los nodos de elemento, con su padre. */
function walk(node, parent = null, out = []) {
  for (const child of node.children ?? []) {
    if (child.tag) {
      out.push({ node: child, parent });
      walk(child, child, out);
    }
  }
  return out;
}

/** Cuenta las apariciones de un fragmento literal (para informes antes/después). */
export function countOccurrences(html, needle) {
  return html.split(needle).length - 1;
}

/** Recuento de etiquetas de apertura/cierre de una etiqueta concreta. */
function countTags(html, tag) {
  const open = html.match(new RegExp(`<${tag}(?:\\s[^>]*)?>`, "gi"))?.length ?? 0;
  const close = html.match(new RegExp(`</${tag}\\s*>`, "gi"))?.length ?? 0;
  return { open, close };
}

/**
 * Comprueba las invariantes de listas y devuelve la lista de problemas encontrados
 * (vacía = HTML correcto).
 *
 * @param {string} html
 * @returns {string[]}
 */
export function findListProblems(html) {
  const problems = [];
  const elements = walk(parseHtml(html));

  for (const { node, parent } of elements) {
    const children = (node.children ?? []).filter((child) => child.tag);

    if (node.tag === "li") {
      if (!parent || !LIST_TAGS.has(parent.tag)) {
        problems.push(`<li> sin padre de lista (padre: ${parent?.tag ?? "ninguno"})`);
      }
    }

    if (LIST_TAGS.has(node.tag)) {
      if (children.length === 0) problems.push(`<${node.tag}> sin ningún <li>`);
      for (const child of children) {
        if (LIST_TAGS.has(child.tag)) {
          problems.push(`<${node.tag}> con <${child.tag}> como hijo directo`);
        } else if (child.tag !== "li") {
          problems.push(`<${node.tag}> con <${child.tag}> como hijo directo (solo se admite <li>)`);
        }
      }
    }
  }

  for (const tag of ["ul", "ol", "li"]) {
    const { open, close } = countTags(html, tag);
    if (open !== close) problems.push(`<${tag}> desbalanceado: ${open} aperturas y ${close} cierres`);
  }

  return problems;
}
