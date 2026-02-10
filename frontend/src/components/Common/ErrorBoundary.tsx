import { Component, type ErrorInfo, type ReactNode } from "react"

import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional fallback to render instead of the default alert. */
  fallback?: ReactNode
  /** Section label shown in the error message (e.g. "Dashboard", "Data Table"). */
  section?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * React Error Boundary that catches render errors in its subtree
 * and displays a recoverable alert instead of crashing the whole page.
 *
 * Usage:
 *   <ErrorBoundary section="Dashboard Charts">
 *     <DashboardCharts ... />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary${this.props.section ? ` / ${this.props.section}` : ""}]`,
      error,
      info.componentStack,
    )
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const label = this.props.section ?? "This section"

      return (
        <Alert variant="destructive" className="my-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{label} failed to load</AlertTitle>
          <AlertDescription className="flex items-center gap-3 mt-1">
            <span className="text-sm">
              {this.state.error?.message || "An unexpected error occurred."}
            </span>
            <Button variant="outline" size="sm" onClick={this.handleRetry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
