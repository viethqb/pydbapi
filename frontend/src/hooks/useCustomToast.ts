import { toast } from "sonner"

const useCustomToast = () => {
  const showSuccessToast = (description: string) => {
    toast.success("Success!", {
      description,
    })
  }

  const showErrorToast = (description: string, title?: string) => {
    toast.error(title || "Something went wrong!", {
      description,
    })
  }

  const showInfoToast = (description: string, title?: string) => {
    toast.info(title || "Info", {
      description,
    })
  }

  return { showSuccessToast, showErrorToast, showInfoToast }
}

export default useCustomToast
