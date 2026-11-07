"""
Render the 1:1 logo (round badge) and the favicon crop of Macca from assets/gator.blend.

  blender -b --factory-startup --python tools/render_logo.py -- <blend> <out_dir> [samples]

Writes <out_dir>/logo.png (1024x1024, transparent corners) and <out_dir>/favicon-512.png (head crop).
"""
import bpy, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
BLEND = os.path.abspath(argv[0]) if argv else os.path.join(os.path.dirname(__file__), '..', 'assets', 'gator.blend')
OUT = os.path.abspath(argv[1]) if len(argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'game', 'assets')
SAMPLES = int(argv[2]) if len(argv) > 2 else 64
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene
rig = bpy.data.objects['GatorRig']
gator = bpy.data.objects['Gator']

# pose: the idle clip, a frame where the head is turned a little towards the camera
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


def emission_mat(name, build):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    build(nt, em)
    return m


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


TARGET = Vector((-0.12, -0.25, 1.42))
cam_d = bpy.data.cameras.new('LogoCam')
cam = bpy.data.objects.new('LogoCam', cam_d)
scene.collection.objects.link(cam)
cam.location = TARGET + Vector((-1.55, -4.1, 0.55))
look_at(cam, TARGET)
cam_d.lens = 62
scene.camera = cam
view = (TARGET - cam.location).normalized()

# ---- the badge behind Macca: sunset disc with synthwave stripes + a neon ring
behind = TARGET + view * 2.2
R = 1.62


def disc_shader(nt, em):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.elements[0].position, cr.elements[0].color = 0.0, srgb('#ff6a2b')
    cr.elements[1].position, cr.elements[1].color = 1.0, srgb('#7a1fa8')
    mid = cr.elements.new(0.55)
    mid.color = srgb('#ff2f8e')
    nt.links.new(sep.outputs['Y'], ramp.inputs['Fac'])
    # horizontal stripes cut through the lower half (retro sun)
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Y'
    wave.inputs['Scale'].default_value = 6.0
    wave.inputs['Distortion'].default_value = 0
    nt.links.new(tc.outputs['Generated'], wave.inputs['Vector'])
    gt = nt.nodes.new('ShaderNodeMath')
    gt.operation = 'GREATER_THAN'
    gt.inputs[1].default_value = 0.78
    nt.links.new(wave.outputs['Fac'], gt.inputs[0])
    low = nt.nodes.new('ShaderNodeMath')
    low.operation = 'LESS_THAN'
    low.inputs[1].default_value = 0.42
    nt.links.new(sep.outputs['Y'], low.inputs[0])
    cut = nt.nodes.new('ShaderNodeMath')
    cut.operation = 'MULTIPLY'
    nt.links.new(gt.outputs[0], cut.inputs[0])
    nt.links.new(low.outputs[0], cut.inputs[1])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(cut.outputs[0], mix.inputs['Factor'])
    nt.links.new(ramp.outputs['Color'], mix.inputs['A'])
    mix.inputs['B'].default_value = srgb('#3a0f5c')
    nt.links.new(mix.outputs['Result'], em.inputs['Color'])
    em.inputs['Strength'].default_value = 1.0


bpy.ops.mesh.primitive_circle_add(vertices=128, radius=R, fill_type='NGON', location=behind)
disc = bpy.context.active_object
disc.rotation_euler = (-view).to_track_quat('Z', 'Y').to_euler()
disc.data.materials.append(emission_mat('Disc', disc_shader))

bpy.ops.mesh.primitive_torus_add(major_radius=R + 0.03, minor_radius=0.055, major_segments=160, minor_segments=16, location=behind)
ring = bpy.context.active_object
ring.rotation_euler = disc.rotation_euler


def ring_shader(nt, em):
    em.inputs['Color'].default_value = srgb('#3fe0ff')
    em.inputs['Strength'].default_value = 6.0


ring.data.materials.append(emission_mat('Ring', ring_shader))

# ---- lights: warm key, soft fill, pink + cyan rims
for o in [o for o in scene.objects if o.type == 'LIGHT']:
    bpy.data.objects.remove(o)


def area(name, loc, power, color, size):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = power
    ld.color = color
    ld.size = size
    o = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(o)
    o.location = loc
    look_at(o, TARGET)
    return o


area('Key', TARGET + Vector((-2.2, -2.6, 2.2)), 520, (1.0, 0.95, 0.9), 2.5)
area('Fill', TARGET + Vector((2.6, -2.4, 0.4)), 160, (0.85, 0.9, 1.0), 3.0)
area('RimPink', TARGET + Vector((2.0, 1.8, 1.4)), 420, (1.0, 0.45, 0.75), 1.2)
area('RimCyan', TARGET + Vector((-2.2, 1.6, 0.9)), 320, (0.35, 0.9, 1.0), 1.2)

world = bpy.data.worlds.new('LogoWorld')
world.color = (0.05, 0.03, 0.08)
scene.world = world
try:
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.25, 0.2, 0.3, 1)
    bg.inputs['Strength'].default_value = 0.35
except Exception:
    pass

# ---- render settings
eng = 'BLENDER_EEVEE'
try:
    scene.render.engine = eng
except Exception:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
try:
    scene.eevee.taa_render_samples = SAMPLES
except Exception:
    pass
for attr, val in (('use_gtao', True), ('use_bloom', True), ('use_shadows', True)):
    try:
        setattr(scene.eevee, attr, val)
    except Exception:
        pass
scene.render.film_transparent = True
scene.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
try:
    scene.view_settings.look = 'AgX - Punchy'
except Exception:
    pass
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100

import numpy as np
from bpy_extras.object_utils import world_to_camera_view

RING_OUT = R + 0.03 + 0.055


try:
    ring.visible_shadow = False  # the frame ring sits in front of Macca: no shadow on him
except Exception:
    pass


def projected(obj, local_r):
    bpy.context.view_layer.update()
    c = obj.matrix_world.translation
    rim = obj.matrix_world @ Vector((local_r, 0, 0))
    pc, pr = world_to_camera_view(scene, cam, c), world_to_camera_view(scene, cam, rim)
    return pc.x, pc.y, math.hypot(pr.x - pc.x, pr.y - pc.y)


def badge_circle():
    """Where the ring's outer edge lands in the frame: centre (0..1) and radius (fraction of width)."""
    return projected(ring, RING_OUT)


def fit_badge(frac, centre):
    """Sunset disc behind Macca, neon ring in front of him (a porthole frame), both sized to `frac` of the frame."""
    face = (cam.location - centre).normalized()
    rot = face.to_track_quat('Z', 'Y').to_euler()
    disc.location = centre - face * 2.2
    ring.location = centre + face * 1.2
    for o, local_r, want in ((disc, R, frac * (R + 0.03) / RING_OUT), (ring, RING_OUT, frac)):
        o.rotation_euler = rot
        o.scale = (1, 1, 1)
        s = want / projected(o, local_r)[2]
        o.scale = (s, s, s)


def render_badge(path, size):
    """Render, then cut away everything below the badge circle (Macca may pop out over the top half)."""
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    cx, cy, r = badge_circle()
    img = bpy.data.images.load(path, check_existing=False)
    W = img.size[0]
    px = np.array(img.pixels[:], dtype=np.float32).reshape(W, W, 4)  # rows bottom -> top
    yy, xx = np.mgrid[0:W, 0:W]
    d = np.hypot(xx + 0.5 - cx * W, yy + 0.5 - cy * W) - r * W
    inside = np.clip(0.5 - d / 1.5, 0, 1)  # anti-aliased circle edge
    top = np.clip((yy - cy * W) / 2.0 + 0.5, 0, 1)  # upper half: keep anything that pops out
    keep = np.maximum(inside, top)
    px[..., 3] *= keep
    px[keep < 0.01, :3] = 0  # fully cut-away pixels: no hidden colour left behind
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    print('SAVED', path)


fit_badge(0.46, TARGET + Vector((0, 0, -0.02)))
render_badge(os.path.join(OUT, 'logo.png'), 1024)

# ---- favicon: a tight crop on the head, the badge filling the frame
HEAD = Vector((-0.04, -0.36, 1.7))
cam.location = HEAD + Vector((-1.1, -3.3, 0.35))
look_at(cam, HEAD)
cam_d.lens = 88
fit_badge(0.47, HEAD + Vector((0, 0, -0.03)))
render_badge(os.path.join(OUT, 'favicon-512.png'), 512)
