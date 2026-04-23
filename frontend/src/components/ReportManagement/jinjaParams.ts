/**
 * Lightweight Jinja2 parameter extractor for report SQL templates.
 *
 * Collects the leading identifier of `{{ expr }}` and `{% if|elif expr %}`
 * tags, plus the iterable identifier of `{% for var in iter %}`. For each
 * parameter we also best-effort infer:
 *
 * - `dtype`: looked up from the SQL engine filters in the pipeline
 *   (`sql_int`, `sql_float`, `sql_bool`, `sql_date`, `sql_datetime`,
 *    `in_list`, `sql_in_list`, `sql_string`, `sql_like*`, `int`).
 * - `required`: false when the param is guarded by `{% if name %}` /
 *   `{% if not name %}` or carries a `| default(...)` filter; true
 *   otherwise.
 *
 * Deliberately coarse — matches the simple `{{ name }}` / `{{ name | filter }}`
 * shape used across the project. Users with complex Jinja can switch to JSON
 * mode in the Generate dialog.
 */

export type JinjaParamType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "list"

export type JinjaParamInfo = {
  name: string
  dtype: JinjaParamType
  required: boolean
}

// Reserved words we should never treat as parameters even if they appear in
// leading position (Jinja literals and built-in keywords). Custom filters
// starting with `sql_` and a few common built-ins are filtered separately.
const RESERVED = new Set([
  "true",
  "false",
  "none",
  "True",
  "False",
  "None",
  "and",
  "or",
  "not",
  "in",
  "is",
  "if",
  "else",
  "elif",
  "endif",
  "for",
  "endfor",
  "set",
  "with",
  "as",
  "do",
  "block",
  "endblock",
  "macro",
  "endmacro",
  "call",
  "endcall",
  "where",
  "endwhere",
])

const COMMON_FILTER_NAMES = new Set([
  "safe",
  "upper",
  "lower",
  "trim",
  "length",
  "default",
  "abs",
  "capitalize",
  "escape",
  "replace",
])

const FILTER_TO_TYPE: Record<string, JinjaParamType> = {
  sql_string: "string",
  sql_like: "string",
  sql_like_start: "string",
  sql_like_end: "string",
  sql_ident: "string",
  sql_int: "integer",
  int: "integer",
  sql_float: "number",
  sql_bool: "boolean",
  sql_date: "date",
  sql_datetime: "datetime",
  in_list: "list",
  sql_in_list: "list",
}

// Type specificity — higher wins when the same param appears with multiple
// filters across mappings (e.g. `sql_int` beats a later bare `{{ id }}`
// reference).
const TYPE_PRIORITY: Record<JinjaParamType, number> = {
  list: 6,
  datetime: 5,
  date: 4,
  boolean: 3,
  number: 2,
  integer: 2,
  string: 1,
}

function mergeType(
  current: JinjaParamType | undefined,
  next: JinjaParamType | undefined,
): JinjaParamType {
  if (!current) return next ?? "string"
  if (!next) return current
  return TYPE_PRIORITY[next] > TYPE_PRIORITY[current] ? next : current
}

function shouldSkip(name: string): boolean {
  if (RESERVED.has(name)) return true
  if (name.startsWith("sql_")) return true
  if (COMMON_FILTER_NAMES.has(name)) return true
  return false
}

type Ref = {
  name: string
  dtype?: JinjaParamType
  optional: boolean
}

function extractFilterType(exprBody: string): JinjaParamType | undefined {
  // Walk through `| filter_name` tokens after the leading identifier.
  const filters = exprBody.match(/\|\s*([a-zA-Z_][a-zA-Z0-9_]*)/g) || []
  let best: JinjaParamType | undefined
  for (const f of filters) {
    const name = f.replace(/^\|\s*/, "")
    const t = FILTER_TO_TYPE[name]
    if (t) best = mergeType(best, t)
  }
  return best
}

function hasDefaultFilter(exprBody: string): boolean {
  return /\|\s*default\s*\(/.test(exprBody)
}

export function extractJinjaParams(sqlContents: string[]): JinjaParamInfo[] {
  const refs: Ref[] = []

  for (const raw of sqlContents) {
    if (!raw) continue

    // Params appearing as `{% if NAME %}` / `{% if not NAME %}` / `{% elif ... %}`
    // are treated as optional — the block won't render without them, so the
    // template already handles their absence.
    const optionalNames = new Set<string>()
    const ifRe = /\{%-?\s*(?:if|elif)\s+(?:not\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\b/g
    let im: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: classic regex loop
    while ((im = ifRe.exec(raw)) !== null) {
      const name = im[1]
      if (!shouldSkip(name)) {
        optionalNames.add(name)
        refs.push({ name, optional: true })
      }
    }

    // `{% for VAR in NAME ... %}` — NAME is the iterable parameter (list-ish).
    const forRe =
      /\{%-?\s*for\s+[a-zA-Z_][a-zA-Z0-9_]*\s+in\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g
    let fm: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: classic regex loop
    while ((fm = forRe.exec(raw)) !== null) {
      const name = fm[1]
      if (!shouldSkip(name)) {
        refs.push({ name, dtype: "list", optional: false })
      }
    }

    // `{{ expr }}` — capture full body so we can parse filters + defaults.
    const exprRe = /\{\{-?\s*([a-zA-Z_][a-zA-Z0-9_]*)\b([^}]*)\}\}/g
    let em: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: classic regex loop
    while ((em = exprRe.exec(raw)) !== null) {
      const name = em[1]
      if (shouldSkip(name)) continue
      const body = em[2] ?? ""
      const dtype = extractFilterType(body)
      const hasDefault = hasDefaultFilter(body)
      refs.push({
        name,
        dtype,
        optional: hasDefault || optionalNames.has(name),
      })
    }
  }

  // Fold refs by name — dtype uses the most specific, required is AND across
  // all references (any optional usage makes the param optional).
  const byName = new Map<string, JinjaParamInfo>()
  for (const r of refs) {
    const prev = byName.get(r.name)
    if (!prev) {
      byName.set(r.name, {
        name: r.name,
        dtype: r.dtype ?? "string",
        required: !r.optional,
      })
    } else {
      prev.dtype = mergeType(prev.dtype, r.dtype)
      // Required only if every reference is required.
      if (r.optional) prev.required = false
    }
  }

  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}

/**
 * Coerce a raw text field value to the target datatype before sending.
 *
 * Returns `undefined` when the input is empty (caller drops the key) so
 * optional params truly disappear from the payload.
 */
export function coerceTypedValue(raw: string, dtype: JinjaParamType): unknown {
  const trimmed = raw.trim()
  if (trimmed === "") return undefined

  switch (dtype) {
    case "integer": {
      const n = Number(trimmed)
      return Number.isSafeInteger(n) ? n : raw
    }
    case "number": {
      const n = Number(trimmed)
      return Number.isFinite(n) ? n : raw
    }
    case "boolean":
      if (trimmed === "true") return true
      if (trimmed === "false") return false
      return raw
    case "list":
      // Comma-separated values; honor quotes and trim whitespace.
      return trimmed
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          // Auto-cast each item to number/bool if shaped like one, else string.
          if (/^-?\d+$/.test(s)) {
            const n = Number(s)
            if (Number.isSafeInteger(n)) return n
          }
          if (/^-?\d*\.\d+$/.test(s)) {
            const n = Number(s)
            if (Number.isFinite(n)) return n
          }
          if (s === "true") return true
          if (s === "false") return false
          return s
        })
    default:
      return raw
  }
}
