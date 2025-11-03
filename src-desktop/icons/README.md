# App Icons

## Quick Setup

1. Create or obtain a 1024x1024 PNG icon with transparency
2. Run the icon generator script:
   ```bash
   ./scripts/generate-icons.sh path/to/your-icon.png
   ```
3. Rebuild the Tauri app:
   ```bash
   npm run build:desktop
   ```

## Requirements

- **ImageMagick**: Install with `brew install imagemagick` (macOS)
- **Source image**: 1024x1024 PNG with transparency recommended

## Manual Setup

If you prefer to manually create icons:

### macOS
- `icon.icns` - macOS app bundle icon
- `32x32.png`, `128x128.png`, `128x128@2x.png` - Various sizes

### Windows
- `icon.ico` - Windows executable icon

### Linux
- `icon.png` - 1024x1024 source
- `128x128.png` - Standard size

## Icon Design Tips

- Use a simple, recognizable symbol
- Ensure good contrast at small sizes (32x32)
- Include transparency for rounded corners
- Test on both light and dark backgrounds
