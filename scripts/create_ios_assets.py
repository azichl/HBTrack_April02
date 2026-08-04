import os
import json
from PIL import Image

appicon_dir = "ios/HBTrack/Assets.xcassets/AppIcon.appiconset"
os.makedirs(appicon_dir, exist_ok=True)

# Base 1024x1024 icon image
base_icon = Image.open("public/app-icon-1024.png").convert("RGB")

# Sizes required for iOS App Icons
sizes = [
    ("icon-1024.png", 1024),
    ("icon-180.png", 180),
    ("icon-120.png", 120),
    ("icon-167.png", 167),
    ("icon-152.png", 152),
    ("icon-76.png", 76),
    ("icon-60.png", 60),
    ("icon-40.png", 40),
    ("icon-29.png", 29),
    ("icon-20.png", 20),
]

for filename, sz in sizes:
    resized = base_icon.resize((sz, sz), Image.Resampling.LANCZOS)
    resized.save(os.path.join(appicon_dir, filename), "PNG")

contents_json = {
  "images": [
    {
      "filename": "icon-1024.png",
      "idiom": "universal",
      "platform": "ios",
      "size": "1024x1024"
    },
    {
      "filename": "icon-180.png",
      "idiom": "iphone",
      "scale": "3x",
      "size": "60x60"
    },
    {
      "filename": "icon-120.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "60x60"
    },
    {
      "filename": "icon-167.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "83.5x83.5"
    },
    {
      "filename": "icon-152.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "76x76"
    },
    {
      "filename": "icon-76.png",
      "idiom": "ipad",
      "scale": "1x",
      "size": "76x76"
    },
    {
      "filename": "icon-1024.png",
      "idiom": "ios-marketing",
      "scale": "1x",
      "size": "1024x1024"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}

with open(os.path.join(appicon_dir, "Contents.json"), "w") as f:
    json.dump(contents_json, f, indent=2)

print("Created iOS Assets.xcassets and AppIcon.appiconset successfully!")
