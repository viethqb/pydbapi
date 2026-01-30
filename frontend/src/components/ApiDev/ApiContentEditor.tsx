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

function registerSqlCompletions(monaco: typeof Monaco) {
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

  return monaco.languages.registerCompletionItemProvider("sql", {
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
}

function registerPythonCompletions(monaco: typeof Monaco) {
  return monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: [".", "("],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      )

      const suggestions: Monaco.languages.CompletionItem[] = [
        {
          label: "execute(params) (snippet)",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            // biome-ignore lint/suspicious/noTemplateCurlyInString: Monaco snippet placeholder syntax
            "def execute(params):\n    ${1:# TODO: implement}\n    return ${2:{\"result\": \"success\"}}\n",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        },
        {
          label: "params.get",
          kind: monaco.languages.CompletionItemKind.Method,
          // biome-ignore lint/suspicious/noTemplateCurlyInString: Monaco snippet placeholder syntax
          insertText: "params.get(${1:\"key\"})",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        },
        {
          label: "return dict",
          kind: monaco.languages.CompletionItemKind.Snippet,
          // biome-ignore lint/suspicious/noTemplateCurlyInString: Monaco snippet placeholder syntax
          insertText: "return {${1:\"key\"}: ${2:\"value\"}}",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        },
      ]

      return { suggestions }
    },
  })
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

  const disposablesRef = useRef<Monaco.IDisposable[]>([])
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

      // Clean up previous providers registered from this component instance
      for (const d of disposablesRef.current) d.dispose()
      disposablesRef.current = []

      disposablesRef.current.push(
        registerSqlCompletions(monaco),
        registerPythonCompletions(monaco)
      )

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

