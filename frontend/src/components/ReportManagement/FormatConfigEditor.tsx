import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronRight,
  Italic,
  Trash2,
  WrapText,
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Toggle } from "@/components/ui/toggle"
import type { CellFormat, FormatConfig } from "@/services/report"

const FONT_NAMES = [
  "Arial",
  "Calibri",
  "Cambria",
  "Consolas",
  "Courier New",
  "Georgia",
  "Helvetica",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
] as const

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36] as const

const PRESET_COLORS = [
  { label: "Black", value: "000000" },
  { label: "White", value: "FFFFFF" },
  { label: "Red", value: "FF0000" },
  { label: "Dark Red", value: "C00000" },
  { label: "Orange", value: "FF6600" },
  { label: "Yellow", value: "FFFF00" },
  { label: "Light Yellow", value: "FFFFCC" },
  { label: "Green", value: "00B050" },
  { label: "Dark Green", value: "006100" },
  { label: "Light Green", value: "C6EFCE" },
  { label: "Blue", value: "0070C0" },
  { label: "Dark Blue", value: "002060" },
  { label: "Light Blue", value: "DDEBF7" },
  { label: "Purple", value: "7030A0" },
  { label: "Gray 25%", value: "D9D9D9" },
  { label: "Gray 50%", value: "808080" },
  { label: "Gray 80%", value: "333333" },
] as const

const NUMBER_FORMATS = [
  { label: "General", value: "General" },
  { label: "#,##0", value: "#,##0" },
  { label: "#,##0.00", value: "#,##0.00" },
  { label: "0%", value: "0%" },
  { label: "0.00%", value: "0.00%" },
  { label: "yyyy-mm-dd", value: "yyyy-mm-dd" },
  { label: "dd/mm/yyyy", value: "dd/mm/yyyy" },
  { label: "yyyy-mm-dd hh:mm", value: "yyyy-mm-dd hh:mm:ss" },
  { label: "@  (Text)", value: "@" },
] as const

const BORDER_STYLES = [
  { label: "None", value: "" },
  { label: "Thin", value: "thin" },
  { label: "Medium", value: "medium" },
  { label: "Thick", value: "thick" },
  { label: "Dashed", value: "dashed" },
  { label: "Dotted", value: "dotted" },
  { label: "Double", value: "double" },
] as const

function ColorSelect({
  value,
  onChange,
  className,
}: {
  value: string | null | undefined
  onChange: (v: string | undefined) => void
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
        <SelectTrigger className="h-8 text-xs flex-1">
          <div className="flex items-center gap-1.5">
            {value && (
              <span
                className="inline-block w-3 h-3 rounded-sm border border-border shrink-0"
                style={{ backgroundColor: `#${value}` }}
              />
            )}
            <SelectValue placeholder="Color" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__clear__">
            <span className="text-muted-foreground">None</span>
          </SelectItem>
          {PRESET_COLORS.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm border border-border"
                  style={{ backgroundColor: `#${c.value}` }}
                />
                <span>{c.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-8 text-xs w-20 font-mono"
        placeholder="Hex"
        maxLength={6}
        value={value ?? ""}
        onChange={(e) => {
          const hex = e.target.value.replace(/[^a-fA-F0-9]/g, "").slice(0, 6)
          onChange(hex || undefined)
        }}
      />
    </div>
  )
}

function CellFormatSection({
  label,
  value,
  onChange,
}: {
  label: string
  value: CellFormat | null | undefined
  onChange: (v: CellFormat | null) => void
}) {
  const [open, setOpen] = useState(false)
  const fmt = value || {}

  const update = (patch: Partial<CellFormat>) => {
    const next = { ...fmt, ...patch }
    const isEmpty =
      !next.font && !next.fill && !next.border && !next.alignment && !next.number_format
    onChange(isEmpty ? null : next)
  }

  const clearColor = (v: string | undefined) =>
    v === "__clear__" ? undefined : v

  const summaryParts: string[] = []
  if (fmt.font?.bold) summaryParts.push("B")
  if (fmt.font?.italic) summaryParts.push("I")
  if (fmt.font?.name) summaryParts.push(fmt.font.name)
  if (fmt.fill?.bg_color) summaryParts.push(`bg:#${fmt.fill.bg_color}`)
  if (fmt.border?.style) summaryParts.push(`border:${fmt.border.style}`)
  if (fmt.number_format) summaryParts.push(fmt.number_format)

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        {label}
        {summaryParts.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground truncate max-w-[200px]">
            {summaryParts.join(" · ")}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-4 border-t pt-3">
          {/* Font row */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Font</Label>
            <div className="flex flex-wrap gap-2">
              <Select
                value={fmt.font?.name ?? ""}
                onValueChange={(v) =>
                  update({ font: { ...fmt.font, name: v || undefined } })
                }
              >
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue placeholder="Font family" />
                </SelectTrigger>
                <SelectContent>
                  {FONT_NAMES.map((f) => (
                    <SelectItem key={f} value={f}>
                      <span style={{ fontFamily: f }}>{f}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={fmt.font?.size?.toString() ?? ""}
                onValueChange={(v) =>
                  update({
                    font: { ...fmt.font, size: v ? Number(v) : undefined },
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs w-[72px]">
                  <SelectValue placeholder="Size" />
                </SelectTrigger>
                <SelectContent>
                  {FONT_SIZES.map((s) => (
                    <SelectItem key={s} value={s.toString()}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-0.5">
                <Toggle
                  size="sm"
                  pressed={fmt.font?.bold ?? false}
                  onPressedChange={(p) =>
                    update({ font: { ...fmt.font, bold: p || undefined } })
                  }
                  aria-label="Bold"
                  className="h-8 w-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  <Bold className="h-3.5 w-3.5" />
                </Toggle>
                <Toggle
                  size="sm"
                  pressed={fmt.font?.italic ?? false}
                  onPressedChange={(p) =>
                    update({ font: { ...fmt.font, italic: p || undefined } })
                  }
                  aria-label="Italic"
                  className="h-8 w-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  <Italic className="h-3.5 w-3.5" />
                </Toggle>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Font Color</Label>
              <ColorSelect
                value={fmt.font?.color}
                onChange={(v) =>
                  update({ font: { ...fmt.font, color: clearColor(v) } })
                }
              />
            </div>
          </div>

          {/* Fill */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Background</Label>
            <ColorSelect
              value={fmt.fill?.bg_color}
              onChange={(v) => {
                const c = clearColor(v)
                update({
                  fill: c
                    ? { bg_color: c, pattern: fmt.fill?.pattern || "solid" }
                    : undefined,
                })
              }}
            />
          </div>

          {/* Border */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Border</Label>
            <div className="flex gap-2">
              <Select
                value={fmt.border?.style ?? ""}
                onValueChange={(v) =>
                  update({
                    border: v
                      ? { style: v, color: fmt.border?.color || "000000" }
                      : undefined,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Style" />
                </SelectTrigger>
                <SelectContent>
                  {BORDER_STYLES.map((b) => (
                    <SelectItem key={b.value || "__none"} value={b.value || "__none__"}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fmt.border?.style && (
                <ColorSelect
                  value={fmt.border?.color}
                  onChange={(v) =>
                    update({
                      border: { ...fmt.border, color: clearColor(v) || "000000" },
                    })
                  }
                  className="flex-1"
                />
              )}
            </div>
          </div>

          {/* Alignment */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Alignment</Label>
            <div className="flex gap-2 items-center">
              <div className="flex gap-0.5">
                {(
                  [
                    { val: "left", icon: AlignLeft },
                    { val: "center", icon: AlignCenter },
                    { val: "right", icon: AlignRight },
                    { val: "justify", icon: AlignJustify },
                  ] as const
                ).map(({ val, icon: Icon }) => (
                  <Toggle
                    key={val}
                    size="sm"
                    pressed={fmt.alignment?.horizontal === val}
                    onPressedChange={(p) =>
                      update({
                        alignment: {
                          ...fmt.alignment,
                          horizontal: p ? val : undefined,
                        },
                      })
                    }
                    aria-label={val}
                    className="h-8 w-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Toggle>
                ))}
              </div>
              <Select
                value={fmt.alignment?.vertical ?? ""}
                onValueChange={(v) =>
                  update({
                    alignment: { ...fmt.alignment, vertical: v || undefined },
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs w-[100px]">
                  <SelectValue placeholder="Vertical" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">Top</SelectItem>
                  <SelectItem value="center">Middle</SelectItem>
                  <SelectItem value="bottom">Bottom</SelectItem>
                </SelectContent>
              </Select>
              <Toggle
                size="sm"
                pressed={fmt.alignment?.wrap_text ?? false}
                onPressedChange={(p) =>
                  update({
                    alignment: {
                      ...fmt.alignment,
                      wrap_text: p || undefined,
                    },
                  })
                }
                aria-label="Wrap text"
                className="h-8 w-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                <WrapText className="h-3.5 w-3.5" />
              </Toggle>
            </div>
          </div>

          {/* Number Format */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Number Format</Label>
            <div className="flex gap-2">
              <Select
                value={fmt.number_format ?? ""}
                onValueChange={(v) => update({ number_format: v || undefined })}
              >
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">
                    <span className="text-muted-foreground">None</span>
                  </SelectItem>
                  {NUMBER_FORMATS.map((nf) => (
                    <SelectItem key={nf.value} value={nf.value}>
                      <span className="font-mono">{nf.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-8 text-xs w-28 font-mono"
                placeholder="Custom"
                value={
                  fmt.number_format === "__clear__" ? "" : (fmt.number_format ?? "")
                }
                onChange={(e) =>
                  update({ number_format: e.target.value || undefined })
                }
              />
            </div>
          </div>

          {/* Clear all */}
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-destructive hover:text-destructive"
              onClick={() => onChange(null)}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear all formatting
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function ColumnWidthsEditor({
  value,
  onChange,
}: {
  value: Record<string, number> | null | undefined
  onChange: (v: Record<string, number> | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [newCol, setNewCol] = useState("")
  const [newWidth, setNewWidth] = useState("")
  const widths = value ?? {}

  const addWidth = () => {
    if (!newCol || !newWidth) return
    const next = { ...widths, [newCol.toUpperCase()]: Number(newWidth) }
    onChange(next)
    setNewCol("")
    setNewWidth("")
  }

  const removeWidth = (col: string) => {
    const next = { ...widths }
    delete next[col]
    onChange(Object.keys(next).length ? next : null)
  }

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        Column Widths
        {value && Object.keys(value).length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {Object.entries(value)
              .map(([c, w]) => `${c}:${w}`)
              .join(", ")}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 border-t pt-3 space-y-2">
          {Object.keys(widths).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(widths).map(([col, w]) => (
                <span
                  key={col}
                  className="inline-flex items-center gap-1 text-xs bg-muted rounded-md px-2 py-1 font-mono"
                >
                  {col}={w}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive ml-0.5"
                    onClick={() => removeWidth(col)}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">Column</Label>
              <Input
                className="h-8 w-16 text-xs font-mono"
                placeholder="A"
                maxLength={3}
                value={newCol}
                onChange={(e) => setNewCol(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addWidth()
                  }
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Width</Label>
              <Input
                className="h-8 w-20 text-xs"
                type="number"
                min={1}
                placeholder="15"
                value={newWidth}
                onChange={(e) => setNewWidth(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addWidth()
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={addWidth}
              disabled={!newCol || !newWidth}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function FormatConfigEditor({
  value,
  onChange,
  defaultOpen,
}: {
  value: FormatConfig | null | undefined
  onChange: (v: FormatConfig | null) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const fmt = value || {}

  const update = (patch: Partial<FormatConfig>) => {
    const next = { ...fmt, ...patch }
    const isEmpty = !next.header && !next.data && !next.column_widths && !next.auto_fit && !next.wrap_text
    onChange(isEmpty ? null : next)
  }

  const configured = !!(value?.header || value?.data || value?.column_widths || value?.auto_fit || value?.wrap_text)

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Format Config
        {configured && (
          <span className="text-xs font-normal bg-primary/10 text-primary px-1.5 py-0.5 rounded">
            configured
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-3 ml-6">
          {/* Quick options */}
          <div className="flex items-center gap-6 border rounded-md px-3 py-2.5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={fmt.auto_fit ?? false}
                onCheckedChange={(c) => update({ auto_fit: c === true || undefined })}
              />
              Auto-fit column widths
            </label>
            {fmt.auto_fit && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Max width</Label>
                <Input
                  className="h-7 w-16 text-xs"
                  type="number"
                  min={10}
                  max={200}
                  value={fmt.auto_fit_max_width ?? 50}
                  onChange={(e) => update({ auto_fit_max_width: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={fmt.wrap_text ?? false}
                onCheckedChange={(c) => update({ wrap_text: c === true || undefined })}
              />
              Wrap text
            </label>
          </div>

          <CellFormatSection
            label="Header Format"
            value={fmt.header}
            onChange={(v) => update({ header: v })}
          />
          <CellFormatSection
            label="Data Format"
            value={fmt.data}
            onChange={(v) => update({ data: v })}
          />
          <ColumnWidthsEditor
            value={fmt.column_widths}
            onChange={(v) => update({ column_widths: v })}
          />
          {configured && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-destructive hover:text-destructive"
              onClick={() => onChange(null)}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear all format config
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
