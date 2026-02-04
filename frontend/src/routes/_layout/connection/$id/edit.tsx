import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2, ArrowLeft, Play } from "lucide-react"
import { useEffect, useState } from "react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { LoadingButton } from "@/components/ui/loading-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import {
  DataSourceService,
  type DataSourceUpdate,
} from "@/services/datasource"
import useCustomToast from "@/hooks/useCustomToast"

const formSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(255),
    product_type: z.enum(["postgres", "mysql", "trino"]),
    host: z.string().min(1, "Host is required").max(255),
    port: z.number().int().min(1).max(65535),
    database: z.string().min(1, "Database is required").max(255),
    username: z.string().min(1, "Username is required").max(255),
    password: z.string().max(512).optional(),
    clear_password: z.boolean().optional().default(false),
    use_ssl: z.boolean().default(false),
    description: z.string().max(512).optional().nullable(),
    is_active: z.boolean().default(true),
    close_connection_after_execute: z.boolean().default(false),
  })
  .refine(
    (data) => {
      if (data.product_type === "trino" && data.use_ssl) {
        return !!data.password?.trim()
      }
      return true
    },
    { message: "Password is required for Trino when using SSL/HTTPS", path: ["password"] }
  )

type FormValues = z.infer<typeof formSchema>

export const Route = createFileRoute("/_layout/connection/$id/edit")({
  component: ConnectionEdit,
  head: () => ({
    meta: [
      {
        title: "Edit DataSource",
      },
    ],
  }),
})

function ConnectionEdit() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [testConnectionSuccess, setTestConnectionSuccess] = useState(false)

  console.log("ConnectionEdit component loaded, id:", id)

  // Load existing data
  const { data: datasource, isLoading } = useQuery({
    queryKey: ["datasource", id],
    queryFn: () => DataSourceService.get(id),
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      product_type: "postgres",
      host: "",
      port: 5432,
      database: "",
      username: "",
      password: "",
      description: null,
      is_active: true,
      close_connection_after_execute: false,
      clear_password: false,
      use_ssl: false,
    },
  })

  // Reset form when datasource loads
  useEffect(() => {
    if (datasource) {
      // Ensure product_type is a string (handle enum objects)
      const productType = typeof datasource.product_type === 'string' 
        ? datasource.product_type 
        : (datasource.product_type as any)?.value || datasource.product_type
      
      form.reset({
        name: datasource.name,
        product_type: productType as "postgres" | "mysql" | "trino",
        host: datasource.host,
        port: datasource.port,
        database: datasource.database,
        username: datasource.username,
        password: "",
        clear_password: false,
        use_ssl: !!datasource.use_ssl,
        description: datasource.description || null,
        is_active: datasource.is_active,
        close_connection_after_execute: datasource.close_connection_after_execute ?? false,
      })
      setTestConnectionSuccess(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasource])

  // Reset test result when form values change
  useEffect(() => {
    const subscription = form.watch(() => {
      setTestConnectionSuccess(false)
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  const updateMutation = useMutation({
    mutationFn: (data: DataSourceUpdate) => DataSourceService.update(data),
    onSuccess: () => {
      showSuccessToast("DataSource updated successfully")
      queryClient.invalidateQueries({ queryKey: ["datasource", id] })
      queryClient.invalidateQueries({ queryKey: ["datasources"] })
      navigate({ to: "/connection/$id", params: { id } })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const testMutation = useMutation({
    mutationFn: (data: FormValues) =>
      DataSourceService.preTest({
        product_type: data.product_type,
        host: data.host,
        port: data.port,
        database: data.database,
        username: data.username,
        password: data.password || "",
        use_ssl: data.use_ssl,
      }),
    onSuccess: (result) => {
      if (result.ok) {
        setTestConnectionSuccess(true)
        showSuccessToast(result.message)
      } else {
        setTestConnectionSuccess(false)
        showErrorToast(result.message)
      }
    },
    onError: (error: Error) => {
      setTestConnectionSuccess(false)
      showErrorToast(error.message)
    },
  })

  const onSubmit = (values: FormValues) => {
    // Require test if password is provided (user wants to change password)
    // If no password is provided, backend will use existing password, so test is not required
    const hasPassword = !!values.password
    
    // Require test if password is provided
    if (hasPassword && !testConnectionSuccess) {
      showErrorToast("Please test connection successfully before saving")
      return
    }
    
    const updateData: DataSourceUpdate = {
      id,
      name: values.name,
      product_type: values.product_type,
      host: values.host,
      port: values.port,
      database: values.database,
      username: values.username,
      ...(values.clear_password
        ? { password: "" }
        : values.password
          ? { password: values.password }
          : {}),
      description: values.description,
      is_active: values.is_active,
      close_connection_after_execute: values.close_connection_after_execute,
      use_ssl: values.use_ssl,
    }
    updateMutation.mutate(updateData)
  }

  const handleTest = () => {
    const values = form.getValues()
    testMutation.mutate(values)
  }

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading...</div>
    )
  }

  if (!datasource) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">DataSource not found</p>
        <Link to="/connection">
          <Button variant="outline" className="mt-4">
            Back to List
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to="/connection/$id" params={{ id }}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Data Source</h1>
          <p className="text-muted-foreground mt-1">Update database connection settings</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Connection Configuration</CardTitle>
              <CardDescription>Configure the database connection settings</CardDescription>
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
                              <Input placeholder="My Database" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Database Type *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="product_type"
                        render={({ field }) => (
                          <FormItem>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || ""}
                              key={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="postgres">PostgreSQL</SelectItem>
                                <SelectItem value="mysql">MySQL</SelectItem>
                                <SelectItem value="trino">Trino</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  {form.watch("product_type") === "trino" && (
                    <TableRow>
                      <TableHead className="w-[180px]">Use SSL/HTTPS</TableHead>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name="use_ssl"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal cursor-pointer">
                                Use HTTPS (password required when enabled)
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableHead className="w-[180px]">Host *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="host"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="localhost" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Port *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="port"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="5432"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Database *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="database"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="mydb" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Username *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="postgres" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Password</TableHead>
                    <TableCell className="space-y-3">
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Leave empty to keep current"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="clear_password"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm font-normal cursor-pointer">
                                Set password to empty (clear password)
                              </FormLabel>
                              <FormDescription>
                                Check to update stored password to empty; leave unchecked to keep current or use the value above.
                              </FormDescription>
                            </div>
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
                              <FormLabel>Enable this data source for use</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Close connection after execute</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="close_connection_after_execute"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Close DB connection after each request (e.g. StarRocks impersonation)</FormLabel>
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
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={testMutation.isPending || updateMutation.isPending}
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Test Connection
                </>
              )}
            </Button>
            {testConnectionSuccess && (
              <span className="flex items-center text-sm text-green-600 dark:text-green-400">
                ✓ Connection test successful
              </span>
            )}
            <LoadingButton
              type="submit"
              loading={updateMutation.isPending}
              disabled={testMutation.isPending}
            >
              Update Data Source
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
