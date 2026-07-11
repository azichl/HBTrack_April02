from PIL import Image

def convert_logo(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    
    new_data = []
    for item in data:
        r, g, b, a = item
        # If the pixel is not fully transparent, make it pure white but keep its alpha transparency
        if a > 0:
            new_data.append((255, 255, 255, a))
        else:
            new_data.append((255, 255, 255, 0))
            
    img.putdata(new_data)
    img.save(output_path, "PNG")

convert_logo("public/ministry-logo.png", "public/ministry-logo-pure-white.png")
print("Saved ministry-logo-pure-white.png")
