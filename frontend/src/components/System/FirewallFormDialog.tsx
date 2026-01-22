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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  FirewallService,
  type FirewallRuleCreate,
  type FirewallRuleUpdate,
  type FirewallRulePublic,
  type FirewallRuleTypeEnum,
} from "@/services/firewall"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const formSchema = z.object({
  rule_type: z.enum(["allow", "deny"]),
  ip_range: z.string().min(1, "IP range is required").max(128),
  description: z.string().max(512).optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
})

type FormValues = z.infer<typeof formSchema>

interface FirewallFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: FirewallRulePublic | null
}

export function FirewallFormDialog({
  open,
  onOpenChange,
  rule,
}: FirewallFormDialogProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const isEdit = !!rule

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      rule_type: "allow",
      ip_range: "",
      description: null,
      is_active: true,
      sort_order: 0,
    },
  })

  useEffect(() => {
    if (rule && open) {
      form.reset({
        rule_type: rule.rule_type,
        ip_range: rule.ip_range,
        description: rule.description,
        is_active: rule.is_active,
        sort_order: rule.sort_order,
      })
    } else if (!rule && open) {
      form.reset({
        rule_type: "allow",
        ip_range: "",
        description: null,
        is_active: true,
        sort_order: 0,
      })
    }
  }, [rule, open, form])

  const createMutation = useMutation({
    mutationFn: (data: FirewallRuleCreate) => FirewallService.create(data),
    onSuccess: () => {
      showSuccessToast("Firewall rule created successfully")
      form.reset()
      onOpenChange(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["firewall"] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: FirewallRuleUpdate) => FirewallService.update(data),
    onSuccess: () => {
      showSuccessToast("Firewall rule updated successfully")
      onOpenChange(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["firewall"] })
    },
  })

  const onSubmit = (data: FormValues) => {
    if (isEdit) {
      updateMutation.mutate({
        id: rule.id,
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
          <DialogTitle>
            {isEdit ? "Edit Firewall Rule" : "Create Firewall Rule"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the firewall rule information below."
              : "Fill in the form below to create a new firewall rule."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="rule_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Rule Type <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={(value) =>
                        field.onChange(value as FirewallRuleTypeEnum)
                      }
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select rule type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="allow">Allow</SelectItem>
                        <SelectItem value="deny">Deny</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ip_range"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      IP Range <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 192.168.1.0/24 or 10.0.0.1"
                        {...field}
                        required
                      />
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
                        placeholder="Rule description"
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
                name="sort_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                        value={field.value}
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
