"""
Studio render of our own Macca model: full body, 3/4 view, pink-purple backdrop, glossy reflective floor.
Writes <out>/logo.png (1024x1024) and <out>/favicon-512.png (head close-up, full bleed).

  blender -b --factory-startup --python tools/render_studio.py -- <blend> <out_dir> [samples]
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
BLEND = os.path.abspath(argv[0]) if argv else os.path.join(os.path.dirname(__file__), '..', 'blender', 'gator.blend')
OUT = os.path.abspath(argv[1]) if len(argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'assets')
SAMPLES = int(argv[2]) if len(argv) > 2 else 64
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene
rig = bpy.data.objects['GatorRig']
act = bpy.data.actions.get('Idle')
rig.animation_data.action = act
try:
    if act.slots:
        rig.animation_data.action_slot = act.slots[0]
except Exception:
    pass
scene.frame_set(54)


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


# ---- cyclorama: floor curving up into the back wall (seamless studio backdrop)
bm = bmesh.new()
prof = [(y, 0.0) for y in (-8.0, -2.0, 0.6)]
for k in range(1, 13):
    a = (k / 12) * math.pi / 2
    prof.append((0.6 + math.sin(a) * 2.4, 2.4 - math.cos(a) * 2.4))
prof += [(3.0, 5.0), (3.0, 12.0)]
rows = []
for x in (-12.0, 12.0):
    rows.append([bm.verts.new((x, y, z)) for y, z in prof])
for i in range(len(prof) - 1):
    bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
me = bpy.data.meshes.new('Cyc')
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True
cyc = bpy.data.objects.new('Cyc', me)
scene.collection.objects.link(cyc)
m = bpy.data.materials.new('Backdrop')
try:
    m.use_nodes = True
except Exception:
    pass
bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Base Color'].default_value = srgb('#7a1650')
bsdf.inputs['Roughness'].default_value = 0.28
try:
    bsdf.inputs['Specular IOR Level'].default_value = 0.6
except Exception:
    pass
bsdf.inputs['Roughness'].default_value = 0.85  # matte wall: no mirrored hot spots
cyc.data.materials.append(m)
# the floor alone is glossy, for a soft reflection under Macca
fm = m.copy()
fm.name = 'Floor'
fb = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
fb.inputs['Roughness'].default_value = 0.22
fb.inputs['Base Color'].default_value = srgb('#7a1650')
cyc.data.materials.append(fm)
for p in me.polygons:
    if p.center.z < 0.05:
        p.material_index = 1

# ---- camera
TARGET = Vector((-0.08, -0.15, 1.02))
cam_d = bpy.data.cameras.new('Cam')
cam = bpy.data.objects.new('Cam', cam_d)
scene.collection.objects.link(cam)
cam.location = TARGET + Vector((-1.35, -5.9, 0.45))
look_at(cam, TARGET)
cam_d.lens = 88
scene.camera = cam

# ---- lights: big soft key from the upper left, magenta + cyan rims, a glow on the backdrop
for o in [o for o in scene.objects if o.type == 'LIGHT']:
    bpy.data.objects.remove(o)


def area(name, loc, power, col, size, target=TARGET):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy, ld.color, ld.size = power, col, size
    o = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(o)
    o.location = loc
    look_at(o, target)
    return o


area('Key', TARGET + Vector((-2.6, -3.0, 2.6)), 420, (1.0, 0.95, 0.93), 3.0)
area('Fill', TARGET + Vector((3.0, -2.6, 0.6)), 110, (0.95, 0.85, 1.0), 3.5)
area('RimL', TARGET + Vector((-2.4, 1.8, 1.6)), 300, (1.0, 0.55, 0.85), 1.4)
area('RimR', TARGET + Vector((2.4, 1.8, 1.4)), 260, (0.55, 0.8, 1.0), 1.4)
# light pools on the backdrop: brighter upper-left, falling off to deep purple at the edges
area('WallGlow', Vector((-0.6, -1.5, 3.4)), 260, (1.0, 0.55, 0.85), 9.0, target=Vector((-0.4, 3.0, 2.2)))
area('FloorGlow', Vector((0.0, -1.0, 6.0)), 90, (1.0, 0.7, 0.9), 6.0, target=Vector((0.0, -0.5, 0.0)))

world = bpy.data.worlds.new('W')
scene.world = world
try:
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = srgb('#3a0d3a')
    bg.inputs['Strength'].default_value = 0.25
except Exception:
    world.color = (0.05, 0.01, 0.05)

# ---- render settings (Eevee with ray-traced reflections for the glossy floor)
try:
    scene.render.engine = 'BLENDER_EEVEE'
except Exception:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
ee = scene.eevee
for attr, val in (('taa_render_samples', SAMPLES), ('use_raytracing', True), ('use_shadows', True), ('use_gtao', True)):
    try:
        setattr(ee, attr, val)
    except Exception:
        pass
try:
    ee.ray_tracing_options.resolution_scale = '1'
except Exception:
    pass
scene.render.film_transparent = False
try:
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'Medium High Contrast'
except Exception:
    pass
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.resolution_percentage = 100


def shot(path, size):
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('SAVED', path)


shot(os.path.join(OUT, 'logo.png'), 1024)

# favicon: head close-up, the backdrop filling the square
HEAD = Vector((-0.04, -0.4, 1.68))
cam.location = HEAD + Vector((-1.0, -3.4, 0.3))
look_at(cam, HEAD)
cam_d.lens = 80
shot(os.path.join(OUT, 'favicon-512.png'), 512)
