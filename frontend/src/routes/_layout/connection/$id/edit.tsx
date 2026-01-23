import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2, ArrowLeft } from "lucide-react"
import { Link } from "@tanstack/react-router"
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
import {
  DataSourceService,
  type DataSourceUpdate,
} from "@/services/datasource"
import useCustomToast from "@/hooks/useCustomToast"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  product_type: z.enum(["postgres", "mysql"]),
  host: z.string().min(1, "Host is required").max(255),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1, "Database is required").max(255),
  username: z.string().min(1, "Username is required").max(255),
  password: z.string().max(512).optional(),
  driver_version: z.string().max(64).optional().nullable(),
  description: z.string().max(512).optional().nullable(),
  is_active: z.boolean().default(true),
})

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
      driver_version: null,
      description: null,
      is_active: true,
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
        product_type: productType as "postgres" | "mysql",
        host: datasource.host,
        port: datasource.port,
        database: datasource.database,
        username: datasource.username,
        password: "", // Don't prefill password
        driver_version: datasource.driver_version || null,
        description: datasource.description || null,
        is_active: datasource.is_active,
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
        password: data.password || "", // Use current password if not changed
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
    // If connection fields changed but no password, allow saving (backend uses existing password)
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
      ...(values.password ? { password: values.password } : {}),
      driver_version: values.driver_version,
      description: values.description,
      is_active: values.is_active,
    }
    updateMutation.mutate(updateData)
  }

  const handleTest = () => {
    const values = form.getValues()
    // If password is not provided, we need to get it from the original datasource
    // For security, we'll require password to be entered for testing
    if (!values.password) {
      showErrorToast("Please enter password to test connection")
      return
    }
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link to="/connection/$id" params={{ id }}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Data Source</h1>
          <p className="text-muted-foreground">Update database connection</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="My Database" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="product_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Database Type *</FormLabel>
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
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="host"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Host *</FormLabel>
                  <FormControl>
                    <Input placeholder="localhost" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="port"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Port *</FormLabel>
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

            <FormField
              control={form.control}
              name="database"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Database *</FormLabel>
                  <FormControl>
                    <Input placeholder="mydb" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username *</FormLabel>
                  <FormControl>
                    <Input placeholder="postgres" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Leave empty to keep current"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Leave empty to keep current password
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="driver_version"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Driver Version</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="default"
                      {...field}
                      value={field.value || ""}
                      onChange={(e) =>
                        field.onChange(e.target.value || null)
                      }
                    />
                  </FormControl>
                  <FormDescription>Leave empty for default</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Optional description"
                    {...field}
                    value={field.value || ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
                  <FormLabel>Active</FormLabel>
                  <FormDescription>
                    Enable this data source for use
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <div className="flex gap-4">
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
                "Test Connection"
              )}
            </Button>
            {testConnectionSuccess && (
              <span className="flex items-center text-sm text-green-500">
                ✓ Connection test successful
              </span>
            )}
            <LoadingButton
              type="submit"
              loading={updateMutation.isPending}
              disabled={testMutation.isPending || !testConnectionSuccess}
            >
              Update Data Source
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
