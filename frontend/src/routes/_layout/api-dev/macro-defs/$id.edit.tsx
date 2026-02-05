import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import ApiContentEditor from "@/components/ApiDev/ApiContentEditor"
import { MacroDefsService, type ApiMacroDefUpdate } from "@/services/macro-defs"
import { ModulesService } from "@/services/modules"
import useCustomToast from "@/hooks/useCustomToast"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(128),
  module_id: z.string().uuid().optional().nullable(),
  macro_type: z.enum(["JINJA", "PYTHON"]),
  content: z.string().min(1, "Content is required"),
  description: z.string().max(512).optional().nullable(),
  sort_order: z.number().int().min(0).default(0),
})

type FormValues = z.infer<typeof formSchema>

export const Route = createFileRoute("/_layout/api-dev/macro-defs/$id/edit")({
  component: MacroEdit,
  head: () => ({
    meta: [
      {
        title: "Edit macro definition",
      },
    ],
  }),
})

function MacroEdit() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: macro, isLoading } = useQuery({
    queryKey: ["macro", id],
    queryFn: () => MacroDefsService.get(id),
  })

  const { data: modules } = useQuery({
    queryKey: ["modules-simple"],
    queryFn: () => ModulesService.listSimple(),
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    values: macro
      ? {
          name: macro.name,
          module_id: macro.module_id ?? null,
          macro_type: macro.macro_type,
          content: macro.content,
          description: macro.description ?? null,
          sort_order: macro.sort_order,
        }
      : undefined,
  })

  const macroType = form.watch("macro_type")
  const moduleId = form.watch("module_id") ?? macro?.module_id ?? null
  const { data: macroDefsData } = useQuery({
    queryKey: ["macro-defs-in-scope", moduleId],
    queryFn: () => MacroDefsService.listSimple(moduleId || undefined),
    enabled: true,
  })
  const macroDefsForEditor = (macroDefsData ?? []).filter((m) => m.id !== id)

  const updateMutation = useMutation({
    mutationFn: (data: ApiMacroDefUpdate) => MacroDefsService.update(data),
    onSuccess: (data) => {
      showSuccessToast("Macro definition updated successfully")
      navigate({ to: "/api-dev/macro-defs/$id", params: { id: data.id } })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate({
      id,
      name: values.name,
      module_id: values.module_id || null,
      macro_type: values.macro_type,
      content: values.content,
      description: values.description || null,
      sort_order: values.sort_order,
    })
  }

  if (isLoading || !macro) {
    return (
      <div className="flex flex-col gap-6">
        <div>Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit macro definition</h1>
        <p className="text-muted-foreground mt-1">
          Update {macro.name}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Macro definition configuration</CardTitle>
              <CardDescription>
                Define reusable logic for SQL (Jinja) or Script (Python) APIs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="paginate" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="module_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Module (optional)</FormLabel>
                    <Select
                      value={field.value ?? "global"}
                      onValueChange={(v) =>
                        field.onChange(v === "global" ? null : v)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Global (all APIs)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="global">Global (all APIs)</SelectItem>
                        {modules?.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="macro_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="JINJA">Jinja (SQL templates)</SelectItem>
                        <SelectItem value="PYTHON">Python (Script APIs)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Optional description"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content *</FormLabel>
                    <FormDescription>
                      {macroType === "JINJA"
                        ? "Jinja macro definition"
                        : "Python function definitions (http, db, cache, req)"}
                    </FormDescription>
                    <FormControl>
                      <div className="rounded-md border overflow-hidden mt-2">
                        <ApiContentEditor
                          executeEngine={
                            macroType === "JINJA" ? "SQL" : "SCRIPT"
                          }
                          value={field.value}
                          onChange={field.onChange}
                          macroDefs={macroDefsForEditor}
                          height={200}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/api-dev/macro-defs/$id", params: { id } })}
            >
              Cancel
            </Button>
            <LoadingButton type="submit" loading={updateMutation.isPending}>
              Save Changes
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
