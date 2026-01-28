import Editor, { type OnMount } from "@monaco-editor/react"
import type * as Monaco from "monaco-editor"
import { Braces } from "lucide-react"
import type { MutableRefObject } from "react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { format as formatSql } from "sql-formatter"
import initRuff, { format as formatPython } from "@wasm-fmt/ruff_fmt/vite"

import { Button } from "@/components/ui/button"
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

function registerSqlCompletions(
  monaco: typeof Monaco,
  paramNamesRef: MutableRefObject<string[]>
) {
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
    triggerCharacters: ["{", ".", " "],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      )

      const baseSuggestions: Monaco.languages.CompletionItem[] = keywords.map(
        (k) => ({
          label: k,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: k,
          range,
        })
      )

      const params = Array.from(new Set(paramNamesRef.current))
        .map((x) => x.trim())
        .filter(Boolean)

      const paramSuggestions: Monaco.languages.CompletionItem[] = params.flatMap(
        (name) => [
          {
            label: `{{ ${name} }}`,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: `{{ ${name} }}`,
            range,
            detail: "Jinja2 param",
          },
          {
            label: `{{ ${name} | sql_string }}`,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: `{{ ${name} | sql_string }}`,
            range,
            detail: "Jinja2 param (quoted string)",
          },
        ]
      )

      const snippetSuggestions: Monaco.languages.CompletionItem[] = [
        {
          label: "Jinja2 param (snippet)",
          kind: monaco.languages.CompletionItemKind.Snippet,
          // biome-ignore lint/suspicious/noTemplateCurlyInString: Monaco snippet placeholder syntax
          insertText: "{{ ${1:name} }}",
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        },
      ]

      return { suggestions: [...snippetSuggestions, ...paramSuggestions, ...baseSuggestions] }
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
        registerSqlCompletions(monaco, paramNamesRef),
        registerPythonCompletions(monaco)
      )

      editor.onDidFocusEditorText(() => setIsFocused(true))
      editor.onDidBlurEditorText(() => {
        setIsFocused(false)
        // Ensure RHF sees the latest buffer
        const current = editor.getValue()
        // Only sync if editor has actual content OR if valueRef is also empty
        // This prevents empty values from overwriting form state when editor is being destroyed
        if (current !== valueRef.current) {
          // If current is empty but valueRef has value, editor is likely being destroyed
          // Don't sync to avoid resetting form state
          if (!(current.length === 0 && valueRef.current.length > 0)) {
            onChange(current)
          }
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
          // Only sync if editor has a value (not empty) or if valueRef has value
          // This prevents empty values from overwriting form state
          if (current && current.length > 0) {
            currentOnChange(current)
          } else if (currentValue && currentValue.length > 0) {
            // If editor is empty but valueRef has value, use valueRef
            currentOnChange(currentValue)
          }
          // If both are empty, don't sync (preserve form state as-is)
        } catch {
          // Editor might be destroyed, only sync if valueRef has value
          if (currentValue && currentValue.length > 0) {
            currentOnChange(currentValue)
          }
        }
      } else {
        // Editor not ready, only sync if valueRef has value
        if (currentValue && currentValue.length > 0) {
          currentOnChange(currentValue)
        }
      }
    }
  }, [onChange, value]) // Include all deps to ensure each editor has its own cleanup

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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Autocomplete: <span className="font-mono">Ctrl+Space</span>
        </div>
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

      <div className="relative rounded-md border overflow-hidden">
        {showPlaceholder && (
          <div className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground font-mono whitespace-pre-wrap">
            {placeholder}
          </div>
        )}
        <Editor
          height={height}
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
          }}
        />
      </div>
    </div>
  )
}

