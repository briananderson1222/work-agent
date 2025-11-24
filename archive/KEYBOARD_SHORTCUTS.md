# Keyboard Shortcuts

## System Architecture

The keyboard shortcuts system is centralized and configurable:

- **KeyboardShortcutsContext**: Central registry for all shortcuts
- **useKeyboardShortcut hook**: Easy registration in components
- **useShortcutDisplay hook**: Get formatted shortcut text for UI display
- **Dynamic display**: Automatically shows correct symbols (⌘ on Mac, Ctrl+ on Windows/Linux)
- **ShortcutsCheatsheet**: Modal showing all registered shortcuts

## Current Shortcuts

### Application
- `⌘/` - Show keyboard shortcuts cheatsheet
- `⌘,` - Toggle settings
- `⌘N` - New workspace

### Chat Dock
- `⌘D` - Toggle dock open/closed
- `⌘M` - Maximize/restore dock
- `⌘T` - New chat session
- `⌘O` - Open conversation picker
- `⌘X` - Close current tab
- `⌘1-9` - Switch to session 1-9
- `Ctrl+C` - Cancel active request (when sending)

### Theme
- `⌘H` - Toggle light/dark mode

## Usage

### Registering a Shortcut

```typescript
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';

function MyComponent() {
  useKeyboardShortcut(
    'my.action',           // Unique ID
    's',                   // Key
    ['cmd', 'shift'],      // Modifiers
    'Save document',       // Description
    () => handleSave()     // Handler
  );
}
```

### Displaying a Shortcut

All shortcut text in the UI is now **dynamically generated** from the registered shortcuts:

```typescript
import { useShortcutDisplay } from '../hooks/useKeyboardShortcut';

function MyButton() {
  const shortcut = useShortcutDisplay('my.action');
  
  return (
    <button title={`Save (${shortcut})`}>
      Save <span>{shortcut}</span>
    </button>
  );
}
```

This ensures:
- Shortcuts always match their actual bindings
- Platform-specific display (⌘ on Mac, Ctrl+ elsewhere)
- Single source of truth for both binding and display

### Viewing All Shortcuts

Press `⌘/` to open the shortcuts cheatsheet modal, which shows all registered shortcuts grouped by category.

## Future Enhancements

1. **User Configuration**: Store shortcuts in app config
2. **Conflict Detection**: Warn when shortcuts overlap
3. **Settings UI**: Allow users to customize shortcuts
4. **Context-aware**: Different shortcuts based on active view
