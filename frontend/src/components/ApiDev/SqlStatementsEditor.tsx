import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Plus, X } from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import ApiContentEditor from "@/components/ApiDev/ApiContentEditor"

/**
 * Split SQL string into statements by ';'.
 * Matches backend behavior (naive split, assumes no semicolons in literals).
 */
function splitStatements(sql: string): string[] {
  const parts = (sql ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : [""]
}

/**
 * Join statements back into a single SQL string.
 */
function joinStatements(statements: string[]): string {
  const parts = (Array.isArray(statements) ? statements : [])
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
  return parts.join(";\n\n")
}

type Props = {
  value: string
  onChange: (next: string) => void
  onBlur?: () => void
  placeholder?: string
  paramNames?: string[]
  disabled?: boolean
}

export default function SqlStatementsEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  paramNames = [],
  disabled = false,
}: Props) {
  const [statements, setStatements] = useState<string[]>(() => splitStatements(value ?? ""))
  const [activeTab, setActiveTab] = useState<string>("stmt-0")
  
  // Version counter to track internal changes
  const [version, setVersion] = useState(0)
  
  // Track if we're the source of the change to avoid echo
  const lastEmittedRef = useRef<string>(value ?? "")
  const isExternalUpdateRef = useRef(false)

  // Sync from parent value prop (only when it's a genuine external change)
  useEffect(() => {
    const incoming = value ?? ""
    // Skip if this is our own emission coming back
    if (incoming === lastEmittedRef.current) {
      return
    }
    // External change - resync
    isExternalUpdateRef.current = true
    const newStatements = splitStatements(incoming)
    lastEmittedRef.current = incoming
    setStatements(newStatements)
    setActiveTab("stmt-0")
  }, [value])

  const tabIds = useMemo(
    () => statements.map((_, i) => `stmt-${i}`),
    [statements]
  )

  // Correct active tab if it no longer exists
  useEffect(() => {
    if (tabIds.length > 0 && !tabIds.includes(activeTab)) {
      setActiveTab(tabIds[0])
    }
  }, [activeTab, tabIds])

  // Store onChange in a ref to avoid dependency issues
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Emit changes to parent when version changes (internal updates only)
  useEffect(() => {
    if (version === 0) return // Skip initial
    if (isExternalUpdateRef.current) {
      isExternalUpdateRef.current = false
      return
    }
    
    const nextValue = joinStatements(statements)
    if (nextValue === lastEmittedRef.current) return
    
    lastEmittedRef.current = nextValue
    // Use setTimeout to break out of React's update cycle
    const timer = setTimeout(() => {
      onChangeRef.current(nextValue)
    }, 0)
    
    return () => clearTimeout(timer)
  }, [version, statements])

  const handleUpdateStatement = useCallback((idx: number, next: string) => {
    setStatements((prev) => {
      // Skip if value hasn't changed (prevents loop from Monaco mount/unmount)
      if (prev[idx] === next) return prev
      const copy = [...prev]
      copy[idx] = next
      // Only increment version when value actually changes
      setVersion((v) => v + 1)
      return copy
    })
  }, [])

  const handleAdd = useCallback(() => {
    setStatements((prev) => [...prev, ""])
    setVersion((v) => v + 1)
    setActiveTab(`stmt-${statements.length}`)
  }, [statements.length])

  const handleRemove = useCallback((idx: number) => {
    setStatements((prev) => {
      if (prev.length <= 1) return [""]
      return prev.filter((_, i) => i !== idx)
    })
    setVersion((v) => v + 1)
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Multiple statements are executed in order.
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={disabled}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add statement
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start overflow-auto">
          {statements.map((_, idx) => {
            const tabId = `stmt-${idx}`
            return (
              <div key={tabId} className="flex items-center">
                <TabsTrigger value={tabId}>Statement {idx + 1}</TabsTrigger>
                {!disabled && statements.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-ml-2 h-8 w-8"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleRemove(idx)
                    }}
                    title="Remove statement"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )
          })}
        </TabsList>

        {statements.map((stmt, idx) => {
          const tabId = `stmt-${idx}`
          return (
            <TabsContent key={tabId} value={tabId} className="mt-3">
              <ApiContentEditor
                executeEngine="SQL"
                value={stmt}
                onChange={(next) => handleUpdateStatement(idx, next)}
                onBlur={onBlur}
                placeholder={placeholder}
                paramNames={paramNames}
                disabled={disabled}
                autoHeight
                minHeight={220}
                maxHeight={720}
              />
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
