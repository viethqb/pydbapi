import { Check, ChevronDown, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import useCustomToast from "@/hooks/useCustomToast"

type Example = {
  title: string
  description?: string
  code: string
}

function CodeExample({ title, description, code }: Example) {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const [copiedText, copy] = useCopyToClipboard()
  const isCopied = copiedText === code

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{title}</div>
          {description && (
            <div className="text-xs text-muted-foreground">{description}</div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={async () => {
            const ok = await copy(code)
            if (ok) showSuccessToast("Code copied")
            else showErrorToast("Copy failed")
          }}
          title="Copy code"
        >
          {isCopied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>

      <pre className="p-3 bg-muted rounded-md overflow-auto text-sm leading-relaxed font-mono whitespace-pre">
        {code}
      </pre>
    </div>
  )
}

const PARAM_VALIDATE_EXAMPLES: Example[] = [
  {
    title: "Param validate – Always pass",
    description: "Always pass. Can use macro functions.",
    code:
      "def validate(value, params=None):\n" +
      '    """Return True if valid, otherwise False."""\n' +
      "    return True\n",
  },
  {
    title: "Param validate – Numeric range",
    description: "0 ≤ value ≤ 100. Can use macro (e.g. safe_float).",
    code:
      "def validate(value, params=None):\n" +
      "    try:\n" +
      "        n = float(value) if value is not None else None\n" +
      "        if n is None:\n" +
      "            return False\n" +
      "        return 0 <= n <= 100\n" +
      "    except (TypeError, ValueError):\n" +
      "        return False\n",
  },
  {
    title: "Param validate – String length",
    description: "1 ≤ len(str(value)) ≤ 255. Can use macro functions.",
    code:
      "def validate(value, params=None):\n" +
      "    if value is None:\n" +
      "        return False\n" +
      "    s = str(value)\n" +
      "    return 1 <= len(s) <= 255\n",
  },
  {
    title: "Param validate – Regex pattern",
    description: "Value matches ^[a-zA-Z0-9_-]+$. Can use macro (e.g. is_valid_slug).",
    code:
      "import re\n\n" +
      "def validate(value, params=None):\n" +
      "    if value is None or not isinstance(value, str):\n" +
      "        return False\n" +
      "    return bool(re.match(r\"^[a-zA-Z0-9_-]+$\", value))\n",
  },
  {
    title: "Param validate – Use macro helper (is_valid_email)",
    description: "Call is_valid_email from macro_def. Macros auto-prepended.",
    code:
      "def validate(value, params=None):\n" +
      "    # is_valid_email() defined in a Python macro_def\n" +
      "    return is_valid_email(value)\n",
  },
  {
    title: "Param validate – Use other params",
    description: "Value within params.start/end. Can use macro (e.g. safe_range).",
    code:
      "def validate(value, params=None):\n" +
      "    if value is None or params is None:\n" +
      "        return False\n" +
      "    start = params.get(\"start\")\n" +
      "    end = params.get(\"end\")\n" +
      "    try:\n" +
      "        v = float(value)\n" +
      "        if start is not None: v = max(v, float(start))\n" +
      "        if end is not None: v = min(v, float(end))\n" +
      "        return True\n" +
      "    except (TypeError, ValueError):\n" +
      "        return False\n",
  },
]

export default function ParamValidateExamples() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <div className="text-sm font-medium">Validation examples</div>
          <div className="text-xs text-muted-foreground">
            validate(value, params=None) → True/False. Can call functions from macro_def (type Python); macros auto-prepended.
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-4">
          {PARAM_VALIDATE_EXAMPLES.map((ex) => (
            <CodeExample
              key={ex.title}
              title={ex.title}
              description={ex.description}
              code={ex.code}
            />
          ))}
        </div>
      )}
    </div>
  )
}
