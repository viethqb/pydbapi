import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { BucketSelect } from "@/components/ReportManagement/BucketSelect"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
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
import { DataSourceService } from "@/services/datasource"
import { ReportModuleService, type ReportModuleUpdate } from "@/services/report"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(512).optional().nullable(),
  minio_datasource_id: z.string().min(1, "MinIO datasource is required"),
  sql_datasource_id: z.string().min(1, "SQL datasource is required"),
  default_template_bucket: z
    .string()
    .min(1, "Default template bucket is required")
    .max(255),
  default_output_bucket: z
    .string()
    .min(1, "Default output bucket is required")
    .max(255),
  is_active: z.boolean().default(true),
})

type FormValues = z.infer<typeof formSchema>

export const Route = createFileRoute(
  "/_layout/report-management/modules/$id/edit",
)({
  component: EditReportModulePage,
  head: () => ({
    meta: [{ title: "Edit Module - Report Management" }],
  }),
})

function EditReportModulePage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: module, isLoading } = useQuery({
    queryKey: ["report-module", id],
    queryFn: () => ReportModuleService.get(id),
  })

  const { data: dsData } = useQuery({
    queryKey: ["datasources-all"],
    queryFn: () => DataSourceService.list({ page: 1, page_size: 100 }),
  })

  const minioDatasources =
    dsData?.data.filter((ds) => (ds.product_type as string) === "minio") || []
  const sqlDatasources =
    dsData?.data.filter((ds) => (ds.product_type as string) !== "minio") || []

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      description: null,
      minio_datasource_id: "",
      sql_datasource_id: "",
      default_template_bucket: "",
      default_output_bucket: "",
      is_active: true,
    },
  })

  useEffect(() => {
    if (module) {
      form.reset({
        name: module.name,
        description: module.description || null,
        minio_datasource_id: module.minio_datasource_id,
        sql_datasource_id: module.sql_datasource_id,
        default_template_bucket: module.default_template_bucket || "",
        default_output_bucket: module.default_output_bucket || "",
        is_active: module.is_active,
      })
    }
  }, [module, form])

  const updateMutation = useMutation({
    mutationFn: (data: ReportModuleUpdate) => ReportModuleService.update(data),
    onSuccess: () => {
      showSuccessToast("Module updated successfully")
      queryClient.invalidateQueries({ queryKey: ["report-module", id] })
      queryClient.invalidateQueries({ queryKey: ["report-modules"] })
      navigate({ to: "/report-management/modules/$id", params: { id } })
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate({
      id,
      name: values.name,
      description: values.description || null,
      minio_datasource_id: values.minio_datasource_id,
      sql_datasource_id: values.sql_datasource_id,
      default_template_bucket: values.default_template_bucket,
      default_output_bucket: values.default_output_bucket,
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
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-muted-foreground">Module not found</p>
        <Link to="/report-management/modules">
          <Button variant="outline">Back to Modules</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link to="/report-management/modules/$id" params={{ id }}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Module</h1>
          <p className="text-muted-foreground">
            Update module datasources and default buckets
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Module Configuration</CardTitle>
              <CardDescription>
                Update the module settings, datasources and default buckets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead className="w-[200px]">Name *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="Module name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Description</TableHead>
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
                                onChange={(e) =>
                                  field.onChange(e.target.value || null)
                                }
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
                    <TableHead>MinIO Datasource *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="minio_datasource_id"
                        render={({ field }) => (
                          <FormItem>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select MinIO datasource" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {minioDatasources.map((ds) => (
                                  <SelectItem key={ds.id} value={ds.id}>
                                    {ds.name}
                                  </SelectItem>
                                ))}
                                {minioDatasources.length === 0 && (
                                  <SelectItem value="_none" disabled>
                                    No MinIO datasources available
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>SQL Datasource *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="sql_datasource_id"
                        render={({ field }) => (
                          <FormItem>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select SQL datasource" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {sqlDatasources.map((ds) => (
                                  <SelectItem key={ds.id} value={ds.id}>
                                    {ds.name} ({ds.product_type})
                                  </SelectItem>
                                ))}
                                {sqlDatasources.length === 0 && (
                                  <SelectItem value="_none" disabled>
                                    No SQL datasources available
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Default Template Bucket *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="default_template_bucket"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <BucketSelect
                                datasourceId={
                                  form.watch("minio_datasource_id") || undefined
                                }
                                value={field.value ?? ""}
                                onChange={field.onChange}
                                placeholder="Select template bucket"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Default Output Bucket *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="default_output_bucket"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <BucketSelect
                                datasourceId={
                                  form.watch("minio_datasource_id") || undefined
                                }
                                value={field.value ?? ""}
                                onChange={field.onChange}
                                placeholder="Select output bucket"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Active</TableHead>
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
            <Link to="/report-management/modules/$id" params={{ id }}>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </Link>
            <LoadingButton type="submit" loading={updateMutation.isPending}>
              Update Module
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
