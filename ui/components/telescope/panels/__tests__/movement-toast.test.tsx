import { renderHook, act } from '@testing-library/react'
import { useMovementToast } from '@/hooks/use-movement-toast'
import { toast } from 'sonner'

jest.mock('sonner', () => ({
  toast: {
    info: jest.fn(),
    dismiss: jest.fn(),
  },
}))

describe('useMovementToast', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('should create a new toast when showing movement', () => {
    const { result } = renderHook(() => useMovementToast())

    act(() => {
      result.current.showMovementToast('north')
    })

    expect(toast.info).toHaveBeenCalledWith('Telescope Movement', {
      description: 'Moving telescope north',
      duration: Infinity,
    })
  })

  it('should update existing toast when direction changes', () => {
    const mockToastId = 'toast-123'
    ;(toast.info as jest.Mock).mockReturnValue(mockToastId)

    const { result } = renderHook(() => useMovementToast())

    act(() => {
      result.current.showMovementToast('north')
    })

    act(() => {
      jest.advanceTimersByTime(150) // Past debounce
      result.current.showMovementToast('south')
    })

    expect(toast.info).toHaveBeenCalledTimes(2)
    expect(toast.info).toHaveBeenLastCalledWith('Telescope Movement', {
      id: mockToastId,
      description: 'Moving telescope south',
      duration: Infinity,
    })
  })

  it('should auto-dismiss toast after stop with fade out delay', () => {
    const mockToastId = 'toast-123'
    ;(toast.info as jest.Mock).mockReturnValue(mockToastId)

    const { result } = renderHook(() => useMovementToast({ fadeOutDelay: 1000 }))

    act(() => {
      result.current.showMovementToast('north')
    })

    act(() => {
      jest.advanceTimersByTime(150)
      result.current.showMovementToast('stop')
    })

    expect(toast.dismiss).not.toHaveBeenCalled()

    act(() => {
      jest.advanceTimersByTime(1000) // Fade out delay
    })

    expect(toast.dismiss).toHaveBeenCalledWith(mockToastId)
  })

  it('should not show stop message during debounce period', () => {
    const { result } = renderHook(() => useMovementToast({ updateDebounce: 200 }))

    act(() => {
      result.current.showMovementToast('north')
    })

    // Try to show stop within debounce period
    act(() => {
      jest.advanceTimersByTime(50)
      result.current.showMovementToast('stop')
    })

    expect(toast.info).toHaveBeenCalledTimes(1) // Only initial call
  })

  it('should dismiss toast when dismissMovementToast is called', () => {
    const mockToastId = 'toast-123'
    ;(toast.info as jest.Mock).mockReturnValue(mockToastId)

    const { result } = renderHook(() => useMovementToast())

    act(() => {
      result.current.showMovementToast('north')
    })

    act(() => {
      result.current.dismissMovementToast()
    })

    expect(toast.dismiss).toHaveBeenCalledWith(mockToastId)
  })
})