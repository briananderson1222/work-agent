#!/bin/bash

# Generate Tauri app icons from a source image
# Usage: ./scripts/generate-icons.sh path/to/icon.png

if [ -z "$1" ]; then
  echo "Usage: ./scripts/generate-icons.sh path/to/source-icon.png"
  echo "Source icon should be at least 1024x1024 PNG with transparency"
  exit 1
fi

SOURCE=$1
ICONS_DIR="src-desktop/icons"

if [ ! -f "$SOURCE" ]; then
  echo "Error: Source file not found: $SOURCE"
  exit 1
fi

echo "Generating icons from $SOURCE..."

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
  echo "Error: ImageMagick is required. Install with: brew install imagemagick"
  exit 1
fi

# Generate PNG sizes
convert "$SOURCE" -resize 32x32 "$ICONS_DIR/32x32.png"
convert "$SOURCE" -resize 128x128 "$ICONS_DIR/128x128.png"
convert "$SOURCE" -resize 256x256 "$ICONS_DIR/128x128@2x.png"
convert "$SOURCE" -resize 1024x1024 "$ICONS_DIR/icon.png"

# Generate .icns for macOS (requires iconutil on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
  ICONSET="$ICONS_DIR/icon.iconset"
  mkdir -p "$ICONSET"
  
  convert "$SOURCE" -resize 16x16 "$ICONSET/icon_16x16.png"
  convert "$SOURCE" -resize 32x32 "$ICONSET/icon_16x16@2x.png"
  convert "$SOURCE" -resize 32x32 "$ICONSET/icon_32x32.png"
  convert "$SOURCE" -resize 64x64 "$ICONSET/icon_32x32@2x.png"
  convert "$SOURCE" -resize 128x128 "$ICONSET/icon_128x128.png"
  convert "$SOURCE" -resize 256x256 "$ICONSET/icon_128x128@2x.png"
  convert "$SOURCE" -resize 256x256 "$ICONSET/icon_256x256.png"
  convert "$SOURCE" -resize 512x512 "$ICONSET/icon_256x256@2x.png"
  convert "$SOURCE" -resize 512x512 "$ICONSET/icon_512x512.png"
  convert "$SOURCE" -resize 1024x1024 "$ICONSET/icon_512x512@2x.png"
  
  iconutil -c icns "$ICONSET" -o "$ICONS_DIR/icon.icns"
  rm -rf "$ICONSET"
  echo "Generated icon.icns"
fi

# Generate .ico for Windows
convert "$SOURCE" -resize 256x256 \
  \( -clone 0 -resize 16x16 \) \
  \( -clone 0 -resize 32x32 \) \
  \( -clone 0 -resize 48x48 \) \
  \( -clone 0 -resize 64x64 \) \
  \( -clone 0 -resize 128x128 \) \
  \( -clone 0 -resize 256x256 \) \
  -delete 0 "$ICONS_DIR/icon.ico"

echo "✓ Icons generated successfully in $ICONS_DIR"
echo "Rebuild your Tauri app to see the new icon"
