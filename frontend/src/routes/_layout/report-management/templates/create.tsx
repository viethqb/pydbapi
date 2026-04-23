import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { FileSelect } from "@/components/ReportManagement/FileSelect"
import { SheetSelect } from "@/components/ReportManagement/SheetSelect"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import useCustomToast from "@/hooks/useCustomToast"
import { ReportModuleService } from "@/services/report"

export const Route = createFileRoute(
  "/_layout/report-management/templates/create",
)({
  component: CreateTemplatePage,
  head: () => ({ meta: [{ title: "Create Template" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    module_id: (search.module_id as string) || "",
  }),
})

function CreateTemplatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { module_id: preselectedModuleId } = Route.useSearch()

  // Fetch modules
  const { data: modulesData } = useQuery({
    queryKey: ["report-modules-simple"],
    queryFn: () => ReportModuleService.list({ page: 1, page_size: 100 }),
  })

  const [form, setForm] = useState({
    module_id: preselectedModuleId || "",
    name: "",
    description: "",
    template_path: "",
    output_prefix: "",
    recalc_enabled: false,
    output_sheet: "",
  })

  const selectedModule = (modulesData?.data ?? []).find((m) => m.id === form.module_id)
  const minioDsId = selectedModule?.minio_datasource_id

  const createMutation = useMutation({
    mutationFn: () =>
      ReportModuleService.createTemplate(form.module_id, {
        name: form.name,
        description: form.description || undefined,
        template_bucket: selectedModule?.default_template_bucket ?? "",
        template_path: form.template_path,
        output_bucket: selectedModule?.default_output_bucket ?? "",
        output_prefix: form.output_prefix,
        recalc_enabled: form.recalc_enabled,
        output_sheet: form.output_sheet || undefined,
      }),
    onSuccess: (result) => {
      showSuccessToast("Template created")
      queryClient.invalidateQueries({ queryKey: ["report-templates-all"] })
      navigate({
        to: "/report-management/templates/$tid",
        params: { tid: result.id },
      })
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: "/report-management/templates" })}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create Report Template</h1>
          <p className="text-muted-foreground">
            Configure a new report template within a module
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template Configuration</CardTitle>
          <CardDescription>
            Select a module and configure the template file and output settings.
            Leave template bucket/path empty for a blank workbook.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableHead className="w-[200px]">Module *</TableHead>
                <TableCell>
                  <Select value={form.module_id} onValueChange={(v) => setForm({ ...form, module_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
                    <SelectContent>
                      {(modulesData?.data ?? []).map((m) => (<SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Name *</TableHead>
                <TableCell>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="monthly-report" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableCell>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Template File</TableHead>
                <TableCell>
                  <FileSelect datasourceId={minioDsId} bucket={selectedModule?.default_template_bucket} value={form.template_path} onChange={(v) => setForm({ ...form, template_path: v })} placeholder="Select .xlsx file (empty = blank)" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Output Prefix</TableHead>
                <TableCell>
                  <Input value={form.output_prefix} onChange={(e) => setForm({ ...form, output_prefix: e.target.value })} placeholder="finance/monthly/" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Output Sheet</TableHead>
                <TableCell>
                  <SheetSelect datasourceId={minioDsId} bucket={selectedModule?.default_template_bucket} filePath={form.template_path || undefined} value={form.output_sheet} onChange={(v) => setForm({ ...form, output_sheet: v, ...(v ? { recalc_enabled: true } : {}) })} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Recalc</TableHead>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={form.recalc_enabled}
                      onCheckedChange={(c) => setForm({ ...form, recalc_enabled: !!c })}
                      disabled={!!form.output_sheet}
                    />
                    <span className="text-sm">
                      LibreOffice Recalc
                      {form.output_sheet && <span className="text-muted-foreground ml-1">(required for Output Sheet)</span>}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() =>
                navigate({ to: "/report-management/templates" })
              }
            >
              Cancel
            </Button>
            <LoadingButton
              loading={createMutation.isPending}
              disabled={!form.module_id || !form.name}
              onClick={() => createMutation.mutate()}
            >
              Create Template
            </LoadingButton>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
