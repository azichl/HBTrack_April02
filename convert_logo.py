from PIL import Image

def convert_logo(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    
    new_data = []
    for item in data:
        r, g, b, a = item
        # If the pixel is dark and mostly grayscale (not the maroon color)
        # Maroon is roughly R:150, G:30, B:50
        # Dark text will be R<80, G<80, B<80
        # Let's check if the pixel is dark. If it is dark, invert its brightness.
        if a > 0:
            # Calculate luminance
            lum = 0.299*r + 0.587*g + 0.114*b
            
            # Check if it's a neutral color (R, G, B are close to each other)
            # and if it's dark
            is_dark = lum < 100
            
            # The maroon color has a high red component compared to green and blue
            # Let's say, if it's not maroon. Maroon has R much greater than G and B.
            is_maroon = (r > g + 30) and (r > b + 30) and r > 80
            
            if not is_maroon and lum < 150:
                # It's part of the text (black or dark gray anti-aliasing)
                # Let's map its luminance to white, keeping the anti-aliasing smooth.
                # If luminance is 0 (black), we want 255 (white).
                # If luminance is 150 (gray), we want 255-150 = 105 (light gray).
                # A simple inversion of RGB values for these pixels:
                new_r = 255 - r
                new_g = 255 - g
                new_b = 255 - b
                new_data.append((new_r, new_g, new_b, a))
            else:
                # Keep original pixel
                new_data.append((r, g, b, a))
        else:
            new_data.append((r, g, b, a))
            
    img.putdata(new_data)
    img.save(output_path, "PNG")

convert_logo("public/ministry-logo.png", "public/ministry-logo-white.png")
print("Done")
