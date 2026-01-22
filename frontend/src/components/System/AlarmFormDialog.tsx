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
  AlarmService,
  type UnifyAlarmCreate,
  type UnifyAlarmUpdate,
  type UnifyAlarmPublic,
} from "@/services/alarm"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  alarm_type: z.string().min(1, "Alarm type is required").max(64),
  config: z.string().min(1, "Config is required"),
  is_enabled: z.boolean().default(true),
})

type FormValues = z.infer<typeof formSchema>

interface AlarmFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alarm?: UnifyAlarmPublic | null
}

export function AlarmFormDialog({
  open,
  onOpenChange,
  alarm,
}: AlarmFormDialogProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const isEdit = !!alarm

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      alarm_type: "",
      config: "{}",
      is_enabled: true,
    },
  })

  useEffect(() => {
    if (alarm && open) {
      form.reset({
        name: alarm.name,
        alarm_type: alarm.alarm_type,
        config: JSON.stringify(alarm.config, null, 2),
        is_enabled: alarm.is_enabled,
      })
    } else if (!alarm && open) {
      form.reset({
        name: "",
        alarm_type: "",
        config: "{}",
        is_enabled: true,
      })
    }
  }, [alarm, open, form])

  const createMutation = useMutation({
    mutationFn: (data: UnifyAlarmCreate) => AlarmService.create(data),
    onSuccess: () => {
      showSuccessToast("Alarm created successfully")
      form.reset()
      onOpenChange(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["alarm"] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: UnifyAlarmUpdate) => AlarmService.update(data),
    onSuccess: () => {
      showSuccessToast("Alarm updated successfully")
      onOpenChange(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["alarm"] })
    },
  })

  const onSubmit = (data: FormValues) => {
    let config: Record<string, any>
    try {
      config = JSON.parse(data.config)
    } catch (error) {
      showErrorToast("Invalid JSON in config field")
      return
    }

    if (isEdit) {
      updateMutation.mutate({
        id: alarm.id,
        name: data.name,
        alarm_type: data.alarm_type,
        config: config,
        is_enabled: data.is_enabled,
      })
    } else {
      createMutation.mutate({
        name: data.name,
        alarm_type: data.alarm_type,
        config: config,
        is_enabled: data.is_enabled,
      })
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Alarm" : "Create Alarm"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the alarm configuration below."
              : "Fill in the form below to create a new alarm configuration."}
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
                      <Input placeholder="Alarm name" {...field} required />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="alarm_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Alarm Type <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., email, webhook, sms"
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
                name="config"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Config (JSON) <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='{"key": "value"}'
                        className="font-mono text-sm"
                        rows={8}
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
                name="is_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">Enabled</FormLabel>
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
