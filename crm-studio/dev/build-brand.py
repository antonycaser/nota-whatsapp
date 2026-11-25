"""
Gera apps-script/Brand.html a partir das logos em crm-studio/marca/.
Cria também versões claras (para fundos escuros) automaticamente.
  python3 crm-studio/dev/build-brand.py
"""
import base64, io, os
from PIL import Image

BASE = os.path.join(os.path.dirname(__file__), '..')
MARCA = os.path.join(BASE, 'marca')

def prep(f, w):
    im = Image.open(os.path.join(MARCA, f)).convert('RGBA')
    bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(bb)
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)

def clara(im):
    out = im.copy(); px = im.load(); po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            po[x, y] = (246, 240, 235, a) if (g > r + 15 or b > r + 15) else (206, 180, 165, a)
    return out

def uri(im):
    buf = io.BytesIO()
    im.quantize(colors=48, method=Image.FASTOCTREE).save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

mark, full = prep('logo-circular.png', 320), prep('logo-horizontal.png', 720)
css = f"""<style>
/* Gerado por dev/build-brand.py — logos da marca embutidas */
:root {{
  --logo-mark: url({uri(mark)});
  --logo-mark-light: url({uri(clara(mark))});
  --logo-full: url({uri(full)});
  --logo-full-light: url({uri(clara(full))});
  --logo-full-ratio: {full.width / full.height:.4f};
}}
</style>
"""
open(os.path.join(BASE, 'apps-script', 'Brand.html'), 'w').write(css)
print('Brand.html gerado:', len(css) // 1024, 'KB')
