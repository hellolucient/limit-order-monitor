export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return `${diffInSeconds}s ago`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  return `${Math.floor(diffInSeconds / 86400)}d ago`
}

export function formatPrice(value: number | null): string {
  if (value === null) return 'N/A'
  if (!isFinite(value)) return 'N/A'
  // For very small numbers (less than 0.000001), show more decimal places
  if (value > 0 && value < 0.000001) {
    return value.toLocaleString('en-US', { minimumFractionDigits: 12, maximumFractionDigits: 12 })
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
} 