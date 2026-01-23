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
import {
  ModulesService,
  type ApiModuleUpdate,
} from "@/services/modules"
import useCustomToast from "@/hooks/useCustomToast"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(512).optional().nullable(),
  path_prefix: z.string().max(255).default("/"),
  sort_order: z.number().int().default(0),
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
      sort_order: 0,
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
        sort_order: module.sort_order,
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
      sort_order: values.sort_order,
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link to="/api-dev/modules/$id" params={{ id }}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Module</h1>
          <p className="text-muted-foreground">Update API module</p>
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
                    <Input placeholder="My Module" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="path_prefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Path Prefix</FormLabel>
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

            <FormField
              control={form.control}
              name="sort_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      value={field.value ?? 0}
                      onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Sort order for displaying modules (lower numbers appear first)
                  </FormDescription>
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
                    Enable this module for use
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <div className="flex gap-4">
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
