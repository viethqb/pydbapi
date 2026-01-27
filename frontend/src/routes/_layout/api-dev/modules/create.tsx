import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
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
  type ApiModuleCreate,
} from "@/services/modules"
import useCustomToast from "@/hooks/useCustomToast"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(512).optional().nullable(),
  path_prefix: z.string().max(255).default("/"),
  is_active: z.boolean().default(true),
})

type FormValues = z.infer<typeof formSchema>

export const Route = createFileRoute("/_layout/api-dev/modules/create")({
  component: ModuleCreate,
  head: () => ({
    meta: [
      {
        title: "Create Module",
      },
    ],
  }),
})

function ModuleCreate() {
  const navigate = useNavigate()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      description: null,
      path_prefix: "/",
      is_active: true,
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: ApiModuleCreate) => ModulesService.create(data),
    onSuccess: (data) => {
      showSuccessToast("Module created successfully")
      navigate({ to: "/api-dev/modules/$id", params: { id: data.id } })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({
      name: values.name,
      description: values.description || null,
      path_prefix: values.path_prefix,
      is_active: values.is_active,
    })
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Module</h1>
        <p className="text-muted-foreground mt-1">Create a new API module</p>
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
              loading={createMutation.isPending}
            >
              Create Module
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
