import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useEffect } from "react"
import { ArrowLeft } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import { LoadingButton } from "@/components/ui/loading-button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import {
  ModulesService,
  type ApiModuleUpdate,
} from "@/services/modules"
import useCustomToast from "@/hooks/useCustomToast"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(512).optional().nullable(),
  path_prefix: z.string().max(255).default("/"),
  is_active: z.boolean().default(true),
})

type FormValues = z.infer<typeof formSchema>

export const Route = createFileRoute("/_layout/api-dev/modules/$id/edit")({
  component: ModuleEdit,
  head: () => ({
    meta: [
      {
        title: "Edit Module",
      },
    ],
  }),
})

function ModuleEdit() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  console.log("ModuleEdit component loaded, id:", id)

  // Fetch module detail
  const { data: module, isLoading } = useQuery({
    queryKey: ["module", id],
    queryFn: () => ModulesService.get(id),
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: null,
      path_prefix: "/",
      is_active: true,
    },
  })

  // Populate form when data loads
  useEffect(() => {
    if (module) {
      console.log("Resetting form with module data:", module)
      form.reset({
        name: module.name,
        description: module.description || null,
        path_prefix: module.path_prefix,
        is_active: module.is_active,
      })
    }
  }, [module, form])

  const updateMutation = useMutation({
    mutationFn: (data: ApiModuleUpdate) => ModulesService.update(data),
    onSuccess: () => {
      showSuccessToast("Module updated successfully")
      queryClient.invalidateQueries({ queryKey: ["module", id] })
      queryClient.invalidateQueries({ queryKey: ["modules"] })
      navigate({ to: "/api-dev/modules/$id", params: { id } })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate({
      id: id,
      name: values.name,
      description: values.description || null,
      path_prefix: values.path_prefix,
      is_active: values.is_active,
    })
  }

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading...</div>
    )
  }

  if (!module) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Module not found</p>
        <Link to="/api-dev/modules">
          <Button variant="outline" className="mt-4">
            Back to List
          </Button>
        </Link>
      </div>
    )
  }

  console.log("Rendering form, module:", module, "form values:", form.getValues())

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to="/api-dev/modules/$id" params={{ id }}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Module</h1>
          <p className="text-muted-foreground mt-1">Update API module settings</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Module Configuration</CardTitle>
              <CardDescription>Configure the module settings</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead className="w-[180px]">Name *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="My Module" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Path Prefix</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="path_prefix"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="/api/v1" {...field} />
                            </FormControl>
                            <FormDescription>
                              URL prefix for all APIs in this module
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Description</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Textarea
                                placeholder="Optional description"
                                {...field}
                                value={field.value || ""}
                                onChange={(e) => field.onChange(e.target.value || null)}
                                className="min-h-[80px]"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Active</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="is_active"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Enable this module for use</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-4">
            <LoadingButton
              type="submit"
              loading={updateMutation.isPending}
            >
              Update Module
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
