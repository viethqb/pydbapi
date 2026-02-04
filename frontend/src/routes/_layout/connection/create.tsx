import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2, Play } from "lucide-react"
import { useState, useEffect } from "react"

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
  type DataSourceCreate,
} from "@/services/datasource"
import useCustomToast from "@/hooks/useCustomToast"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  product_type: z.enum(["postgres", "mysql"]),
  host: z.string().min(1, "Host is required").max(255),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1, "Database is required").max(255),
  username: z.string().min(1, "Username is required").max(255),
  password: z.string().min(1, "Password is required").max(512),
  description: z.string().max(512).optional().nullable(),
  is_active: z.boolean().default(true),
  close_connection_after_execute: z.boolean().default(false),
})

type FormValues = z.infer<typeof formSchema>

export const Route = createFileRoute("/_layout/connection/create")({
  component: ConnectionCreate,
  head: () => ({
    meta: [
      {
        title: "Create DataSource",
      },
    ],
  }),
})

function ConnectionCreate() {
  const navigate = useNavigate()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [testConnectionSuccess, setTestConnectionSuccess] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
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
    },
  })

  // Reset test result when form values change
  useEffect(() => {
    const subscription = form.watch(() => {
      setTestConnectionSuccess(false)
    })
    return () => subscription.unsubscribe()
  }, [form])

  const createMutation = useMutation({
    mutationFn: (data: DataSourceCreate) => DataSourceService.create(data),
    onSuccess: (data) => {
      showSuccessToast("DataSource created successfully")
      navigate({ to: "/connection/$id", params: { id: data.id } })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const testMutation = useMutation({
    mutationFn: (data: DataSourceCreate) =>
      DataSourceService.preTest({
        product_type: data.product_type,
        host: data.host,
        port: data.port,
        database: data.database,
        username: data.username,
        password: data.password,
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
    if (!testConnectionSuccess) {
      showErrorToast("Please test connection successfully before saving")
      return
    }
    createMutation.mutate({
      ...values,
      close_connection_after_execute: values.close_connection_after_execute,
    })
  }

  const handleTest = () => {
    const values = form.getValues()
    testMutation.mutate(values)
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Data Source</h1>
        <p className="text-muted-foreground mt-1">Add a new database connection</p>
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
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="postgres">PostgreSQL</SelectItem>
                                <SelectItem value="mysql">MySQL</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
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
                    <TableHead className="w-[180px]">Password *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} />
                            </FormControl>
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
              disabled={testMutation.isPending || createMutation.isPending}
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
              loading={createMutation.isPending}
              disabled={testMutation.isPending || !testConnectionSuccess}
            >
              Create Data Source
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
