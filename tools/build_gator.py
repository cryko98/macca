"""
Pink party gator - procedural model + rig + animations, exported to GLB.

Run (Blender 4.2+ / 5.x):
  blender -b --factory-startup --python tools/build_gator.py -- <out_dir> [render_dir]

Coordinates: Blender Z-up, meters, character faces -Y (glTF export turns it into +Z forward, Y up).
"""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix, Euler, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
OUT_DIR = os.path.abspath(argv[0]) if argv else os.path.join(HERE, '..', 'assets')
RENDER_DIR = os.path.abspath(argv[1]) if len(argv) > 1 else None
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30

K = 0.575  # metaball: surface radius of an isolated element = K * element.radius (stiffness 2, threshold .6)


# ----------------------------------------------------------------------------- helpers
def V(*a):
    return Vector(a[0] if len(a) == 1 else a)


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


# ----------------------------------------------------------------------------- materials
def shirt_texture(path):
    W = 512
    base = np.array([0x8f, 0xd6, 0xea]) / 255
    img = np.ones((W, W, 4))
    img[..., :3] = base
    yy, xx = np.mgrid[0:W, 0:W]
    rng = np.random.default_rng(7)

    def blob(cx, cy, rx, ry, col, ang=0.0):
        ca, sa = math.cos(ang), math.sin(ang)
        for dx in (-W, 0, W):
            for dy in (-W, 0, W):
                X = xx - (cx + dx)
                Y = yy - (cy + dy)
                u = X * ca + Y * sa
                v = -X * sa + Y * ca
                m = (u / rx) ** 2 + (v / ry) ** 2 < 1
                img[m, :3] = col

    leaf = np.array([0x2f, 0xa8, 0x76]) / 255
    pinks = [np.array([0xff, 0x4f, 0xa3]) / 255, np.array([0xff, 0xff, 0xff]) / 255,
             np.array([0xff, 0x8a, 0x5c]) / 255]
    centres = []
    for i in range(9):
        for _ in range(200):
            c = rng.uniform(0, W, 2)
            if all(min(abs(c[0] - o[0]), W - abs(c[0] - o[0])) ** 2 +
                   min(abs(c[1] - o[1]), W - abs(c[1] - o[1])) ** 2 > 120 ** 2 for o in centres):
                centres.append(c)
                break
    for i, (cx, cy) in enumerate(centres):
        a0 = rng.uniform(0, math.pi)
        for k in range(2):
            a = a0 + k * 2.3
            blob(cx + 42 * math.cos(a), cy + 42 * math.sin(a), 34, 13, leaf, a)
        col = pinks[i % 3]
        for k in range(5):
            a = a0 + k * 2 * math.pi / 5
            blob(cx + 20 * math.cos(a), cy + 20 * math.sin(a), 20, 15, col, a)
        blob(cx, cy, 9, 9, np.array([0xff, 0xd8, 0x3b]) / 255)
    im = bpy.data.images.new('shirt_pattern', W, W, alpha=False)
    im.pixels.foreach_set(img.astype(np.float32).ravel())
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    im.pack()
    return im


MATERIALS = {}


def make_mat(name, hexc, rough=0.55, metal=0.0, alpha=1.0, image=None, double=False):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    col = srgb(hexc)
    bsdf.inputs['Base Color'].default_value = col
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try:
                setattr(m, attr, val)
                break
            except Exception:
                pass
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    m.use_backface_culling = not double
    m.diffuse_color = col[:3] + (alpha,)
    m.roughness = rough
    MATERIALS[name] = m
    return m


shirt_img = shirt_texture(os.path.join(OUT_DIR, 'shirt_pattern.png'))
make_mat('Skin', '#ff4fa6', 0.5)
make_mat('Belly', '#ffb6d0', 0.6)
make_mat('Shirt', '#8fd6ea', 0.7, image=shirt_img, double=True)
make_mat('Shorts', '#2aa6b5', 0.75, double=True)
make_mat('EyeWhite', '#ffffff', 0.25)
make_mat('Pupil', '#121018', 0.2)
make_mat('Brow', '#3a1232', 0.6)
make_mat('Frame', '#8a3fe0', 0.3, metal=0.2)
make_mat('Lens', '#1a1446', 0.08, metal=0.4)
make_mat('Teeth', '#fff7ee', 0.35)
make_mat('Mouth', '#5c0a26', 0.6, double=True)
make_mat('Tongue', '#e0386c', 0.5)
make_mat('Nostril', '#4a0c2c', 0.7)
make_mat('Claw', '#fff3f6', 0.4)
make_mat('Glass', '#dff6ff', 0.05, alpha=0.32, double=True)
make_mat('Drink', '#3b2fb8', 0.15, alpha=0.88)
make_mat('Flag', '#ff6a4d', 0.6, double=True)
make_mat('Pick', '#f5deb3', 0.6)
make_mat('Button', '#fff2dd', 0.3)
make_mat('Scute', '#d82f84', 0.55)

# ----------------------------------------------------------------------------- skeleton definition
L, R = 1, -1  # +X is the character's left


def sym(x, s):
    return x * s


TAIL_PTS = [V(0, 0.20, 0.62), V(0, 0.44, 0.50), V(0, 0.68, 0.43), V(0.04, 0.90, 0.44), V(0.10, 1.06, 0.53),
            V(0.15, 1.15, 0.68)]
TAIL_RAD = [0.19, 0.15, 0.115, 0.085, 0.06, 0.035]
TAIL = [f'tail_{i + 1}' for i in range(5)]

EYE = {s: V(0.13 * s, -0.12, 1.86) for s in (L, R)}
EYE_R = 0.115

ARM = {
    # side: shoulder, elbow, wrist, fist centre
    R: (V(-0.30, 0.0, 1.12), V(-0.48, 0.02, 0.92), V(-0.51, -0.15, 1.15), V(-0.51, -0.22, 1.21)),
    L: (V(0.30, 0.0, 1.12), V(0.47, 0.03, 0.88), V(0.44, -0.17, 0.79), V(0.42, -0.24, 0.78)),
}
LEG = {s: (V(0.16 * s, 0.0, 0.62), V(0.17 * s, -0.03, 0.36), V(0.17 * s, 0.0, 0.13), V(0.17 * s, -0.22, 0.05))
       for s in (L, R)}

BONEDEF = [  # name, head, tail, parent, deform
    ('root', V(0, 0, 0), V(0, 0, 0.25), None, False),
    ('hips', V(0, 0, 0.60), V(0, 0, 0.80), 'root', True),
    ('spine', V(0, 0, 0.80), V(0, 0, 1.00), 'hips', True),
    ('chest', V(0, 0, 1.00), V(0, 0, 1.25), 'spine', True),
    ('neck', V(0, 0, 1.25), V(0, 0, 1.40), 'chest', True),
    ('head', V(0, 0, 1.40), V(0, 0, 1.78), 'neck', True),
    ('jaw', V(0, 0.04, 1.44), V(0, -0.62, 1.37), 'head', True),
]
for s, sn in ((L, 'L'), (R, 'R')):
    BONEDEF.append((f'lid.{sn}', EYE[s], EYE[s] + V(0, -0.18, 0), 'head', True))
    sh, el, wr, fi = ARM[s]
    BONEDEF += [
        (f'upper_arm.{sn}', sh, el, 'chest', True),
        (f'forearm.{sn}', el, wr, f'upper_arm.{sn}', True),
        (f'hand.{sn}', wr, fi + (fi - wr).normalized() * 0.06, f'forearm.{sn}', True),
    ]
    hp, kn, an, toe = LEG[s]
    BONEDEF += [
        (f'thigh.{sn}', hp, kn, 'hips', True),
        (f'shin.{sn}', kn, an, f'thigh.{sn}', True),
        (f'foot.{sn}', an, toe, f'shin.{sn}', True),
    ]
for i in range(5):
    BONEDEF.append((TAIL[i], TAIL_PTS[i], TAIL_PTS[i + 1], 'hips' if i == 0 else TAIL[i - 1], True))

BONES = {b[0]: (b[1], b[2]) for b in BONEDEF}


def top2(raw):
    ws = sorted(raw.items(), key=lambda x: -x[1])[:2]
    s = sum(w for _, w in ws) or 1.0
    return {n: w / s for n, w in ws if w / s > 0.01}


def wdist(cands, power=6):
    def f(p):
        return top2({n: 1.0 / max(seg_dist(p, *BONES[n]), 1e-4) ** power for n in cands})
    return f


def rigid(n):
    return lambda p: {n: 1.0}


def torso_w(p):
    raw = {n: 1.0 / max(seg_dist(p, *BONES[n]), 1e-4) ** 6 for n in ['hips', 'spine', 'chest', 'neck'] + TAIL}
    fac = smoothstep(0.10, 0.34, p.y) * (1 - smoothstep(0.85, 0.98, p.z))
    for n in TAIL:
        raw[n] *= fac
    return top2(raw)


def mouth_w(p):
    j = smoothstep(1.47, 1.42, p.z)
    return {'jaw': j, 'head': 1 - j} if 0 < j < 1 else ({'jaw': 1.0} if j >= 1 else {'head': 1.0})


# ----------------------------------------------------------------------------- mesh building
BM = bmesh.new()
BM.verts.layers.deform.verify()
BM.loops.layers.uv.verify()
GROUPS, MATLIST = [], []


def gi(name):
    if name not in GROUPS:
        GROUPS.append(name)
    return GROUPS.index(name)


def mi(name):
    if name not in MATLIST:
        MATLIST.append(name)
    return MATLIST.index(name)


def cyl_uv(axis_o, axis_d, rep_u, rep_v):
    axis_d = axis_d.normalized()
    ref = V(0, 1, 0) if abs(axis_d.y) < 0.9 else V(1, 0, 0)
    e1 = (ref - axis_d * ref.dot(axis_d)).normalized()
    e2 = axis_d.cross(e1)

    def f(co):
        d = co - axis_o
        a = math.atan2(d.dot(e2), d.dot(e1))
        return (a / (2 * math.pi) * rep_u + 0.5, d.dot(axis_d) * rep_v)
    return f, rep_u


def append(me, mat, wfn, uv=None, smooth=True):
    n0, f0 = len(BM.verts), len(BM.faces)
    BM.from_mesh(me)
    bpy.data.meshes.remove(me)
    BM.verts.ensure_lookup_table()
    BM.faces.ensure_lookup_table()
    dl = BM.verts.layers.deform.verify()
    uvl = BM.loops.layers.uv.verify()
    for v in BM.verts[n0:]:
        for b, w in wfn(v.co).items():
            v[dl][gi(b)] = w
    m = mi(mat)
    for f in BM.faces[f0:]:
        f.material_index = m
        f.smooth = smooth
        if uv:
            fn, rep = uv
            us = [fn(l.vert.co) for l in f.loops]
            umin = min(u for u, _ in us)
            if max(u for u, _ in us) - umin > rep / 2:
                us = [(u + rep if u - umin < rep / 2 else u, v) for u, v in us]
            for l, (u, v) in zip(f.loops, us):
                l[uvl].uv = (u, v)


def bm_to_mesh(bm):
    me = bpy.data.meshes.new('tmp')
    bm.to_mesh(me)
    bm.free()
    return me


def metaball(elements, res=0.018, ratio=0.45, post=None):
    name = 'MBF' + ''.join(chr(65 + (len(bpy.data.meshes) * 7 + i) % 26) for i in range(6))
    mb = bpy.data.metaballs.new(name)
    mb.resolution = res
    mb.render_resolution = res
    mb.threshold = 0.6
    for e in elements:
        if e[0] == 'ball':
            el = mb.elements.new(type='BALL')
            el.co = e[1]
            el.radius = e[2] / K
        else:
            half = e[2]
            m = max(half)
            el = mb.elements.new(type='ELLIPSOID')
            el.co = e[1]
            el.radius = m / K
            el.size_x, el.size_y, el.size_z = half[0] / m, half[1] / m, half[2] / m
            if len(e) > 3 and e[3] is not None:
                el.rotation = e[3]
        el.stiffness = 2.0
    ob = bpy.data.objects.new(name, mb)
    scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.metaballs.remove(mb)
    if ratio < 1:
        tmp = bpy.data.objects.new('tmpdec', me)
        scene.collection.objects.link(tmp)
        mod = tmp.modifiers.new('dec', 'DECIMATE')
        mod.ratio = ratio
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        me2 = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
        bpy.data.objects.remove(tmp)
        bpy.data.meshes.remove(me)
        me = me2
    if post:
        bm = bmesh.new()
        bm.from_mesh(me)
        post(bm)
        bm.to_mesh(me)
        bm.free()
    return me


def bisect(bm, planes):
    for co, no in planes:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)


def chain(points, radii, step=0.035):
    """Balls along a Catmull-Rom spline through points."""
    out = []
    P = [points[0]] + list(points) + [points[-1]]
    Rr = [radii[0]] + list(radii) + [radii[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(2, int((p2 - p1).length / step))
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            p = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            r = Rr[i] + (Rr[i + 1] - Rr[i]) * t
            out.append(('ball', p, r))
    out.append(('ball', points[-1], radii[-1]))
    return out


def basis(z_dir, x_hint=V(1, 0, 0)):
    z = z_dir.normalized()
    x = (x_hint - z * x_hint.dot(z)).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


def sphere(c, radii, rot=None, seg=24, rings=14, cut_below=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    if cut_below is not None:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut_below], context='VERTS')
    M = Matrix.Translation(c) @ (rot.to_4x4() if rot is not None else Matrix.Identity(4)) @ Matrix.Diagonal((*radii, 1))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return bm_to_mesh(bm)


def cone(a, b, r1, r2=0.0, seg=14, caps=True, x_hint=V(1, 0, 0)):
    bm = bmesh.new()
    d = b - a
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=d.length)
    M = Matrix.Translation((a + b) / 2) @ basis(d, x_hint).to_4x4()
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return bm_to_mesh(bm)


def oval_disc(c, normal, rx, ry, thick, seg=28):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=1, radius2=1, depth=1)
    M = Matrix.Translation(c) @ basis(normal).to_4x4() @ Matrix.Diagonal((rx, ry, thick, 1))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return bm_to_mesh(bm)


def torus(c, Rmaj, rmin, seg=40, ring=10, keep=lambda p: True, rot=None):
    bm = bmesh.new()
    vs = []
    rot = rot if rot is not None else Matrix.Identity(3)
    for i in range(seg):
        a = 2 * math.pi * i / seg
        row = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            row.append(bm.verts.new(c + rot @ V((Rmaj + rmin * math.cos(b)) * math.cos(a),
                                                (Rmaj + rmin * math.cos(b)) * math.sin(a), rmin * math.sin(b))))
        vs.append(row)
    for i in range(seg):
        for j in range(ring):
            bm.faces.new((vs[i][j], vs[i][(j + 1) % ring], vs[(i + 1) % seg][(j + 1) % ring], vs[(i + 1) % seg][j]))
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median())], context='FACES')
    return bm_to_mesh(bm)


# ---------------------------------------------------------------- body (torso + neck + tail)
torso_el = [
    ('ell', V(0, 0.03, 0.62), (0.30, 0.26, 0.17)),
    ('ell', V(0, 0.0, 0.80), (0.34, 0.28, 0.29)),
    ('ell', V(0, 0.01, 1.06), (0.29, 0.24, 0.24)),
    ('ball', V(0, 0.0, 1.30), 0.17),
] + chain(TAIL_PTS, TAIL_RAD)
append(metaball(torso_el, ratio=0.4), 'Skin', torso_w)


from mathutils.bvhtree import BVHTree
BM.verts.ensure_lookup_table()
_torso_tree = BVHTree.FromBMesh(BM)

def belly_plate(z0, z1, nu=18, nv=7):
    """A pillow-shaped plate that hugs the torso surface (edges sit on the skin, centre bulges out)."""
    bm = bmesh.new()
    grid = []
    for j in range(nv + 1):
        v = j / nv
        z = z0 + (z1 - z0) * v
        w = 0.25 * math.sqrt(max(0.05, 1 - ((z - 0.86) / 0.40) ** 2))
        row = []
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            hit, nrm, _, _ = _torso_tree.ray_cast(V(u * w, -2, z), V(0, 1, 0))
            h = 0.003 + 0.017 * (1 - u * u) ** 0.5 * math.sin(math.pi * v) ** 0.5
            row.append(bm.verts.new(hit + nrm * h))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.faces[0].normal.y > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return bm_to_mesh(bm)


_bands = np.linspace(0.55, 1.23, 7)
for z0, z1 in zip(_bands[:-1], _bands[1:]):
    append(belly_plate(z0 + 0.006, z1 - 0.006), 'Belly', wdist(['hips', 'spine', 'chest']))

# ---------------------------------------------------------------- shirt (open Hawaiian shirt)


def open_w(z):
    return 0.12 + 0.10 * (1.27 - z) / 0.6


RINGS = {}


def boundary_ring(bm, on_plane):
    """Centre + mean radius of the open boundary verts selected by on_plane(co)."""
    vs = {v for e in bm.edges if e.is_boundary for v in e.verts if on_plane(v.co)}
    if not vs:
        return None
    c = sum((v.co for v in vs), V(0, 0, 0)) / len(vs)
    return c, sum((v.co - c).length for v in vs) / len(vs)


def solidify(bm, t):
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=t)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def shirt_cut(bm):
    b = 0.10 / 0.6
    bisect(bm, [((0, 0, 0.63), (0, 0, 1)), ((0, 0, 1.265), (0, 0, 1)),
                ((0.12, 0, 1.27), (1, 0, b)), ((-0.12, 0, 1.27), (1, 0, -b))])
    kill = []
    for f in bm.faces:
        c = f.calc_center_median()
        if c.z < 0.63 or c.z > 1.265 or (c.y < -0.02 and abs(c.x) < open_w(c.z)):
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    solidify(bm, 0.012)


shirt_el = [
    ('ell', V(0, 0.01, 1.05), (0.315, 0.265, 0.26)),
    ('ell', V(0, 0.0, 0.83), (0.365, 0.305, 0.27)),
    ('ell', V(0, 0.04, 0.66), (0.335, 0.30, 0.16)),
    ('ball', V(0, 0.22, 0.70), 0.205),
]
append(metaball(shirt_el, res=0.016, ratio=0.33, post=shirt_cut), 'Shirt', wdist(['hips', 'spine', 'chest']),
       uv=cyl_uv(V(0, 0, 0), V(0, 0, 1), 4, 1.6))
append(torus(V(0, 0.01, 1.25), 0.2, 0.032, keep=lambda p: not (p.y < -0.06 and abs(p.x) < 0.13)), 'Shirt',
       rigid('chest'), uv=cyl_uv(V(0, 0, 0), V(0, 0, 1), 4, 1.6))

# --- placket + camp-collar lapels, buttons, chest pocket (all hug the shirt surface)
BM.verts.ensure_lookup_table()
_shirt_tree = BVHTree.FromBMesh(BM)


def front_patch(tree, z0, z1, x_of, h_of, nu=6, nv=16):
    bm = bmesh.new()
    grid = []
    for j in range(nv + 1):
        v = j / nv
        z = z0 + (z1 - z0) * v
        row = []
        for i in range(nu + 1):
            u = i / nu
            x = x_of(u, z)
            hit, nrm, _, _ = tree.ray_cast(V(x, -2, z), V(0, 1, 0))
            if hit is None:
                hit, nrm = V(x, -0.25, z), V(0, -1, 0)
            row.append(bm.verts.new(hit + nrm * h_of(u, v)))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if sum(f.normal.y for f in bm.faces) > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    solidify(bm, 0.006)
    return bm_to_mesh(bm)


def offset_uv(du, dv):
    fn, rep = cyl_uv(V(0, 0, 0), V(0, 0, 1), 4, 1.6)
    return (lambda co: (fn(co)[0] + du, fn(co)[1] + dv)), rep


shirt_w = wdist(['hips', 'spine', 'chest'])
for s in (L, R):
    def px(u, z, s=s):
        return s * (open_w(z) + 0.002 + u * (0.034 + 0.075 * smoothstep(1.03, 1.262, z)))

    def ph(u, v):
        return 0.006 + 0.004 * (1 - (2 * u - 1) ** 2) + 0.004 * smoothstep(0.6, 1.0, v)
    append(front_patch(_shirt_tree, 0.632, 1.262, px, ph, nu=6, nv=26), 'Shirt', shirt_w, uv=offset_uv(0.31, 0.17))
for z in (0.71, 0.83, 0.95):
    x = -(open_w(z) + 0.02)
    hit, nrm, _, _ = _shirt_tree.ray_cast(V(x, -2, z), V(0, 1, 0))
    append(oval_disc(hit + nrm * 0.017, nrm, 0.017, 0.017, 0.007, seg=16), 'Button', shirt_w)
    for k in (-1, 1):
        append(sphere(hit + nrm * 0.0205 + V(0.005 * k, 0, 0), (0.0035, 0.0035, 0.002), rot=basis(nrm), seg=8,
                      rings=6), 'Brow', shirt_w)


def pocket_h(u, v):
    return 0.002 + 0.005 * min(1.0, 8 * min(u, 1 - u), 8 * min(v, 1 - v)) + (0.003 if v > 0.86 else 0.0)


append(front_patch(_shirt_tree, 0.90, 1.03, lambda u, z: 0.205 + u * 0.085, pocket_h, nu=10, nv=10), 'Shirt',
       shirt_w, uv=offset_uv(0.55, 0.4))

# --- sleeves: shoulder cap + loose short sleeve with a rolled cuff
for s, sn in ((L, 'L'), (R, 'R')):
    sh, el, _, _ = ARM[s]
    Larm = (el - sh).length
    d = (el - sh).normalized()
    cut_co = sh + d * 0.21
    els = [('ball', sh + V(-0.02 * s, 0.0, -0.025), 0.145)]
    els += [('ball', sh + d * t, 0.135) for t in (0.0, 0.06, 0.12, 0.18, 0.24, 0.3)]

    def sleeve_post(bm, co=cut_co, d=d, key=sn):
        bisect(bm, [(co, d)])
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if (f.calc_center_median() - co).dot(d) > 0],
                         context='FACES')
        RINGS['sleeve' + key] = boundary_ring(bm, lambda p: abs((p - co).dot(d)) < 2e-3)
        solidify(bm, 0.012)

    def sleeve_w(p, sh=sh, d=d, sn=sn, Larm=Larm):
        w = smoothstep(-0.02, 0.16, (p - sh).dot(d) / Larm)
        return {f'upper_arm.{sn}': w, 'chest': 1 - w} if 0 < w < 1 else ({f'upper_arm.{sn}': 1.0} if w >= 1 else {'chest': 1.0})

    append(metaball(els, res=0.014, ratio=0.33, post=sleeve_post), 'Shirt', sleeve_w, uv=cyl_uv(sh, d, 2, 1.6))
    rc, rr = RINGS['sleeve' + sn]
    append(torus(rc, rr - 0.004, 0.016, seg=32, ring=8, rot=basis(d)), 'Shirt', rigid(f'upper_arm.{sn}'),
           uv=offset_uv(0.2, 0.3))

# ---------------------------------------------------------------- shorts


def shorts_cut(bm):
    bisect(bm, [((0, 0, 0.43), (0, 0, 1)), ((0, 0, 0.72), (0, 0, 1))])
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not (0.43 < f.calc_center_median().z < 0.72)], context='FACES')
    for s, sn in ((L, 'L'), (R, 'R')):
        RINGS['cuff' + sn] = boundary_ring(bm, lambda p, s=s: abs(p.z - 0.43) < 2e-3 and p.x * s > 0)
    solidify(bm, 0.012)


shorts_el = [('ell', V(0, 0.03, 0.60), (0.345, 0.29, 0.17))]
for s in (L, R):
    hp, kn, _, _ = LEG[s]
    shorts_el += [('ball', hp.lerp(kn, t), 0.152) for t in (0.0, 0.3, 0.55, 0.75)]
append(metaball(shorts_el, res=0.016, ratio=0.33, post=shorts_cut), 'Shorts', wdist(['hips', 'thigh.L', 'thigh.R']))
for sn in 'LR':
    rc, rr = RINGS['cuff' + sn]
    append(torus(rc + V(0, 0, 0.012), rr - 0.002, 0.018, seg=32, ring=8), 'Shorts', rigid(f'thigh.{sn}'))


# ---------------------------------------------------------------- head
head_el = [
    ('ell', V(0, 0.04, 1.62), (0.30, 0.30, 0.25)),
    ('ell', V(0, -0.36, 1.60), (0.27, 0.38, 0.13)),
    ('ell', V(0, -0.66, 1.62), (0.26, 0.16, 0.14)),
    ('ell', V(0, 0.08, 1.45), (0.22, 0.20, 0.12)),
]
for s in (L, R):
    head_el += [
        ('ball', V(0.085 * s, -0.72, 1.72), 0.065),
        ('ball', V(0.13 * s, -0.07, 1.79), 0.12),
        ('ball', V(0.20 * s, 0.0, 1.50), 0.13),
    ]
append(metaball(head_el, ratio=0.4), 'Skin', rigid('head'))

jaw_el = [
    ('ell', V(0, -0.33, 1.33), (0.25, 0.36, 0.085)),
    ('ell', V(0, -0.60, 1.34), (0.23, 0.13, 0.09)),
    ('ell', V(0, 0.0, 1.37), (0.20, 0.15, 0.10)),
]
append(metaball(jaw_el, ratio=0.45), 'Skin', rigid('jaw'))

append(sphere(V(0, -0.34, 1.445), (0.22, 0.40, 0.055)), 'Mouth', mouth_w)
append(sphere(V(0, -0.36, 1.415), (0.15, 0.27, 0.03)), 'Tongue', rigid('jaw'))

# teeth
import itertools
upper = []
for th in np.linspace(-1.75, 1.75, 13):
    upper.append(V(0.232 * math.sin(th), -0.36 - 0.42 * math.cos(th), 1.49))
for s in (L, R):
    upper += [V(0.225 * s, -0.20, 1.485), V(0.215 * s, -0.10, 1.48)]
for p in upper:
    append(cone(p, p + V(0, 0, -0.075), 0.026, 0.0, seg=10), 'Teeth', rigid('head'))
lower = []
for th in np.linspace(-1.6, 1.6, 12):
    lower.append(V(0.205 * math.sin(th), -0.34 - 0.39 * math.cos(th), 1.40))
for s in (L, R):
    lower += [V(0.2 * s, -0.17, 1.40)]
for p in lower:
    append(cone(p, p + V(0, 0, 0.062), 0.022, 0.0, seg=10), 'Teeth', rigid('jaw'))

# eyes, lids, brows, nostrils
for s, sn in ((L, 'L'), (R, 'R')):
    c = EYE[s]
    append(sphere(c, (EYE_R,) * 3, seg=28, rings=18), 'EyeWhite', rigid('head'))
    d = V(-0.18 * s, -1, 0.06).normalized()
    append(sphere(c + d * (EYE_R - 0.012), (0.048, 0.048, 0.022), rot=basis(d)), 'Pupil', rigid('head'))
    sd = (d * EYE_R + V(0.016, 0, 0.022)).normalized()
    append(sphere(c + sd * (EYE_R + 0.011), (0.013, 0.013, 0.004), rot=basis(sd), seg=12, rings=8), 'EyeWhite',
           rigid('head'))
    LID_CUT = 0.5
    lid_rot = Euler((math.radians(-8), 0, 0)).to_matrix()
    append(sphere(c, (EYE_R + 0.012,) * 3, rot=lid_rot, seg=32, rings=20, cut_below=LID_CUT), 'Skin',
           rigid(f'lid.{sn}'))
    # lid rim (thicker lip along the lower edge of the lid), front half only
    rim_c = c + lid_rot @ V(0, 0, LID_CUT * (EYE_R + 0.012))
    rim_r = (EYE_R + 0.012) * math.sqrt(1 - LID_CUT ** 2)
    append(torus(rim_c, rim_r, 0.008, seg=36, ring=8, rot=lid_rot, keep=lambda p, cy=c.y: p.y < cy - 0.01), 'Skin',
           rigid(f'lid.{sn}'))
    brow_rot = Euler((math.radians(-10), math.radians(14 * s), 0)).to_matrix()
    append(sphere(c + V(0.01 * s, -0.02, 0.128), (0.09, 0.032, 0.026), rot=brow_rot), 'Brow', rigid('head'))
    nd = V(0, -0.45, 1).normalized()
    append(sphere(V(0.085 * s, -0.72, 1.72) + nd * 0.058, (0.028, 0.02, 0.014), rot=basis(nd)), 'Nostril',
           rigid('head'))

# sunglasses resting on the snout
n = V(0, -0.8, 0.6).normalized()
for s in (L, R):
    c = V(0.135 * s, -0.34, 1.795)
    append(oval_disc(c, n, 0.112, 0.074, 0.016), 'Frame', rigid('head'))
    append(oval_disc(c + n * 0.007, n, 0.098, 0.062, 0.008), 'Lens', rigid('head'), smooth=False)
    append(cone(c + V(0.105 * s, 0.0, 0.0), V(0.27 * s, 0.02, 1.70), 0.011, 0.011, seg=8), 'Frame',
           rigid('head'))
append(cone(V(-0.03, -0.345, 1.81), V(0.03, -0.345, 1.81), 0.012, 0.012, seg=8), 'Frame', rigid('head'))

# ---------------------------------------------------------------- arms + hands
for s, sn in ((L, 'L'), (R, 'R')):
    sh, el, wr, fi = ARM[s]
    append(metaball(chain([sh, el, wr], [0.1, 0.082, 0.068], step=0.03), ratio=0.45), 'Skin',
           wdist([f'upper_arm.{sn}', f'forearm.{sn}']))
    hand = [('ell', fi, (0.068, 0.062, 0.078))]
    claws = []
    inward = -s  # direction (x) towards the body centre
    for k in range(4):
        fz = fi.z + 0.05 - k * 0.034
        fp = V(fi.x + 0.018 * inward, fi.y - 0.058, fz)
        hand.append(('ball', fp, 0.031))
        claws.append((fp + V(0.028 * inward, -0.012, 0), fp + V(0.06 * inward, -0.004, -0.012)))
    hand.append(('ball', V(fi.x + 0.03 * inward, fi.y - 0.02, fi.z + 0.075), 0.032))
    append(metaball(hand, res=0.012, ratio=0.5), 'Skin', rigid(f'hand.{sn}'))
    for a, b in claws:
        append(cone(a, b, 0.012, 0.0, seg=8), 'Claw', rigid(f'hand.{sn}'))

# martini glass in the right hand
fi = ARM[R][3]
gx, gy = fi.x, fi.y - 0.01
foot_z, bowl_z, top_z = fi.z - 0.11, fi.z + 0.13, fi.z + 0.30
hand_r = rigid('hand.R')
append(cone(V(gx, gy, foot_z), V(gx, gy, foot_z + 0.012), 0.068, 0.064, seg=28), 'Glass', hand_r)
append(cone(V(gx, gy, foot_z), V(gx, gy, bowl_z + 0.01), 0.011, 0.011, seg=12), 'Glass', hand_r)
append(cone(V(gx, gy, bowl_z), V(gx, gy, top_z), 0.012, 0.15, seg=32, caps=False), 'Glass', hand_r)
append(cone(V(gx, gy, bowl_z + 0.008), V(gx, gy, top_z - 0.03), 0.006, 0.122, seg=32), 'Drink', hand_r)
pick_a, pick_b = V(gx + 0.02, gy, bowl_z + 0.05), V(gx - 0.14, gy + 0.01, top_z + 0.11)
append(cone(pick_a, pick_b, 0.006, 0.006, seg=6), 'Pick', hand_r)
append(sphere(pick_a.lerp(pick_b, 0.35), (0.028,) * 3), 'Drink', hand_r)  # olive-ish cherry
bmf = bmesh.new()
t0 = pick_b
v1 = bmf.verts.new(t0)
v2 = bmf.verts.new(t0 + V(0.02, 0.0, -0.075))
v3 = bmf.verts.new(t0 + V(-0.07, 0.0, -0.045))
bmf.faces.new((v1, v2, v3))
append(bm_to_mesh(bmf), 'Flag', hand_r, smooth=False)

# ---------------------------------------------------------------- legs + feet
for s, sn in ((L, 'L'), (R, 'R')):
    hp, kn, an, toe = LEG[s]
    append(metaball(chain([hp, kn, an], [0.128, 0.11, 0.094], step=0.03), ratio=0.45), 'Skin',
           wdist([f'thigh.{sn}', f'shin.{sn}']))
    foot = [('ell', V(an.x, -0.07, 0.072), (0.115, 0.16, 0.072))]
    for dx in (-0.065, 0.0, 0.065):
        foot.append(('ball', V(an.x + dx, -0.205, 0.05), 0.048))
    append(metaball(foot, res=0.014, ratio=0.5), 'Skin', rigid(f'foot.{sn}'))
    for dx in (-0.065, 0.0, 0.065):
        append(cone(V(an.x + dx * 1.05, -0.235, 0.05), V(an.x + dx * 1.12, -0.30, 0.015), 0.025, 0.0, seg=10),
               'Claw', rigid(f'foot.{sn}'))

# ---------------------------------------------------------------- scutes (back ridge bumps on tail + head)
BM.verts.ensure_lookup_table()
_full_tree = BVHTree.FromBMesh(BM)
for k, (_, p, r) in enumerate(chain(TAIL_PTS, TAIL_RAD, step=0.055)):
    if p.y < 0.5 or k % 1:
        continue
    hit, nrm, _, _ = _full_tree.ray_cast(V(p.x, p.y, 3), V(0, 0, -1))
    if hit is None:
        continue
    sz = 0.012 + 0.2 * r
    tang = (TAIL_PTS[-1] - TAIL_PTS[0]).normalized()
    rot = basis(nrm, x_hint=nrm.cross(tang) if nrm.cross(tang).length > 1e-3 else V(1, 0, 0))
    append(sphere(hit - nrm * sz * 0.25, (sz * 0.6, sz * 1.15, sz * 0.75), rot=rot, seg=12, rings=8), 'Scute',
           torso_w)
for y in (0.06, 0.17, 0.27):
    hit, nrm, _, _ = _full_tree.ray_cast(V(0, y, 3), V(0, 0, -1))
    append(sphere(hit - nrm * 0.008, (0.022, 0.034, 0.02), rot=basis(nrm, V(1, 0, 0)), seg=12, rings=8), 'Scute',
           rigid('head'))

# ----------------------------------------------------------------------------- finalize mesh
me = bpy.data.meshes.new('GatorMesh')
BM.normal_update()
BM.to_mesh(me)
BM.free()
for m in MATLIST:
    me.materials.append(MATERIALS[m])
body = bpy.data.objects.new('Gator', me)
scene.collection.objects.link(body)
for g in GROUPS:
    body.vertex_groups.new(name=g)
print(f'MESH verts={len(me.vertices)} tris={sum(len(p.vertices) - 2 for p in me.polygons)} groups={len(GROUPS)}')

# ----------------------------------------------------------------------------- armature
arm_data = bpy.data.armatures.new('GatorRig')
arm = bpy.data.objects.new('GatorRig', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, h, t, parent, deform in BONEDEF:
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail, eb.roll = h, t, 0.0
    eb.use_deform = deform
for name, h, t, parent, deform in BONEDEF:
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
arm_data.display_type = 'STICK'
body.parent = arm
mod = body.modifiers.new('Armature', 'ARMATURE')
mod.object = arm

# ----------------------------------------------------------------------------- animation
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'


class Pose(dict):
    def r(self, bone, x=0.0, y=0.0, z=0.0):
        d = self.setdefault(bone, [V(0, 0, 0), V(0, 0, 0)])
        d[0] += V(x, y, z)
        return self

    def l(self, bone, x=0.0, y=0.0, z=0.0):
        d = self.setdefault(bone, [V(0, 0, 0), V(0, 0, 0)])
        d[1] += V(x, y, z)
        return self


def apply_pose(pose):
    for pb in arm.pose.bones:
        Rm = pb.bone.matrix_local.to_3x3()
        rot, loc = pose.get(pb.name, (V(0, 0, 0), V(0, 0, 0)))
        W = Euler([math.radians(a) for a in rot], 'XYZ').to_matrix()
        pb.rotation_quaternion = (Rm.inverted() @ W @ Rm).to_quaternion()
        pb.location = Rm.inverted() @ loc


def S(x):
    return math.sin(2 * math.pi * x)


def C(x):
    return math.cos(2 * math.pi * x)


THIGH = (LEG[L][0] - LEG[L][1]).length
SHIN = (LEG[L][1] - LEG[L][2]).length


def leg_bend(p, sn, a, swing=0.0, lift=0.0):
    """Bend a leg: a = knee crouch (deg), swing = thigh forward swing (deg), lift = extra knee bend."""
    p.r(f'thigh.{sn}', x=-a - swing)
    p.r(f'shin.{sn}', x=2 * a + lift)
    p.r(f'foot.{sn}', x=-a + swing - lift * 0.6)


def crouch_drop(a):
    return (THIGH + SHIN) * (1 - math.cos(math.radians(a)))


def blink(t, at, w=0.05):
    return max(0.0, 1 - abs(t - at) / w)


def ease(t):
    return t * t * (3 - 2 * t)


def anim_idle(t):
    p = Pose()
    b = S(t)
    p.r('spine', x=1.5 * b).r('chest', x=-2.5 * b).l('hips', z=0.004 * b)
    p.r('neck', x=1.0 * S(t + 0.1))
    p.r('head', x=2.5 * S(2 * t), z=6 * S(t), y=2 * S(t + 0.25))
    p.r('jaw', x=4 + 3 * S(2 * t))
    for i, n in enumerate(TAIL):
        p.r(n, z=7 * S(t - 0.1 * i), x=1.5 * S(2 * t - 0.1 * i))
    p.r('upper_arm.R', x=3 * S(t)).r('forearm.R', x=-4 * S(t + 0.15)).r('hand.R', y=4 * S(t + 0.3))
    p.r('upper_arm.L', y=-3 * S(t)).r('forearm.L', x=-3 * S(t + 0.2))
    k = blink(t, 0.62) + blink(t, 0.72)
    p.r('lid.L', x=78 * min(k, 1)).r('lid.R', x=78 * min(k, 1))
    for sn in 'LR':
        leg_bend(p, sn, 2 + 1.5 * b)
    p.l('hips', z=-crouch_drop(2 + 1.5 * b))
    return p


def anim_walk(t):
    p = Pose()
    sp, cp = S(t), C(t)
    for sn, sgn in (('L', 1), ('R', -1)):
        swing = 26 * sp * sgn
        lift = 40 * max(0.0, cp * sgn)
        leg_bend(p, sn, 6, swing=swing, lift=lift)
    p.l('hips', z=-crouch_drop(6) + 0.018 * C(2 * t) - 0.012)
    p.r('hips', y=5 * sp, z=-8 * sp)
    p.r('spine', x=4).r('chest', y=-3 * sp, z=11 * sp)
    p.r('head', x=-2 + 2 * C(2 * t), y=-2 * sp, z=-4 * sp)
    p.r('jaw', x=5)
    p.r('upper_arm.L', x=24 * sp, y=4).r('forearm.L', x=-12 - 10 * sp)
    p.r('upper_arm.R', x=-7 * sp).r('forearm.R', x=3 * sp)
    for i, n in enumerate(TAIL):
        p.r(n, z=12 * S(t - 0.08 * (i + 1)), x=2)
    k = blink(t, 0.4, 0.07)
    p.r('lid.L', x=78 * k).r('lid.R', x=78 * k)
    return p


def anim_run(t):
    p = Pose()
    sp, cp = S(t), C(t)
    for sn, sgn in (('L', 1), ('R', -1)):
        swing = 48 * sp * sgn + 8
        lift = 75 * max(0.0, cp * sgn)
        leg_bend(p, sn, 12, swing=swing, lift=lift)
    p.l('hips', z=-crouch_drop(12) + 0.035 * C(2 * t), y=0.0)
    p.r('hips', y=6 * sp, z=-12 * sp)
    p.r('spine', x=12).r('chest', x=6, z=16 * sp)
    p.r('head', x=-14 + 3 * C(2 * t), z=-6 * sp)
    p.r('jaw', x=10 + 4 * C(2 * t))
    p.r('upper_arm.L', x=42 * sp - 5, y=8).r('forearm.L', x=-45)
    p.r('upper_arm.R', x=-14 * sp).r('forearm.R', x=6 * sp)
    for i, n in enumerate(TAIL):
        p.r(n, z=16 * S(t - 0.1 * (i + 1)), x=6)
    return p


RIM0, FOOT0 = V(gx, gy, top_z), V(gx, gy, foot_z)


def solve_glass(target, axis_want):
    """Tiny coordinate-descent IK: bring the glass rim to `target` with the glass axis along `axis_want`."""
    names = [('upper_arm.R', 'x'), ('upper_arm.R', 'y'), ('upper_arm.R', 'z'), ('forearm.R', 'x'),
             ('forearm.R', 'z'), ('hand.R', 'x'), ('hand.R', 'y')]
    axis_want = axis_want.normalized()

    def cost(vs):
        p = Pose()
        for (b, ax), v in zip(names, vs):
            p.r(b, **{ax: v})
        apply_pose(p)
        bpy.context.view_layer.update()
        pb = arm.pose.bones['hand.R']
        M = pb.matrix @ pb.bone.matrix_local.inverted()
        rim, foot = M @ RIM0, M @ FOOT0
        elbow = arm.pose.bones['forearm.R'].head
        c = (rim - target).length_squared * 100 + (1 - (rim - foot).normalized().dot(axis_want)) * 3
        c += 2e-5 * sum(v * v for v in vs) + max(0.0, elbow.x + 0.36) ** 2 * 200
        return c

    vals, step = [0.0] * len(names), 16.0
    best = cost(vals)
    while step > 0.2:
        improved = False
        for i in range(len(vals)):
            for d in (step, -step):
                t = vals[:]
                t[i] += d
                c = cost(t)
                if c < best:
                    best, vals, improved = c, t, True
        if not improved:
            step /= 2
    print('DRINK solve cost', round(best, 5), [round(v, 1) for v in vals])
    apply_pose(Pose())
    return list(zip(names, vals))


DRINK_ARM = solve_glass(V(-0.36, -0.50, 1.53), V(0.55, 0.0, 1.0))


def anim_drink(t):
    p = Pose()
    e = ease(smoothstep(0.08, 0.32, t)) * (1 - ease(smoothstep(0.72, 0.95, t)))
    sip = e * S(3 * t) * 0.5 if 0.32 < t < 0.72 else 0.0
    for (b, ax), v in DRINK_ARM:
        p.r(b, **{ax: v * e})
    p.r('hand.R', y=8 * sip)
    p.r('neck', x=-6 * e).r('head', x=-20 * e + 3 * sip, z=-14 * e, y=6 * e)
    p.r('jaw', x=4 + 12 * e)
    p.r('chest', x=-4 * e, z=-6 * e)
    p.r('upper_arm.L', y=-6 * e).r('forearm.L', x=-10 * e)
    k = blink(t, 0.5, 0.18)
    p.r('lid.L', x=55 * min(1, k * 2)).r('lid.R', x=55 * min(1, k * 2))  # eyes closed, enjoying it
    for i, n in enumerate(TAIL):
        p.r(n, z=8 * S(t - 0.1 * i) * (0.4 + e))
    for sn in 'LR':
        leg_bend(p, sn, 2)
    p.l('hips', z=-crouch_drop(2))
    return p


def anim_dance(t):
    p = Pose()
    sway, beat = S(t), S(2 * t)
    bend = 6 + 10 * (0.5 - 0.5 * C(2 * t))
    for sn, sgn in (('L', 1), ('R', -1)):
        leg_bend(p, sn, bend)
        p.r(f'thigh.{sn}', y=-7 * sway)
        p.r(f'foot.{sn}', y=7 * sway)
    p.l('hips', x=0.05 * sway, z=-crouch_drop(bend))
    p.r('hips', y=7 * sway)
    p.r('spine', y=-6 * sway).r('chest', y=-8 * sway, z=10 * S(t + 0.25))
    p.r('head', x=7 * max(0.0, beat), y=-6 * sway, z=8 * S(t + 0.25))
    p.r('jaw', x=8 + 6 * max(0.0, beat))
    p.r('upper_arm.L', y=-75 - 18 * beat, x=-10).r('forearm.L', y=-30, x=-30 - 15 * beat)
    p.r('upper_arm.R', y=18 + 10 * beat, x=-6 * sway).r('forearm.R', x=-6 * beat)
    for i, n in enumerate(TAIL):
        p.r(n, z=20 * S(t - 0.1 * (i + 1)), x=4 + 3 * beat)
    k = blink(t, 0.5, 0.05)
    p.r('lid.L', x=78 * k).r('lid.R', x=78 * k)
    return p


def anim_jump(t):
    p = Pose()
    # 0-.22 crouch, .22-.32 push, .32-.72 air, .72-.86 land, .86-1 recover
    if t < 0.22:
        c = ease(t / 0.22)
        h = 0
    elif t < 0.32:
        c = 1 - ease((t - 0.22) / 0.1)
        h = 0
    elif t < 0.72:
        u = (t - 0.32) / 0.4
        c = 0
        h = 4 * u * (1 - u)
    elif t < 0.86:
        c = ease((t - 0.72) / 0.14) * 0.8
        h = 0
    else:
        c = 0.8 * (1 - ease((t - 0.86) / 0.14))
        h = 0
    air = h
    a = 38 * c + 4
    for sn in 'LR':
        leg_bend(p, sn, a, lift=25 * air)
    p.l('hips', z=-crouch_drop(a) + 0.55 * h)
    p.r('spine', x=10 * c - 6 * air).r('chest', x=6 * c)
    p.r('head', x=-6 * c - 8 * air)
    p.r('jaw', x=5 + 14 * air)
    p.r('upper_arm.L', y=-55 * air, x=25 * c).r('forearm.L', x=-30 * air)
    p.r('upper_arm.R', x=10 * c - 10 * air, y=12 * air)
    for i, n in enumerate(TAIL):
        p.r(n, x=-6 * c + 10 * air)
    return p


def anim_attack(t):
    """Wind up, lunge with a big bite, swing the tail, recover."""
    p = Pose()
    wind = ease(smoothstep(0.0, 0.28, t)) * (1 - ease(smoothstep(0.28, 0.42, t)))
    lunge = ease(smoothstep(0.28, 0.42, t)) * (1 - ease(smoothstep(0.55, 1.0, t)))
    bite = smoothstep(0.1, 0.3, t) * (1 - smoothstep(0.38, 0.46, t))
    p.r('spine', x=-10 * wind + 16 * lunge).r('chest', x=-8 * wind + 12 * lunge, z=-10 * wind + 14 * lunge)
    p.r('head', x=-14 * wind + 16 * lunge)
    p.r('jaw', x=4 + 34 * bite)
    p.r('upper_arm.L', x=-30 * wind + 20 * lunge, y=-20 * wind).r('forearm.L', x=-40 * wind)
    p.r('upper_arm.R', y=12 * wind)
    for sn in 'LR':
        leg_bend(p, sn, 6 + 10 * wind + 6 * lunge)
    leg_bend(p, 'L', 0, swing=18 * lunge)
    p.l('hips', y=-0.12 * lunge, z=-crouch_drop(6 + 10 * wind + 6 * lunge))
    for i, n in enumerate(TAIL):
        p.r(n, z=(-25 * wind + 45 * lunge) * (0.6 + 0.15 * i), x=6 * lunge)
    return p


def anim_fall(t):
    """Knocked over onto the back (play it reversed to get up)."""
    p = Pose()
    e = ease(smoothstep(0.0, 0.55, t))
    b = math.sin(math.pi * smoothstep(0.5, 0.8, t)) * 0.15  # little bounce on landing
    p.l('hips', y=0.35 * e, z=-0.42 * e + 0.05 * b)
    p.r('hips', x=-78 * e)
    p.r('spine', x=10 * e).r('chest', x=6 * e)
    p.r('head', x=18 * e - 10 * b, z=8 * e)
    p.r('jaw', x=4 + 20 * e)
    p.r('upper_arm.L', y=-60 * e, x=-20 * e).r('upper_arm.R', y=50 * e, x=-20 * e)
    p.r('forearm.L', x=-20 * e)
    for sn in 'LR':
        p.r(f'thigh.{sn}', x=-35 * e)
        p.r(f'shin.{sn}', x=25 * e)
    for i, n in enumerate(TAIL):
        p.r(n, x=(18 if i == 0 else 6) * e)
    p.r('lid.L', x=60 * e).r('lid.R', x=60 * e)
    return p


def anim_swim(t):
    """Gator crawl: body flat on the water, tail sweeping side to side, legs kicking, martini kept dry."""
    p = Pose()
    s, c = S(t), C(t)
    p.r('hips', x=72, z=4 * s).l('hips', z=-0.25 + 0.02 * S(2 * t))
    p.r('spine', x=-6, z=-3 * s).r('chest', x=-8, z=-4 * s)
    p.r('neck', x=-30).r('head', x=-34 + 3 * S(2 * t), z=3 * s).r('jaw', x=6)
    for i, n in enumerate(TAIL):
        p.r(n, x=(-62 if i == 0 else 3), z=(16 + 7 * i) * S(t - 0.12 * (i + 1)))
    for sn, sgn in (('L', 1), ('R', -1)):
        p.r(f'thigh.{sn}', x=8 + 22 * s * sgn)
        p.r(f'shin.{sn}', x=12 + 18 * max(0.0, c * sgn))
        p.r(f'foot.{sn}', x=35)
    # left arm paddles
    p.r('upper_arm.L', x=-30 + 45 * s, y=-20).r('forearm.L', x=-20 - 25 * max(0.0, c))
    # right arm: undo the body's tilt so the glass stays upright, above the water
    p.r('upper_arm.R', x=-58, y=10).r('forearm.R', x=-4 * s)
    k = blink(t, 0.5, 0.05)
    p.r('lid.L', x=78 * k).r('lid.R', x=78 * k)
    return p


def anim_tread(t):
    """Treading water: upright-ish, slow kicks, paddling, tail sculling."""
    p = Pose()
    s = S(t)
    p.r('hips', x=30).l('hips', z=-0.3 + 0.03 * s)
    p.r('chest', x=-8).r('neck', x=-6).r('head', x=-12 + 2 * S(2 * t), z=8 * S(t + 0.2)).r('jaw', x=4)
    for i, n in enumerate(TAIL):
        p.r(n, x=(-25 if i == 0 else 2), z=12 * S(t - 0.1 * i))
    for sn, sgn in (('L', 1), ('R', -1)):
        p.r(f'thigh.{sn}', x=-20 + 25 * s * sgn).r(f'shin.{sn}', x=30 + 15 * S(t + 0.25) * sgn).r(f'foot.{sn}', x=10)
    p.r('upper_arm.L', y=-35 - 15 * s, x=-10).r('forearm.L', x=-20 - 10 * S(t + 0.25))
    p.r('upper_arm.R', x=-22, y=8)
    k = blink(t, 0.7, 0.05)
    p.r('lid.L', x=78 * k).r('lid.R', x=78 * k)
    return p


ANIMS = [('Idle', anim_idle, 72), ('Walk', anim_walk, 32), ('Run', anim_run, 20), ('Drink', anim_drink, 90),
         ('Dance', anim_dance, 48), ('Jump', anim_jump, 42), ('Attack', anim_attack, 20), ('Fall', anim_fall, 36),
         ('Swim', anim_swim, 36), ('Tread', anim_tread, 48)]

arm.animation_data_create()
ACTIONS = {}
for name, fn, nf in ANIMS:
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for f in range(0, nf + 1):
        apply_pose(fn(f / nf))
        for pb in arm.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=f, group=pb.name)
            pb.keyframe_insert('location', frame=f, group=pb.name)
    try:
        act.use_frame_range = True
        act.frame_start, act.frame_end = 0, nf
    except Exception:
        pass
    ACTIONS[name] = act


def set_action(name):
    act = ACTIONS[name]
    arm.animation_data.action = act
    try:
        if act.slots and arm.animation_data.action_slot is None:
            arm.animation_data.action_slot = act.slots[0]
    except Exception:
        pass


# ----------------------------------------------------------------------------- preview renders
if RENDER_DIR:
    os.makedirs(RENDER_DIR, exist_ok=True)
    scene.render.engine = 'BLENDER_WORKBENCH'
    sh = scene.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    try:
        sh.show_cavity = True
    except Exception:
        pass
    world = bpy.data.worlds.new('W')
    world.color = (0.12, 0.05, 0.12)
    scene.world = world
    scene.render.resolution_x, scene.render.resolution_y = 560, 700
    cam_d = bpy.data.cameras.new('cam')
    cam_d.lens = 70
    cam = bpy.data.objects.new('cam', cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shot(fname, loc, target=V(0, -0.05, 1.0)):
        cam.location = loc
        cam.rotation_euler = (target - V(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(RENDER_DIR, fname + '.png')
        bpy.ops.render.render(write_still=True)

    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = V(0, 0, 0)
    views = {'front': V(0, -5.2, 1.2), 'side': V(-5.2, -0.2, 1.2), 'q34': V(-3.4, -4.0, 1.9), 'back': V(3.2, 4.0, 1.9)}
    want = os.environ.get('GATOR_VIEWS', 'front,side,q34,back').split(',')
    for k in want:
        if k in views:
            shot('rest_' + k, views[k])
    for spec in os.environ.get('GATOR_POSES', '').split(','):
        if not spec:
            continue
        an, fr, vw = spec.split(':')
        set_action(an)
        scene.frame_set(int(fr))
        shot(f'pose_{an}_{fr}_{vw}', views[vw])
    arm.animation_data.action = None
    scene.camera = None
    bpy.data.objects.remove(cam)

# ----------------------------------------------------------------------------- export
set_action('Idle')
scene.frame_set(0)
bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backups
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, 'gator.blend'))
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT_DIR, 'gator.glb'),
    export_format='GLB',
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_skins=True,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
)
print('EXPORTED', os.path.join(OUT_DIR, 'gator.glb'))
