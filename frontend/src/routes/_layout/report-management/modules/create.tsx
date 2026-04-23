import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
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
import { type ReportModuleCreate, ReportModuleService } from "@/services/report"

const createFormSchema = z.object({
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
})

type CreateFormValues = z.infer<typeof createFormSchema>

export const Route = createFileRoute(
  "/_layout/report-management/modules/create",
)({
  component: CreateReportModulePage,
  head: () => ({
    meta: [{ title: "Create Module - Report Management" }],
  }),
})

function CreateReportModulePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Fetch all datasources for dropdowns
  const { data: dsData } = useQuery({
    queryKey: ["datasources-all"],
    queryFn: () => DataSourceService.list({ page: 1, page_size: 100 }),
  })

  const minioDatasources =
    dsData?.data.filter((ds) => (ds.product_type as string) === "minio") || []

  const sqlDatasources =
    dsData?.data.filter((ds) => (ds.product_type as string) !== "minio") || []

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createFormSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      description: null,
      minio_datasource_id: "",
      sql_datasource_id: "",
      default_template_bucket: "",
      default_output_bucket: "",
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: ReportModuleCreate) => ReportModuleService.create(data),
    onSuccess: () => {
      showSuccessToast("Report module created successfully")
      form.reset()
      queryClient.invalidateQueries({ queryKey: ["report-modules"] })
      navigate({ to: "/report-management/modules" })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const onSubmit = (data: CreateFormValues) => {
    createMutation.mutate({
      name: data.name,
      description: data.description,
      minio_datasource_id: data.minio_datasource_id,
      sql_datasource_id: data.sql_datasource_id,
      default_template_bucket: data.default_template_bucket,
      default_output_bucket: data.default_output_bucket,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link to="/report-management/modules">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Create Report Module</h1>
          <p className="text-muted-foreground">
            Configure a new report module with datasource connections
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Module Configuration</CardTitle>
              <CardDescription>
                Set up the report module with MinIO and SQL datasource
                connections.
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
                              <Input
                                placeholder="Report module name"
                                {...field}
                              />
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
                                placeholder="Module description"
                                {...field}
                                value={field.value || ""}
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
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-4">
            <LoadingButton type="submit" loading={createMutation.isPending}>
              Create Module
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
