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
  GroupsService,
  type ApiGroupCreate,
  type ApiGroupUpdate,
  type ApiGroupPublic,
} from "@/services/groups"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(512).optional().nullable(),
  is_active: z.boolean().default(true),
})

type FormValues = z.infer<typeof formSchema>

interface GroupFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: ApiGroupPublic | null
}

export function GroupFormDialog({
  open,
  onOpenChange,
  group,
}: GroupFormDialogProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const isEdit = !!group

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      description: null,
      is_active: true,
    },
  })

  useEffect(() => {
    if (group && open) {
      form.reset({
        name: group.name,
        description: group.description,
        is_active: group.is_active,
      })
    } else if (!group && open) {
      form.reset({
        name: "",
        description: null,
        is_active: true,
      })
    }
  }, [group, open, form])

  const createMutation = useMutation({
    mutationFn: (data: ApiGroupCreate) => GroupsService.create(data),
    onSuccess: () => {
      showSuccessToast("Group created successfully")
      form.reset()
      onOpenChange(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: ApiGroupUpdate) => GroupsService.update(data),
    onSuccess: () => {
      showSuccessToast("Group updated successfully")
      onOpenChange(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] })
    },
  })

  const onSubmit = (data: FormValues) => {
    if (isEdit) {
      updateMutation.mutate({
        id: group.id,
        ...data,
      })
    } else {
      createMutation.mutate(data)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Group" : "Create Group"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the group information below."
              : "Fill in the form below to create a new group."}
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
                      <Input placeholder="Group name" {...field} required />
                    </FormControl>
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
                      <Textarea
                        placeholder="Group description"
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
