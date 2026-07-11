from PIL import Image

def make_transparent(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()
    
    newData = []
    # Make anything close to white transparent
    for item in datas:
        # Check if pixel is close to white (allow some tolerance for compression artifacts)
        if item[0] > 200 and item[1] > 200 and item[2] > 200:
            newData.append((255, 255, 255, 0)) # Fully transparent
        else:
            newData.append(item)
            
    img.putdata(newData)
    img.save(output_path, "PNG")
    print(f"Saved transparent image to {output_path}")

make_transparent("public/houbara-icon.png", "public/houbara-icon-transparent.png")
