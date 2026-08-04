from PIL import Image
import numpy as np

# Load user-uploaded image
src_path = '/Users/abdelazizchlih/.gemini/antigravity/brain/e2564a1b-9d56-45b1-9d49-3afcb3f8032a/.user_uploaded/media_1785820640971.png'
img = Image.open(src_path).convert('RGB')
arr = np.array(img, dtype=float)

# Calculate saturation (max_channel - min_channel)
r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
max_c = np.maximum(r, np.maximum(g, b))
min_c = np.minimum(r, np.minimum(g, b))
sat = max_c - min_c

# Threshold for alpha: background texture has sat <= 1.0.
# Artwork pixels have sat > 5. Smooth anti-aliasing between 1.0 and 15.0
alpha = np.clip((sat - 1.0) / 12.0, 0.0, 1.0)

# Create RGBA array of original size
rgba = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
rgba[:,:,:3] = np.clip(arr, 0, 255).astype(np.uint8)
rgba[:,:,3] = (alpha * 255).astype(np.uint8)

rgba_img = Image.fromarray(rgba, mode='RGBA')

# Get tight bounding box of artwork
bbox = rgba_img.getbbox() # (left, top, right, bottom)
print("Artwork tight bbox:", bbox)

cropped_artwork = rgba_img.crop(bbox)
w_art, h_art = cropped_artwork.size
print(f"Cropped artwork size: {w_art}x{h_art}")

# Target canvas: 1024x1024 square
canvas_size = 1024

# Scale artwork so it fills ~82% of the 1024x1024 canvas (leaving ~9% padding on sides)
target_max_dim = int(canvas_size * 0.82) # 839 px
scale = target_max_dim / float(max(w_art, h_art))
new_w = int(w_art * scale)
new_h = int(h_art * scale)

resized_artwork = cropped_artwork.resize((new_w, new_h), Image.Resampling.LANCZOS)

# Create 1024x1024 white canvas
white_icon = Image.new("RGB", (canvas_size, canvas_size), (255, 255, 255))

# Center the artwork on the canvas
offset_x = (canvas_size - new_w) // 2
offset_y = (canvas_size - new_h) // 2

# Paste artwork onto white canvas using alpha channel as mask
white_icon.paste(resized_artwork, (offset_x, offset_y), resized_artwork)

# Also create transparent PNG version of 1024x1024 icon
transparent_icon = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 0))
transparent_icon.paste(resized_artwork, (offset_x, offset_y), resized_artwork)

# Save output files to public/
white_icon.save("public/houbara-icon.png", "PNG")
white_icon.save("public/app-icon-1024.png", "PNG")
transparent_icon.save("public/houbara-icon-transparent.png", "PNG")

# Copy dist if dist exists
import os, shutil
if os.path.exists("dist"):
    shutil.copy("public/houbara-icon.png", "dist/houbara-icon.png")
    shutil.copy("public/app-icon-1024.png", "dist/app-icon-1024.png")
    shutil.copy("public/houbara-icon-transparent.png", "dist/houbara-icon-transparent.png")

print("Saved public/houbara-icon.png (1024x1024 white background)")
print("Saved public/app-icon-1024.png (1024x1024 white background)")
print("Saved public/houbara-icon-transparent.png (1024x1024 transparent)")
