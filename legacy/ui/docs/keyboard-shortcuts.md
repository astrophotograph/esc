# Keyboard Shortcuts

Complete reference for all keyboard shortcuts to speed up your workflow.

## Quick Reference Card

Press `?` or `Ctrl+/` at any time to display the in-app keyboard shortcut help.

## Navigation

| Shortcut | Action |
|----------|--------|
| `?` or `Ctrl+/` | Show keyboard help |
| `Ctrl+K` or `/` | Open celestial search |
| `Ctrl+P` | Open planning panel |
| `Ctrl+E` | Open equipment manager |
| `Ctrl+S` | Save current session |
| `Tab` | Next control |
| `Shift+Tab` | Previous control |
| `Escape` | Close dialog/panel |

## Telescope Control

### Movement

| Shortcut | Action |
|----------|--------|
| `↑` | Move North (Dec+) |
| `↓` | Move South (Dec-) |
| `←` | Move West (RA-) |
| `→` | Move East (RA+) |
| `Shift+Arrow` | Fast movement (8x) |
| `Ctrl+Arrow` | Fine movement (1x) |
| `Space` | Stop all movement |
| `P` | Park telescope |

### GoTo Operations

| Shortcut | Action |
|----------|--------|
| `G` | Focus GoTo input |
| `Enter` | Execute GoTo |
| `Ctrl+G` | Last GoTo target |
| `Alt+G` | GoTo home position |

### Focus Control

| Shortcut | Action |
|----------|--------|
| `F` | Focus in (near) |
| `G` | Focus out (far) |
| `Shift+F` | Fine focus in |
| `Shift+G` | Fine focus out |
| `Ctrl+F` | Coarse focus in |
| `Ctrl+G` | Coarse focus out |

## Camera Controls

### Basic Settings

| Shortcut | Action |
|----------|--------|
| `[` | Decrease exposure |
| `]` | Increase exposure |
| `{` | Decrease gain |
| `}` | Increase gain |
| `-` | Decrease brightness |
| `=` | Increase brightness |
| `Ctrl+-` | Decrease contrast |
| `Ctrl+=` | Increase contrast |

### View Controls

| Shortcut | Action |
|----------|--------|
| `+` | Zoom in |
| `-` | Zoom out |
| `0` | Reset zoom |
| `F11` | Toggle fullscreen |
| `H` | Toggle histogram |
| `O` | Toggle overlays |
| `A` | Toggle annotations |

## Multi-Telescope

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` | Switch to telescope 1 |
| `Ctrl+2` | Switch to telescope 2 |
| `Ctrl+3` | Switch to telescope 3 |
| `Ctrl+4` | Switch to telescope 4 |
| `Ctrl+Tab` | Next telescope |
| `Ctrl+Shift+Tab` | Previous telescope |

## Session Management

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New session |
| `Ctrl+S` | Save session |
| `Ctrl+O` | Open session |
| `Ctrl+L` | Quick log entry |
| `Ctrl+R` | Rate current object |
| `1-5` | Quick rating (when focused) |

## Equipment Sets

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+E` | Quick equipment switch |
| `Alt+1` | Equipment set 1 |
| `Alt+2` | Equipment set 2 |
| `Alt+3` | Equipment set 3 |
| `Alt+4` | Equipment set 4 |

## Panel Management

| Shortcut | Action |
|----------|--------|
| `F1` | Toggle help |
| `F2` | Toggle stats panel |
| `F3` | Toggle log panel |
| `F4` | Toggle imaging panel |
| `F5` | Refresh connection |
| `F6` | Toggle PIP window |
| `F7` | Toggle starmap |
| `F8` | Toggle annotations |
| `F9` | (Reserved) |
| `F10` | Open settings |

## Planning

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Open planner |
| `Ctrl+W` | Show weather |
| `Ctrl+M` | Show moon info |
| `Ctrl+D` | Today's date |
| `PageUp` | Previous day |
| `PageDown` | Next day |

## Data Management

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Copy coordinates |
| `Ctrl+V` | Paste coordinates |
| `Ctrl+X` | Export data |
| `Ctrl+Z` | Undo last action |
| `Ctrl+Y` | Redo action |

## Advanced Shortcuts

### Developer Mode

| Shortcut | Action |
|----------|--------|
| `F12` | Open developer tools |
| `Ctrl+Shift+I` | Inspect element |
| `Ctrl+Shift+J` | JavaScript console |
| `Ctrl+Shift+D` | Debug mode |

### Custom Shortcuts

You can customize shortcuts in Settings → Keyboard:

```javascript
// Example custom shortcut
customShortcuts = {
  'Ctrl+Alt+M': 'gotoMessierObject',
  'Ctrl+Alt+S': 'startSequence',
  'Ctrl+Alt+P': 'platesSolve'
}
```

## Context-Sensitive Shortcuts

### In Dialogs

| Shortcut | Action |
|----------|--------|
| `Enter` | Confirm/OK |
| `Escape` | Cancel/Close |
| `Tab` | Next field |
| `Shift+Tab` | Previous field |

### In Lists

| Shortcut | Action |
|----------|--------|
| `↑/↓` | Navigate items |
| `Enter` | Select item |
| `Space` | Toggle selection |
| `Ctrl+A` | Select all |

### In Text Fields

| Shortcut | Action |
|----------|--------|
| `Ctrl+A` | Select all |
| `Ctrl+C` | Copy |
| `Ctrl+V` | Paste |
| `Ctrl+X` | Cut |
| `Ctrl+Z` | Undo |

## Quick Actions

### Emergency

| Shortcut | Action |
|----------|--------|
| `Space` | STOP all movement |
| `Escape` | Cancel operation |
| `Ctrl+Q` | Emergency disconnect |

### Common Workflows

| Shortcut | Action |
|----------|--------|
| `Ctrl+K, G` | Search then GoTo |
| `Ctrl+L, 5` | Log with 5-star rating |
| `F, F, Space` | Double focus in, stop |
| `Ctrl+P, Enter` | Plan tonight's session |

## Mobile/Touch Gestures

When using touch devices:

| Gesture | Action |
|---------|--------|
| Tap | Select/Click |
| Double-tap | Zoom to point |
| Pinch | Zoom in/out |
| Two-finger drag | Pan view |
| Long press | Context menu |
| Swipe left/right | Next/previous |

## Accessibility

### Screen Reader Support

| Shortcut | Action |
|----------|--------|
| `Alt+F1` | Read current status |
| `Alt+F2` | Read coordinates |
| `Alt+F3` | Read session info |
| `Alt+F4` | Navigation help |

### High Contrast Mode

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+H` | Toggle high contrast |
| `Ctrl+Alt+I` | Invert colors |
| `Ctrl+Alt++` | Increase font size |
| `Ctrl+Alt+-` | Decrease font size |

## Tips for Learning Shortcuts

1. **Start Small**: Learn 5 most-used shortcuts first
2. **Practice**: Use shortcuts even when mouse is faster initially
3. **Customize**: Set shortcuts that make sense to you
4. **Print Guide**: Keep reference card nearby
5. **Gradual Adoption**: Add new shortcuts weekly

## Creating Custom Shortcuts

1. Open Settings → Keyboard
2. Click "Add Custom Shortcut"
3. Press key combination
4. Select action
5. Save changes

### Shortcut Best Practices

- Avoid conflicts with browser shortcuts
- Use consistent patterns (Ctrl for app, Alt for telescope)
- Group related functions
- Document custom shortcuts
- Share with observing partners

---

Next: [Troubleshooting](./troubleshooting.md) →