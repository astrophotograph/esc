import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { useKeyboardShortcuts, formatShortcut, type KeyboardShortcut } from '../hooks/useKeyboardShortcuts'
import { useUIStore } from '../stores/uiStore'

export function KeyboardHelp() {
  const { showKeyboardHelp, setShowKeyboardHelp } = useUIStore()
  const { shortcuts } = useKeyboardShortcuts()

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce<Record<string, KeyboardShortcut[]>>(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = []
      }
      acc[shortcut.category].push(shortcut)
      return acc
    },
    {}
  )

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    telescope: 'Telescope Control',
    imaging: 'Imaging',
    ui: 'User Interface',
  }

  const categoryOrder = ['navigation', 'ui', 'telescope', 'imaging']

  return (
    <Dialog open={showKeyboardHelp} onOpenChange={setShowKeyboardHelp}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Quick access to common actions. Press <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded border">?</kbd> to show this help.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {categoryOrder.map((category) => {
            const categoryShortcuts = groupedShortcuts[category]
            if (!categoryShortcuts || categoryShortcuts.length === 0) return null

            return (
              <div key={category}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  {categoryLabels[category]}
                </h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div
                      key={`${shortcut.key}-${index}`}
                      className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50"
                    >
                      <span className="text-sm">{shortcut.description}</span>
                      <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border min-w-[60px] text-center">
                        {formatShortcut(shortcut)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Tip: Arrow key shortcuts require a connected telescope. Hold{' '}
            <kbd className="px-1 py-0.5 text-xs bg-muted rounded border">Shift</kbd>{' '}
            for faster movement.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
