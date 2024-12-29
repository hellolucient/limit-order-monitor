import { useEffect, useRef } from 'react'

export function useAutoRefresh(callback: () => void, enabled = false, interval = 30000) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!enabled) return

    callback() // Initial call
    intervalRef.current = setInterval(callback, interval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [callback, enabled, interval])
}