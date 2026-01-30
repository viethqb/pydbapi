import Editor, { type OnMount } from "@monaco-editor/react"
import type * as Monaco from "monaco-editor"
import { Braces, ChevronDown } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { format as formatSql } from "sql-formatter"
import initRuff, { format as formatPython } from "@wasm-fmt/ruff_fmt/vite"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useTheme } from "@/components/theme-provider"
import useCustomToast from "@/hooks/useCustomToast"

export type ApiContentEditorExecuteEngine = "SQL" | "SCRIPT"

type Props = {
  executeEngine: ApiContentEditorExecuteEngine
  value: string
  onChange: (next: string) => void
  onBlur?: () => void
  placeholder?: string
  paramNames?: string[]
  height?: number
  autoHeight?: boolean
  minHeight?: number
  maxHeight?: number
  disabled?: boolean
  // Expose editor ref so parent can sync value before unmount
  onEditorReady?: (getValue: () => string) => void
}

let ruffInitPromise: Promise<void> | null = null
async function ensureRuffInitialized() {
  if (!ruffInitPromise) ruffInitPromise = initRuff()
  await ruffInitPromise
}

function getMonacoLanguage(executeEngine: ApiContentEditorExecuteEngine) {
  return executeEngine === "SQL" ? "sql" : "python"
}

function getDefaultFilename(executeEngine: ApiContentEditorExecuteEngine) {
  return executeEngine === "SQL" ? "query.sql" : "main.py"
}

const JINJA_BLOCK_RE = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g
function maskJinjaBlocks(input: string) {
  const blocks: string[] = []
  const masked = input.replace(JINJA_BLOCK_RE, (m) => {
    const idx = blocks.push(m) - 1
    return `__JINJA_BLOCK_${idx}__`
  })
  return { masked, blocks }
}

function unmaskJinjaBlocks(input: string, blocks: string[]) {
  let out = input
  for (let i = 0; i < blocks.length; i++) {
    out = out.replaceAll(`__JINJA_BLOCK_${i}__`, blocks[i] ?? "")
  }
  return out
}

// Jinja2 filters (backend engines/sql/filters.py)
const JINJA_FILTER_NAMES = [
  "sql_string",
  "sql_int",
  "sql_float",
  "sql_bool",
  "sql_date",
  "sql_datetime",
  "in_list",
  "sql_like",
  "sql_like_start",
  "sql_like_end",
  "json",
] as const

// Jinja2 tags for the dropdown (SQL mode only). Insert at cursor when selected.
const JINJA_TAGS: Array<{ id: string; label: string; insert: string }> = [
  // Block tags
  { id: "if", label: "{% if %} ... {% endif %}", insert: "{% if param %}\n  \n{% endif %}" },
  { id: "for", label: "{% for %} ... {% endfor %}", insert: "{% for item in items %}\n  \n{% endfor %}" },
  { id: "where", label: "{% where %} ... {% endwhere %}", insert: "{% where %}\n  {% if param %}condition\n  {% endif %}\n{% endwhere %}" },
  { id: "set", label: "{% set %}", insert: "{% set var = value %}" },
  { id: "else", label: "{% else %}", insert: "{% else %}" },
  { id: "elif", label: "{% elif %}", insert: "{% elif condition %}" },
  { id: "endif", label: "{% endif %}", insert: "{% endif %}" },
  { id: "endfor", label: "{% endfor %}", insert: "{% endfor %}" },
  { id: "endwhere", label: "{% endwhere %}", insert: "{% endwhere %}" },
  { id: "comment", label: "{# comment #}", insert: "{#  #}" },
  // Param + filter: {{ param | filter }}
  ...JINJA_FILTER_NAMES.map((f) => ({
    id: `param-${f}`,
    label: `{{ param | ${f} }}`,
    insert: `{{ param | ${f} }}`,
  })),
]

// Register completion providers once per Monaco instance to avoid duplicate suggestions
// when multiple editors (e.g. Content + Result transform) use the same language.
let sqlCompletionDisposable: Monaco.IDisposable | null = null
let pythonCompletionDisposable: Monaco.IDisposable | null = null

function registerSqlCompletions(monaco: typeof Monaco) {
  if (sqlCompletionDisposable) return sqlCompletionDisposable
  const keywords = [
    "SELECT",
    "FROM",
    "WHERE",
    "JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "INNER JOIN",
    "OUTER JOIN",
    "GROUP BY",
    "ORDER BY",
    "LIMIT",
    "OFFSET",
    "INSERT",
    "INTO",
    "VALUES",
    "UPDATE",
    "SET",
    "DELETE",
    "RETURNING",
    "AND",
    "OR",
    "NOT",
    "NULL",
    "TRUE",
    "FALSE",
  ]

  const disposable = monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", " "],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      )
      const suggestions: Monaco.languages.CompletionItem[] = keywords.map(
        (k) => ({
          label: k,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: k,
          range,
        })
      )
      return { suggestions }
    },
  })
  sqlCompletionDisposable = disposable
  return disposable
}

// Built-in globals for Python script. Kind (Module/Variable) applied in provider.
const PYTHON_SCRIPT_GLOBALS: Array<{ label: string; detail: string; kind: "module" | "variable" }> = [
  { label: "db", detail: "Database: query, query_one, execute, insert, update, delete", kind: "module" },
  { label: "http", detail: "HTTP client: get, post, put, delete", kind: "module" },
  { label: "cache", detail: "Cache (Redis): get, set, delete, exists, incr, decr", kind: "module" },
  { label: "env", detail: "Environment: get, get_int, get_bool", kind: "module" },
  { label: "log", detail: "Logging: info, warn, error, debug", kind: "module" },
  { label: "req", detail: "Request params dict (same as params in execute)", kind: "variable" },
  { label: "tx", detail: "Transaction: begin, commit, rollback", kind: "module" },
  { label: "ds", detail: "DataSource metadata: id, name, host, database", kind: "variable" },
  { label: "params", detail: "Request params dict (argument of execute)", kind: "variable" },
  { label: "json", detail: "json.loads, json.dumps", kind: "module" },
  { label: "datetime", detail: "datetime, date, time, timedelta", kind: "module" },
]

function registerPythonCompletions(monaco: typeof Monaco) {
  if (pythonCompletionDisposable) return pythonCompletionDisposable
  const disposable = monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: [".", "(", " "],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      )
      const lineContent = model.getLineContent(position.lineNumber)
      const textBeforeCursor = lineContent.slice(0, position.column - 1)
      const trimmed = textBeforeCursor.trimEnd()

      const suggestions: Monaco.languages.CompletionItem[] = []

      // Member completion: db.*, http.*, cache.*, env.*, log.*, tx.* (single-quote strings for Monaco ${n:placeholder})
      if (trimmed.endsWith("db.")) {
        suggestions.push(
          { label: "query", insertText: 'query(${1:sql}, ${2:params=None})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "list[dict]. Run SELECT; params: (tuple) or [list] for %s" },
          { label: "query_one", insertText: 'query_one(${1:sql}, ${2:params=None})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "dict | None. Single row" },
          { label: "execute", insertText: 'execute(${1:sql}, ${2:params=None})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "int. Run INSERT/UPDATE/DELETE; returns rowcount" },
          { label: "insert", insertText: 'insert(${1:sql}, ${2:params=None})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "int. INSERT" },
          { label: "update", insertText: 'update(${1:sql}, ${2:params=None})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "int. UPDATE" },
          { label: "delete", insertText: 'delete(${1:sql}, ${2:params=None})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "int. DELETE" },
        )
      } else if (trimmed.endsWith("http.")) {
        suggestions.push(
          { label: "get", insertText: 'get(${1:url})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "GET request; returns JSON or text" },
          { label: "post", insertText: 'post(${1:url}, ${2:json=None})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "POST request" },
          { label: "put", insertText: 'put(${1:url}, ${2:json=None})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "PUT request" },
          { label: "delete", insertText: 'delete(${1:url})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "DELETE request" },
        )
      } else if (trimmed.endsWith("cache.")) {
        suggestions.push(
          { label: "get", insertText: 'get(${1:key})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Get value by key" },
          { label: "set", insertText: 'set(${1:key}, ${2:value}, ${3:ttl_seconds=None})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Set key=value; optional TTL" },
          { label: "delete", insertText: 'delete(${1:key})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Delete key" },
          { label: "exists", insertText: 'exists(${1:key})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "bool" },
          { label: "incr", insertText: 'incr(${1:key}, ${2:amount=1})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Increment counter" },
          { label: "decr", insertText: 'decr(${1:key}, ${2:amount=1})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Decrement counter" },
        )
      } else if (trimmed.endsWith("env.")) {
        suggestions.push(
          { label: "get", insertText: 'get(${1:key})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Get env/settings value (whitelisted keys)" },
          { label: "get_int", insertText: 'get_int(${1:key})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Get as int" },
          { label: "get_bool", insertText: 'get_bool(${1:key})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Get as bool" },
        )
      } else if (trimmed.endsWith("log.")) {
        suggestions.push(
          { label: "info", insertText: 'info(${1:msg})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Log info" },
          { label: "warn", insertText: 'warn(${1:msg})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Log warning" },
          { label: "error", insertText: 'error(${1:msg})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Log error" },
          { label: "debug", insertText: 'debug(${1:msg})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, kind: monaco.languages.CompletionItemKind.Method, detail: "Log debug" },
        )
      } else if (trimmed.endsWith("tx.")) {
        suggestions.push(
          { label: "begin", insertText: "begin()", range, kind: monaco.languages.CompletionItemKind.Method, detail: "Start transaction" },
          { label: "commit", insertText: "commit()", range, kind: monaco.languages.CompletionItemKind.Method, detail: "Commit transaction" },
          { label: "rollback", insertText: "rollback()", range, kind: monaco.languages.CompletionItemKind.Method, detail: "Rollback transaction" },
        )
      } else {
        // Globals and snippets
        const kindModule = monaco.languages.CompletionItemKind.Module
        const kindVar = monaco.languages.CompletionItemKind.Variable
        for (const g of PYTHON_SCRIPT_GLOBALS) {
          suggestions.push({
            label: g.label,
            detail: g.detail,
            kind: g.kind === "module" ? kindModule : kindVar,
            insertText: g.label,
            range,
          })
        }
        suggestions.push(
          {
            label: "execute(params=None) (snippet)",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'def execute(params=None):\n    ${1:params = params or {}}\n    sql = "${2:SELECT 1 AS col}"\n    rows = db.query(sql)\n    return ${3:rows}\n',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: "Main entry: params from request, return dict/list",
          },
          {
            label: "params.get",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'params.get(${1:"key"}${2:, default})',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: "Get request param with optional default",
          },
          {
            label: "db.query(sql)",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'db.query(${1:"SELECT * FROM table"}${2:, (param1,)})\n${3:return }rows',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: "Run SELECT, get list of dicts",
          },
          {
            label: "db.query_one(sql)",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'row = db.query_one(${1:"SELECT * FROM table WHERE id = %s"}, (${2:id},))',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: "Single row or None",
          },
          {
            label: "return dict",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'return {${1:"key"}: ${2:value}}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: "Return JSON object",
          },
          {
            label: "return list",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'return ${1:rows}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: "Return list (e.g. rows)",
          },
        )
      }

      return { suggestions }
    },
  })
  pythonCompletionDisposable = disposable
  return disposable
}

export default function ApiContentEditor({
  executeEngine,
  value,
  onChange,
  onBlur,
  placeholder,
  paramNames = [],
  height = 420,
  autoHeight = false,
  minHeight,
  maxHeight,
  disabled = false,
  onEditorReady,
}: Props) {
  const { resolvedTheme } = useTheme()
  const { showErrorToast, showSuccessToast } = useCustomToast()

  const paramNamesRef = useRef<string[]>([])
  useEffect(() => {
    paramNamesRef.current = Array.isArray(paramNames) ? paramNames : []
  }, [paramNames])

  const language = useMemo(
    () => getMonacoLanguage(executeEngine),
    [executeEngine]
  )
  const theme = useMemo(
    () => (resolvedTheme === "dark" ? "vs-dark" : "vs"),
    [resolvedTheme]
  )

  const [isFormatting, setIsFormatting] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [jinjaOpen, setJinjaOpen] = useState(false)
  const [jinjaSearch, setJinjaSearch] = useState("")

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const valueRef = useRef<string>("")
  useEffect(() => {
    // Mirror latest controlled value so blur/change handlers
    // can compare against it without forcing editor state.
    valueRef.current = value ?? ""
  }, [value])

  // Update theme when resolvedTheme changes
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(theme)
    }
  }, [theme])

  const onMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco

      // Set initial theme
      monaco.editor.setTheme(theme)

      // Set initial value from prop when editor mounts
      // Use valueRef.current which is synced from prop value
      // This ensures the editor shows the correct value from form state
      const initialValue = valueRef.current ?? ""
      editor.setValue(initialValue)

      // Register completion providers once globally (they are shared across editors)
      registerSqlCompletions(monaco)
      registerPythonCompletions(monaco)

      editor.onDidFocusEditorText(() => setIsFocused(true))
      editor.onDidBlurEditorText(() => {
        setIsFocused(false)
        // Ensure RHF sees the latest buffer
        const current = editor.getValue()
        // Only call onChange if value actually changed
        if (current !== valueRef.current && current.length > 0) {
          onChange(current)
        }
        onBlur?.()
      })

      // Extra safety: keep RHF synced even if wrapper misses some events
      editor.onDidChangeModelContent(() => {
        const current = editor.getValue()
        if (current !== valueRef.current) onChange(current)
      })

      // Expose getValue function to parent component
      if (onEditorReady) {
        onEditorReady(() => editor.getValue())
      }
    },
    [onBlur, onChange, theme, onEditorReady]
  )

  // Sync value to editor when value prop changes (e.g., when tab remounts)
  // This is critical: when tab Content is opened again, we need to ensure
  // the editor shows the value from form state, even if user didn't type anything
  useEffect(() => {
    if (editorRef.current) {
      const currentEditorValue = editorRef.current.getValue()
      const newValue = value ?? ""
      // Always sync if different - this ensures form state is reflected in editor
      if (currentEditorValue !== newValue) {
        // Update valueRef BEFORE setting editor value to prevent onChange loop
        valueRef.current = newValue
        // Use setValue with a small delay to ensure it happens after mount
        // This is important when tab remounts
        const timeoutId = setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.setValue(newValue)
          }
        }, 0)
        return () => clearTimeout(timeoutId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Sync editor value back to form when component unmounts
  // Use useLayoutEffect to ensure sync happens before React unmounts the component
  // Capture onChange and value at mount time to avoid sharing between instances
  useLayoutEffect(() => {
    // Capture the current onChange and value at mount time
    // This ensures each editor instance has its own cleanup function
    const currentOnChange = onChange
    const currentValue = value ?? ""
    
    return () => {
      // When component unmounts (e.g., switching tabs), sync editor value to form
      // This is critical: even if user didn't type anything, we need to preserve
      // the value that was loaded from form state
      const editor = editorRef.current
      if (editor) {
        try {
          const current = editor.getValue()
          // Only sync if value is DIFFERENT from what we received as prop
          // This prevents unnecessary onChange calls that cause infinite loops
          if (current !== currentValue && current && current.length > 0) {
            currentOnChange(current)
          }
          // If values are the same, don't sync (no change to report)
        } catch {
          // Editor might be destroyed - don't sync to avoid loops
        }
      }
      // If editor not ready, don't sync - nothing to report
    }
  }, [onChange, value]) // Include all deps to ensure each editor has its own cleanup

  const insertJinjaAtCursor = useCallback((snippet: string) => {
    const editor = editorRef.current
    if (!editor) return
    const selection = editor.getSelection()
    if (!selection) return
    editor.executeEdits("jinja-insert", [{ range: selection, text: snippet }])
    setJinjaOpen(false)
    setJinjaSearch("")
    const newValue = editor.getValue()
    if (newValue !== valueRef.current) onChange(newValue)
  }, [onChange])

  const handleFormat = useCallback(async () => {
    try {
      setIsFormatting(true)
      const input = value ?? ""
      if (executeEngine === "SQL") {
        const { masked, blocks } = maskJinjaBlocks(input)
        const formattedMasked = formatSql(masked, { language: "postgresql" })
        const formatted = unmaskJinjaBlocks(formattedMasked, blocks)
        onChange(formatted)
        showSuccessToast("SQL formatted")
        return
      }

      await ensureRuffInitialized()
      const formatted = formatPython(input, getDefaultFilename(executeEngine), {
        indent_style: "space",
        indent_width: 4,
        line_width: 88,
        quote_style: "double",
        magic_trailing_comma: "respect",
      })
      onChange(formatted)
      showSuccessToast("Python formatted")
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Failed to format code")
    } finally {
      setIsFormatting(false)
    }
  }, [executeEngine, onChange, showErrorToast, showSuccessToast, value])

  const showPlaceholder = (value ?? "").trim() === "" && !isFocused

  const effectiveHeight = useMemo(() => {
    if (!autoHeight) return height
    const src = (value ?? "").trim() !== "" ? (value ?? "") : (placeholder ?? "")
    const lines = Math.max(1, src.split(/\r\n|\r|\n/).length)
    // Keep in sync with Monaco options lineHeight=20 (+ UI chrome padding).
    const lineHeightPx = 20
    const chromePx = 64
    const computed = lines * lineHeightPx + chromePx
    const minH = minHeight ?? 140
    const maxH = maxHeight ?? 520
    return Math.max(minH, Math.min(maxH, computed))
  }, [autoHeight, height, maxHeight, minHeight, placeholder, value])

  const jinjaTagsFiltered = useMemo(() => {
    const q = jinjaSearch.trim().toLowerCase()
    if (!q) return JINJA_TAGS
    return JINJA_TAGS.filter(
      (t) => t.id.toLowerCase().includes(q) || t.label.toLowerCase().includes(q)
    )
  }, [jinjaSearch])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Autocomplete: <span className="font-mono">Ctrl+Space</span>
        </div>
        <div className="flex items-center gap-2">
          {executeEngine === "SQL" && (
            <DropdownMenu open={jinjaOpen} onOpenChange={(open) => { setJinjaOpen(open); if (!open) setJinjaSearch("") }}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  className="gap-1.5"
                >
                  Jinja tags
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <div className="p-2 border-b">
                  <Input
                    placeholder="Search tags..."
                    value={jinjaSearch}
                    onChange={(e) => setJinjaSearch(e.target.value)}
                    className="h-8"
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="max-h-64 overflow-auto p-1">
                  {jinjaTagsFiltered.length === 0 ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">No match</div>
                  ) : (
                    jinjaTagsFiltered.map((tag) => (
                      <DropdownMenuItem
                        key={tag.id}
                        onSelect={(e) => {
                          e.preventDefault()
                          insertJinjaAtCursor(tag.insert)
                        }}
                        className="cursor-pointer font-mono text-xs"
                      >
                        {tag.label}
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFormat}
            disabled={disabled || isFormatting}
          >
            <Braces className="mr-2 h-4 w-4" />
            {isFormatting ? "Formatting..." : "Format"}
          </Button>
        </div>
      </div>

      <div className="relative rounded-md border overflow-hidden">
        {showPlaceholder && (
          <div className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground font-mono whitespace-pre-wrap">
            {placeholder}
          </div>
        )}
        <Editor
          height={effectiveHeight}
          language={language}
          theme={theme}
          value={value}
          onChange={(v) => onChange(v ?? "")}
          onMount={onMount}
          options={{
            readOnly: Boolean(disabled),
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: 13,
            lineHeight: 20,
            tabSize: 2,
            insertSpaces: true,
            wordWrap: "on",
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            parameterHints: { enabled: true },
            formatOnPaste: false,
            formatOnType: false,
            // Auto-close { with } (and other brackets)
            autoClosingBrackets: true,
          }}
        />
      </div>
    </div>
  )
}

