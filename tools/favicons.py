"""Scale assets/favicon-512.png down to every favicon size.
  blender -b --factory-startup --python tools/favicons.py -- assets
"""
import bpy, os, sys
d = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
src = os.path.join(d, 'favicon-512.png')
for size in (192, 180, 48, 32, 16):
    img = bpy.data.images.load(src, check_existing=False)
    # step down in halves for a cleaner small icon
    w = img.size[0]
    while w // 2 >= size * 1.5:
        w //= 2
        img.scale(w, w)
    img.scale(size, size)
    out = os.path.join(d, f'favicon-{size}.png')
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    print('SAVED', out)
