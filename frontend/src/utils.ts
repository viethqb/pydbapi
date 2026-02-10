import type { ApiError } from "./client"

type ErrorBody = {
  detail?: string | Array<{ msg: string; loc?: string[] }>
}

function extractErrorMessage(err: ApiError | Error): string {
  // Plain Error (e.g. from our custom request() function)
  if (!(err && "body" in err)) {
    return err?.message || "Something went wrong."
  }

  // ApiError from generated client — body may contain { detail: ... }
  const body = err.body as ErrorBody | undefined
  const detail = body?.detail

  if (typeof detail === "string") {
    return detail
  }
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d) => d.msg).join("; ")
  }

  return err.message || "Something went wrong."
}

/**
 * Universal error handler for mutation `onError` callbacks.
 * Bind a toast function as `this`: `onError: handleError.bind(showErrorToast)`
 */
export const handleError = function (
  this: (msg: string) => void,
  err: ApiError | Error,
) {
  const errorMessage = extractErrorMessage(err)
  this(errorMessage)
}

export const getInitials = (name: string): string => {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
}
