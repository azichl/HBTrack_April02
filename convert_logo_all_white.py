from PIL import Image

def convert_logo(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    
    new_data = []
    for item in data:
        r, g, b, a = item
        if a > 0:
            # Check if pixel is part of an anti-aliased edge that was blended with white.
            # If so, it will have a high R,G,B but also high A.
            # To handle this, we can set the new alpha based on how dark the pixel is
            # if we assume the original background was white.
            # But the simplest is just to turn everything to white, keeping the current alpha.
            
            # If the pixel is very light (close to white) but has high alpha, it might be an edge.
            # Let's just make it white with the original alpha first.
            new_data.append((255, 255, 255, a))
        else:
            new_data.append((255, 255, 255, 0))
            
    img.putdata(new_data)
    img.save(output_path, "PNG")

convert_logo("public/ministry-logo.png", "public/ministry-logo-white.png")
print("Done all white")
