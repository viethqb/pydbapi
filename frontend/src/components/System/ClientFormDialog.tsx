import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  ClientsService,
  type AppClientCreate,
  type AppClientUpdate,
  type AppClientPublic,
} from "@/services/clients"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  client_secret: z
    .string()
    .min(8, "Secret must be at least 8 characters")
    .max(512)
    .optional(),
  description: z.string().max(512).optional().nullable(),
  is_active: z.boolean().default(true),
})

type FormValues = z.infer<typeof formSchema>

interface ClientFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client?: AppClientPublic | null
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: ClientFormDialogProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const isEdit = !!client

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      client_secret: "",
      description: null,
      is_active: true,
    },
  })

  useEffect(() => {
    if (client && open) {
      form.reset({
        name: client.name,
        client_secret: "", // Don't populate secret on edit
        description: client.description,
        is_active: client.is_active,
      })
    } else if (!client && open) {
      form.reset({
        name: "",
        client_secret: "",
        description: null,
        is_active: true,
      })
    }
  }, [client, open, form])

  const createMutation = useMutation({
    mutationFn: (data: AppClientCreate) => ClientsService.create(data),
    onSuccess: () => {
      showSuccessToast("Client created successfully")
      form.reset()
      onOpenChange(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: AppClientUpdate) => ClientsService.update(data),
    onSuccess: () => {
      showSuccessToast("Client updated successfully")
      onOpenChange(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] })
    },
  })

  const onSubmit = (data: FormValues) => {
    if (isEdit) {
      updateMutation.mutate({
        id: client.id,
        name: data.name,
        description: data.description,
        is_active: data.is_active,
      })
    } else {
      if (!data.client_secret) {
        showErrorToast("Client secret is required")
        return
      }
      createMutation.mutate({
        name: data.name,
        client_secret: data.client_secret,
        description: data.description,
        is_active: data.is_active,
      })
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Client" : "Create Client"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the client information below. Note: Client secret cannot be changed here. Use 'Regenerate Secret' to create a new one."
              : "Fill in the form below to create a new client. A client_id will be automatically generated."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Client name" {...field} required />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isEdit && (
                <FormField
                  control={form.control}
                  name="client_secret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Client Secret <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter client secret (min 8 characters)"
                          {...field}
                          required
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Client description"
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
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">Active</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <LoadingButton
                type="submit"
                loading={isLoading}
                disabled={isLoading}
              >
                {isEdit ? "Update" : "Create"}
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
