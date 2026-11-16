import bpy
import json
import math
import os
import re
import sys
import unicodedata
from mathutils import Vector


def args_after_double_dash():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for i in range(0, len(args), 2): out[args[i].lstrip('-')] = args[i + 1]
    return out


ARGS = args_after_double_dash()
CATALOG = os.path.abspath(ARGS.get('catalog', 'output/blender-model-catalog.json'))
OUT = os.path.abspath(ARGS.get('out', 'public/models'))
IMAGE_ROOT = os.path.abspath(ARGS.get('images', 'public'))
os.makedirs(OUT, exist_ok=True)


def normal(value):
    return ''.join(ch for ch in unicodedata.normalize('NFD', str(value or '').lower()) if unicodedata.category(ch) != 'Mn')


def mat(name, color, rough=.68, metal=0.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    return material


def sample_reference_color(path, fallback):
    if not path or not os.path.isfile(path): return fallback
    try:
        image = bpy.data.images.load(path, check_existing=True)
        width, height = image.size
        pixels = image.pixels
        samples = []
        for gy in range(6):
            y = int(height * (.24 + gy * .075))
            for gx in range(6):
                x = int(width * (.24 + gx * .105))
                pos = (y * width + x) * 4
                rgb = tuple(float(pixels[pos + i]) for i in range(3))
                luminance = sum(rgb) / 3
                if .10 < luminance < .76 and max(rgb) - min(rgb) < .43:
                    samples.append(rgb)
        if not samples: return fallback
        # The central lower crop usually contains the product, not a white studio wall.
        color = tuple(sorted(c[i] for c in samples)[len(samples) // 2] for i in range(3))
        mean = sum(color) / 3
        return tuple(max(.08, min(.86, .72 * c + .28 * mean)) for c in color)
    except Exception:
        return fallback


def product_palette(product):
    text = normal(product['name'] + ' ' + product.get('description', '') + ' ' + product.get('material', ''))
    wood = (.34, .20, .105)
    if any(word in text for word in ('carvalho natural', 'madeira clara', 'freixo')): wood = (.48, .32, .18)
    if any(word in text for word in ('nogueira', 'madeira escura')): wood = (.25, .145, .085)
    if 'branco' in text or 'white' in text: wood = (.78, .75, .68)
    metal_color = (.10, .11, .105) if not any(word in text for word in ('dourado', 'laton', 'ouro')) else (.55, .36, .12)
    fabric = (.54, .49, .42)
    for word, color in [('azul', (.13, .30, .46)), ('verde', (.29, .36, .27)), ('terracota', (.52, .22, .14)), ('ocre', (.56, .35, .09)), ('rosa', (.56, .32, .30)), ('cinzento', (.42, .43, .42)), ('preto', (.075, .075, .07)), ('areia', (.65, .57, .45)), ('branco', (.76, .74, .67))]:
        if word in text: fabric = color
    fallback = fabric if any(word in text for word in ('tecido', 'algodao', 'linho', 'veludo', 'corda', 'tapete', 'almofada')) else wood
    source = os.path.join(IMAGE_ROOT, product.get('image', ''))
    photo_color = sample_reference_color(source, fallback)
    return {
        'wood': mat('Madeira - ' + product['slug'], wood, .46),
        'wood_light': mat('Madeira clara - ' + product['slug'], tuple(min(.9, c * 1.25) for c in wood), .52),
        'metal': mat('Metal - ' + product['slug'], metal_color, .29, .72),
        'fabric': mat('Tecido de referência - ' + product['slug'], photo_color, .88),
        'fabric_light': mat('Tecido claro - ' + product['slug'], tuple(min(.92, c * 1.19) for c in photo_color), .9),
        'ceramic': mat('Cerâmica - ' + product['slug'], photo_color, .31),
        'glass': mat('Vidro - ' + product['slug'], (.69, .79, .80), .16, .15),
        'dark': mat('Detalhes - ' + product['slug'], (.07, .075, .07), .42, .28),
        'leaf': mat('Folhagem - ' + product['slug'], (.17, .32, .15), .82),
        'accent': mat('Acento - ' + product['slug'], (.28, .39, .50), .74),
        'accent2': mat('Segundo acento - ' + product['slug'], (.63, .34, .13), .82),
    }


def dimensions(product, kind):
    text = product.get('dimensions', '') + ' ' + product.get('description', '')
    text = normal(text)
    product_name = normal(product.get('name', ''))
    if 'secretaria traco' in product_name or 'escrivaninha' in product_name:
        return 1.20, .60, .75
    if 'consola memoria' in product_name:
        return 1.18, .42, .78
    if 'espelho' in product_name:
        size = re.search(r'(\d{1,3}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,3}(?:[.,]\d+)?)\s*cm', text, re.I)
        if size: return float(size.group(1).replace(',', '.')) / 100, .065, float(size.group(2).replace(',', '.')) / 100
        return .50, .065, .70
    if 'candeeiro de pe' in product_name:
        if 'linha' in product_name:
            return .28, .28, 1.45
        return .38, .38, 1.25
    if 'conjunto de 4' in product_name and 'pratos alegria' in product_name:
        return .30, .30, .12
    number = r'(\d{1,3}(?:[.,]\d+)?)'
    defaults = {'seating': (1.8, .78, .82), 'table': (1.0, .62, .74), 'storage': (1.0, .40, 1.05), 'light': (.38, .38, 1.0), 'decor': (.26, .26, .34), 'rug': (1.4, 1.1, .025), 'textile': (.45, .45, .09), 'bed': (1.8, 2.0, .48), 'tableware': (.24, .24, .12)}
    fallback = defaults.get(kind, (.7, .5, .6))
    diameter = re.search(r'(?:ø|diametro)\s*' + number + r'(?:\s*[×x]\s*' + number + r')?\s*cm', text, re.I)
    if diameter:
        values = [float(x.replace(',', '.')) / 100 for x in diameter.groups() if x]
        return values[0], values[0], values[1] if len(values) > 1 else fallback[2]
    size = re.search(number + r'\s*[×x]\s*' + number + r'(?:\s*[×x]\s*' + number + r')?\s*cm', text, re.I)
    if size:
        values = [float(x.replace(',', '.')) / 100 for x in size.groups() if x]
        if len(values) >= 3: return values[0], values[1], values[2]
        if len(values) == 2: return values[0], values[1], fallback[2]
    plural_heights = re.search(r'alturas\s*:?\s*([0-9., e]+)\s*cm', text, re.I)
    if plural_heights:
        heights = re.findall(number, plural_heights.group(1))
        if heights:
            height = max(float(value.replace(',', '.')) for value in heights) / 100
            return min(.60, max(.12, height * .33)), min(.60, max(.12, height * .30)), height
    height_match = re.search(r'altura(?: maxima)?\s*:?\s*' + number + r'\s*cm', text, re.I)
    if height_match:
        height = float(height_match.group(1).replace(',', '.')) / 100
        return min(.60, max(.12, height * .33)), min(.60, max(.12, height * .30)), height
    width_match = re.search(r'(?:largura|comprimento|diametro)\s*:?\s*' + number + r'\s*cm', text, re.I)
    if width_match:
        return float(width_match.group(1).replace(',', '.')) / 100, fallback[1], fallback[2]
    return fallback


def kind_of(product):
    text = normal(product['name'] + ' ' + product.get('description', '') + ' ' + product.get('category', ''))
    product_name = normal(product.get('name', ''))
    # Product descriptions can mention a sofa/chair as styling context; the catalog name owns the model category.
    if any(word in product_name for word in ('almofada', 'manta', 'colcha', 'edredao', 'textil', 'tecido')): return 'textile'
    if 'conjunto de 4' in product_name and 'pratos' in product_name: return 'tableware'
    if 'secretaria' in product_name or 'escrivaninha' in product_name: return 'table'
    if 'consola' in product_name or 'aparador' in product_name: return 'storage'
    if 'espelho' in product_name or 'jarra' in product_name or 'vela' in product_name: return 'decor'
    if 'candeeiro' in product_name or 'lampada' in product_name: return 'light'
    if 'poltrona' in product_name or 'cadeira' in product_name or 'sofa' in product_name: return 'seating'
    if any(word in text for word in ('sofa', 'poltrona', 'cadeira', 'banco', 'banqueta', 'puff', 'banqueta')): return 'seating'
    if any(word in text for word in ('candeeiro', 'lampada', 'aplique', 'suspensao', 'lanterna')): return 'light'
    if any(word in text for word in ('tapete', 'passadeira')): return 'rug'
    if any(word in text for word in ('almofada', 'manta', 'colcha', 'edredao', 'textil', 'tecido')): return 'textile'
    if any(word in text for word in ('cama', 'colchao', 'cabeceira')): return 'bed'
    if any(word in text for word in ('secretaria', 'escrivaninha')): return 'table'
    if any(word in text for word in ('jarra', 'vaso', 'planta', 'cesto', 'vela', 'espelho', 'castical', 'tabuleiro', 'escultura')): return 'decor'
    if any(word in text for word in ('caneca', 'copo', 'chavena', 'taca', 'prato', 'servico', 'pires')): return 'tableware'
    if any(word in text for word in ('estante', 'armario', 'aparador', 'consola', 'secretaria', 'arrumacao', 'gaveta', 'sapateira')): return 'storage'
    return 'table'


def cube(name, location, scale, material, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object; obj.name = name; obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new('Arestas suaves', 'BEVEL'); mod.width = min(bevel, min(scale) * .22); mod.segments = 3
        obj.modifiers.new('Normais suaves', 'WEIGHTED_NORMAL')
    return obj


def cylinder(name, location, radius, depth, material, vertices=32, radius2=None):
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius2, depth=depth, location=location)
    obj = bpy.context.object; obj.name = name; obj.data.materials.append(material)
    obj.modifiers.new('Normais suaves', 'WEIGHTED_NORMAL')
    return obj


def sphere(name, location, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=location)
    obj = bpy.context.object; obj.name = name; obj.scale = scale; obj.data.materials.append(material)
    bpy.ops.object.shade_smooth(); return obj


def torus(name, location, major, minor, material, rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32, minor_segments=8, location=location, rotation=rotation or (0, 0, 0))
    obj = bpy.context.object; obj.name = name; obj.data.materials.append(material); bpy.ops.object.shade_smooth(); return obj


def rod(name, start, end, radius, material):
    direction = Vector(end) - Vector(start); mid = (Vector(start) + Vector(end)) / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=direction.length, location=mid)
    obj = bpy.context.object; obj.name = name; obj.rotation_mode = 'QUATERNION'; obj.rotation_quaternion = direction.to_track_quat('Z', 'Y'); obj.data.materials.append(material); bpy.ops.object.shade_smooth(); return obj


def lathe(name, location, profile, material, segments=40):
    verts, faces = [], []
    for radius, z in profile:
        for i in range(segments):
            angle = i * math.tau / segments
            verts.append((location[0] + radius * math.cos(angle), location[1] + radius * math.sin(angle), location[2] + z))
    for row in range(len(profile) - 1):
        for i in range(segments):
            a = row * segments + i; b = row * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.append(tuple(reversed(range(segments))))
    mesh = bpy.data.meshes.new(name + ' malha'); mesh.from_pydata(verts, [], faces); mesh.materials.append(material); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons: poly.use_smooth = True
    return obj


def add_seating(name, w, d, h, m, description):
    text = normal(name + ' ' + description); sofa = any(x in text for x in ('sofa', 'chaise')); chair = 'cadeira' in text; bench = 'banco' in text
    seat_h = h * (.39 if sofa else .47 if chair else .43)
    cushion = .105 if sofa else .08
    if 'corda' in text or 'trama' in text or 'entrancada' in text:
        seat_h = h * .43
        for x in (-w * .35, w * .35):
            for y in (-d * .28, d * .30):
                rod('Pernas metálicas cruzadas', (x * 1.12, y * 1.15, .025), (x * .88, y * .82, seat_h), .018, m['metal'])
        radius_x, radius_y = w * .47, d * .45
        for row, (height, factor) in enumerate(((seat_h * .92, .20), (seat_h * 1.10, .50), (h * .66, .84), (h * .82, 1.0))):
            hoop = torus('Aro da trama', (0, 0, height), 1, .012 if row else .018, m['fabric_light'])
            hoop.scale = (radius_x * factor, radius_y * factor, 1)
        for index in range(32):
            angle = index * math.tau / 32
            if math.sin(angle) > .82: continue
            low = (math.cos(angle) * radius_x * .20, math.sin(angle) * radius_y * .20, seat_h * .92)
            high = (math.cos(angle) * radius_x, math.sin(angle) * radius_y, h * .82)
            rod('Cordão vertical entrançado', low, high, .008, m['fabric_light'])
        for row, (height, factor) in enumerate(((seat_h * .99, .35), (seat_h * 1.08, .50), (h * .60, .77), (h * .73, .91))):
            hoop = torus('Cordão horizontal entrançado', (0, 0, height), 1, .0065, m['fabric_light'])
            hoop.scale = (radius_x * factor, radius_y * factor, 1)
        for index in range(9):
            x = -w * .30 + index * w * .075
            rod('Corda do assento', (x, -d * .28, seat_h * 1.02), (x, d * .28, seat_h * 1.02), .0065, m['fabric_light'])
        for index in range(9):
            y = -d * .25 + index * d * .0625
            rod('Corda do assento', (-w * .34, y, seat_h * 1.02), (w * .34, y, seat_h * 1.02), .0065, m['fabric_light'])
        return
    if sofa:
        arm = min(.17, w * .10)
        cube('Estrutura estofada', (0, 0, seat_h * .52), (w * .94, d * .82, seat_h), m['fabric'], .065)
        cube('Encosto contínuo', (0, -d * .34, seat_h + (h - seat_h) * .49), (w * .88, d * .19, h - seat_h), m['fabric'], .06)
        cube('Braço esquerdo', (-w / 2 + arm / 2, d * .01, seat_h * .78), (arm, d * .82, seat_h * 1.48), m['fabric'], .06)
        cube('Braço direito', (w / 2 - arm / 2, d * .01, seat_h * .78), (arm, d * .82, seat_h * 1.48), m['fabric'], .06)
        count = 3 if w >= 1.65 else 2; seatw = (w - arm * 2) / count
        for i in range(count):
            x = -w / 2 + arm + seatw * (i + .5)
            cube('Almofada de assento', (x, d * .06, seat_h + cushion * .46), (seatw * .91, d * .53, cushion), m['fabric_light'], .045)
            cube('Almofada de encosto', (x, -d * .285, seat_h + (h - seat_h) * .60), (seatw * .90, .12, (h - seat_h) * .76), m['fabric'], .05)
        for x in (-w * .4, w * .4):
            for y in (-d * .32, d * .31): cylinder('Pé cónico', (x, y, seat_h * .21), .035, seat_h * .42, m['wood'], 16, .025)
        if 'chaise' in text or 'canto' in text or 'l ' in text:
            cube('Extensão chaise', (-w * .28, d * .36, seat_h * .51), (w * .43, d * .52, seat_h), m['fabric'], .055)
            cube('Almofada chaise', (-w * .28, d * .36, seat_h + cushion * .46), (w * .40, d * .43, cushion), m['fabric_light'], .04)
    elif bench:
        cube('Assento de madeira', (0, 0, seat_h), (w * .95, d * .78, .08), m['wood'], .025)
        for x in (-w * .39, w * .39):
            for y in (-d * .28, d * .28): rod('Perna metálica', (x, y, .035), (x * .94, y * .94, seat_h - .04), .022, m['metal'])
    elif chair:
        for x in (-w * .40, w * .40):
            for y in (-d * .34, d * .34): rod('Pé de madeira', (x * 1.12, y * 1.12, .025), (x, y, seat_h), .024, m['wood'])
        cube('Assento moldado', (0, d * .05, seat_h), (w * .90, d * .76, .095), m['fabric'], .04)
        for x in (-w * .37, w * .37): rod('Montante do encosto', (x, -d * .30, seat_h), (x * .92, -d * .38, h * .93), .022, m['wood'])
        sphere('Encosto envolvente', (0, -d * .34, h * .76), (w * .41, .055, h * .19), m['fabric'])
        if 'ripa' in text or 'rustica' in text:
            for x in (-w * .26, -w * .09, w * .09, w * .26): cube('Ripa do encosto', (x, -d * .39, h * .75), (.045, .045, h * .30), m['wood'], .012)
    else:
        for x in (-w * .38, w * .38):
            for y in (-d * .34, d * .34): rod('Pé de madeira', (x * 1.10, y * 1.10, .025), (x, y, seat_h), .028, m['wood'])
        cube('Assento estofado', (0, 0, seat_h), (w * .88, d * .74, .12), m['fabric'], .055)
        cube('Encosto envolvente', (0, -d * .32, seat_h + (h - seat_h) * .50), (w * .88, .11, h - seat_h), m['fabric'], .075)
        for x in (-w * .50, w * .50): cube('Apoio de braço', (x * .86, 0, seat_h + .12), (w * .13, d * .77, .12), m['wood'], .045)


def add_trama_armchair(w, d, h, m):
    seat_h = h * .36
    rx, ry = w * .49, d * .47
    # An open backed woven chair with a low half shell and a clearly open front.
    profile = ((.22, seat_h * .94), (.42, seat_h * 1.08), (.65, seat_h * 1.34), (.84, seat_h * 1.60), (.96, seat_h * 1.73))
    for index, (factor, z) in enumerate(profile):
        points = [(math.cos(math.pi + math.pi * step / 24) * rx * factor, math.sin(math.pi + math.pi * step / 24) * ry * factor, z) for step in range(25)]
        for a, b in zip(points, points[1:]): rod('Aro curvo do encosto', a, b, .012 if index else .016, m['fabric_light'])
    for index in range(24):
        angle = math.tau * index / 24
        if math.sin(angle) > .12: continue
        points = [(math.cos(angle) * rx * factor, math.sin(angle) * ry * factor, z) for factor, z in profile]
        for a, b in zip(points, points[1:]): rod('Corda vertical do encosto', a, b, .0075, m['fabric_light'])
    for row in range(7):
        factor = .24 + row * .115; z = seat_h * (1.02 + row * .105)
        points = [(math.cos(math.pi + math.pi * step / 24) * rx * factor, math.sin(math.pi + math.pi * step / 24) * ry * factor, z) for step in range(25)]
        for a, b in zip(points, points[1:]): rod('Trama horizontal do encosto', a, b, .0065, m['fabric_light'])
    # A dense woven seat remains visible through the open front.
    seat_top = seat_h * 1.05
    for index in range(13):
        p = (index / 12 - .5) * w * .48
        rod('Fio longitudinal do assento', (p, -d * .22, seat_top), (p, d * .22, seat_top), .0065, m['fabric_light'])
        rod('Fio transversal do assento', (-w * .24, p * d / w, seat_top), (w * .24, p * d / w, seat_top), .0065, m['fabric_light'])
    cylinder('Assento circular entrancado', (0, 0, seat_top - .026), w * .31, .045, m['fabric_light'], 48)
    # Four narrow, splayed black steel legs and a stabilizing cross brace.
    for x in (-w * .32, w * .32):
        for y in (-d * .28, d * .28):
            rod('Perna preta inclinada', (x * 1.45, y * 1.35, .025), (x * .68, y * .62, seat_h * .98), .018, m['metal'])
    rod('Travessa frontal', (-w * .35, -d * .25, seat_h * .30), (w * .35, -d * .25, seat_h * .30), .012, m['metal'])
    rod('Travessa lateral', (-w * .30, -d * .25, seat_h * .30), (-w * .30, d * .25, seat_h * .30), .012, m['metal'])


def add_table(name, w, d, h, m, description):
    text = normal(name + ' ' + description); round_top = any(x in text for x in ('redonda', 'circular', 'round', 'lateral noma', 'apoio tronco'))
    if 'secretaria traco' in text:
        cube('Tampo fino de madeira', (0, 0, h - .035), (w * .98, d * .94, .07), m['wood_light'], .018)
        cube('Gaveta central discreta', (0, -d * .25, h - .115), (w * .34, d * .23, .12), m['wood'], .012)
        cylinder('Puxador de latÃ£o', (0, -d * .37, h - .115), .009, .018, m['metal'], 12)
        # Thin black hairpin legs, closer to the reference than a blocky table base.
        for x in (-w * .40, w * .40):
            for y in (-d * .34, d * .34):
                rod('Perna em hairpin', (x * 1.12, y * 1.12, .025), (x * .82, y * .82, h - .07), .012, m['metal'])
        for x in (-w * .40, w * .40): rod('Travessa lateral fina', (x * 1.08, -d * .25, h * .32), (x * 1.08, d * .25, h * .32), .009, m['metal'])
        return
    if round_top:
        cylinder('Tampo redondo', (0, 0, h - .045), min(w, d) * .48, .09, m['wood'], 48)
        if 'tronco' in text:
            for i in range(3):
                a = i * math.tau / 3; x, y = math.cos(a) * w * .27, math.sin(a) * d * .27
                rod('Pé inclinado', (x * 1.4, y * 1.4, .03), (x, y, h - .10), .026, m['metal'])
        else:
            cylinder('Coluna central', (0, 0, (h - .12) / 2), min(w, d) * .09, h - .12, m['wood'])
            cylinder('Base circular', (0, 0, .045), min(w, d) * .34, .09, m['metal'])
    else:
        cube('Tampo em madeira', (0, 0, h - .045), (w * .97, d * .94, .09), m['wood'], .024)
        if any(x in text for x in ('secretaria', 'secretaria', 'escrivaninha', 'secretária')):
            cube('Gaveta central', (0, -d * .28, h - .14), (w * .34, d * .22, .13), m['wood_light'], .015)
            cylinder('Puxador', (0, -d * .40, h - .14), .012, .025, m['metal'], 12)
        legmat = m['metal'] if 'metal' in text else m['wood']
        for x in (-w * .40, w * .40):
            for y in (-d * .36, d * .36):
                if 'cruzado' in text or 'cross' in text:
                    rod('Pé cruzado', (x, y, .04), (-x * .7, y, h - .12), .025, legmat)
                else: cylinder('Perna da mesa', (x, y, (h - .09) / 2), .028 if legmat == m['metal'] else .036, h - .09, legmat, 16, .022 if legmat == m['metal'] else .028)


def add_storage(name, w, d, h, m, description):
    text = normal(name + ' ' + description); sideboard = h < 1.0 or any(x in text for x in ('aparador', 'consola', 'buffet'))
    if 'consola memoria' in text:
        top_z = h * .88
        cube('Tampo largo da consola', (0, 0, top_z), (w * .98, d * .92, .055), m['wood_light'], .018)
        cube('Corpo inferior da consola', (0, 0, h * .53), (w * .89, d * .72, h * .50), m['wood'], .026)
        front = d * .38
        cube('Gaveta central da consola', (0, front, h * .64), (w * .48, .028, h * .20), m['wood_light'], .014)
        cylinder('Puxador de latão', (0, front + .018, h * .64), .014, .018, m['metal'], 16)
        for x in (-w * .40, w * .40):
            for y in (-d * .29, d * .29):
                rod('Perna alta da consola', (x * 1.04, y * 1.08, .025), (x, y, h * .31), .018, m['metal'])
        return
    cube('Caixa de madeira', (0, 0, h * .53), (w * .92, d * .84, h * .88), m['wood'], .035)
    front = d * .43
    if any(x in text for x in ('secretaria', 'secretaria', 'gaveta', 'aparador', 'consola')) or sideboard:
        count = 3 if w > 1.25 else 2
        for i in range(count):
            x = (i - (count - 1) / 2) * w * .29
            drawer_h = h * .20
            cube('Frente de gaveta', (x, front, h * .70), (w * .27, .035, drawer_h), m['wood_light'], .015)
            cube('Puxador', (x, front + .027, h * .70), (w * .085, .025, .018), m['metal'], .006)
    else:
        for x in (-w * .22, w * .22):
            cube('Porta de armário', (x, front, h * .51), (w * .41, .035, h * .76), m['wood_light'], .022)
            cylinder('Puxador', (x + (w * .16 if x < 0 else -w * .16), front + .025, h * .52), .016, .028, m['metal'], 12)
    for x in (-w * .37, w * .37):
        for y in (-d * .32, d * .32): cube('Pé curto', (x, y, .065), (.06, .06, .13), m['metal'], .015)


def add_light(name, w, d, h, m, description):
    text = normal(name + ' ' + description); floor = bool(re.search(r'\b(pe|chao)\b', text)) or h > 1.15; pendant = 'suspensao' in text or 'suspenso' in text
    shade = m['fabric_light'] if 'abat-jour' in text else m['ceramic']
    if 'candeeiro de pe linha' in text:
        # Match the reference: a single white upright with an angled, flat square head.
        lamp_white = mat('Lacado marfim do Candeeiro Linha', (.82, .81, .76), .30, .08)
        cylinder('Base circular pesada', (0, 0, .025), min(w, d) * .37, .05, m['metal'], 48)
        rod('Haste branca esguia', (0, 0, .05), (0, 0, h * .82), .012, lamp_white)
        cylinder('Junta grafite', (0, 0, h * .82), .024, .042, m['dark'], 20)
        rod('Braço curto da cabeça', (0, 0, h * .83), (w * .12, 0, h * .90), .010, lamp_white)
        head = cube('Cabeça quadrada orientável', (w * .14, 0, h * .91), (w * .43, d * .54, h * .035), lamp_white, .016)
        head.rotation_euler[1] = -.42
        cube('Difusor branco da cabeça', (w * .15, -.002, h * .895), (w * .31, d * .40, h * .012), m['glass'], .012)
    elif 'candeeiro de pe sombra' in text:
        # Keep the shade compact and broad like the photograph; use the real floor-lamp silhouette.
        cylinder('Base baixa escura', (0, 0, .026), min(w, d) * .39, .052, m['dark'], 48)
        rod('Haste fina escura', (0, 0, .052), (0, 0, h * .83), .012, m['metal'])
        cylinder('Abat-jour de tecido escuro', (0, 0, h * .88), min(w, d) * .47, h * .16, m['dark'], 48, min(w, d) * .30)
        cylinder('Difusor interior', (0, 0, h * .795), min(w, d) * .31, .012, m['fabric_light'], 40)
    elif 'aplique' in text:
        cylinder('Placa de parede', (0, -d * .42, h * .52), min(w, d) * .28, .055, m['metal'], 32)
        rod('Braço de parede', (0, -d * .36, h * .52), (0, d * .03, h * .52), .018, m['metal'])
        sphere('Globo difusor', (0, d * .12, h * .52), (min(w, d) * .38,) * 3, m['glass'] if 'globo' in text else shade)
    elif 'lanterna' in text:
        radius = min(w, d) * .36
        cube('Base da lanterna', (0, 0, .035), (w * .78, d * .78, .07), m['metal'], .012)
        cube('Câmara de vidro', (0, 0, h * .49), (w * .70, d * .70, h * .78), m['glass'], .012)
        for x in (-radius, radius):
            for y in (-radius, radius): rod('Estrutura da lanterna', (x, y, .08), (x, y, h * .90), .012, m['metal'])
        cube('Tampa da lanterna', (0, 0, h * .90), (w * .82, d * .82, .06), m['metal'], .012)
        torus('Pega da lanterna', (0, 0, h * .99), min(w, d) * .20, .012, m['metal'], (math.pi / 2, 0, 0))
    elif pendant:
        rod('Cabo', (0, 0, h), (0, 0, h * .55), .008, m['dark'])
        cylinder('Tampa', (0, 0, h * .50), min(w, d) * .20, .06, m['metal'])
        for x in (-w * .30, 0, w * .30): sphere('Globo opalino', (x, 0, h * .34), (min(w, d) * .18,) * 3, m['glass'])
    elif floor:
        cylinder('Base', (0, 0, .035), min(w, d) * .32, .07, m['metal'])
        top_z = h * .78
        rod('Haste', (0, 0, .08), (0, 0, top_z), .018, m['metal'])
        if 'articulado' in text or 'articulada' in text or 'secretaria' in text:
            joint = (w * .18, 0, h * .56)
            rod('Braço articulado inferior', (0, 0, top_z), joint, .016, m['metal'])
            sphere('Articulação', joint, (.028, .028, .028), m['metal'])
            end = (w * .48, 0, h * .88)
            rod('Braço articulado superior', joint, end, .014, m['metal'])
            cylinder('Cúpula orientável', (end[0], 0, end[2]), min(w, d) * .32, h * .16, shade, 32, min(w, d) * .13)
        else:
            cylinder('Abat-jour', (0, 0, top_z + h * .12), min(w, d) * .38, h * .26, shade, 40, min(w, d) * .18)
    elif 'secretaria' in text or 'orientavel' in text:
        cylinder('Base ponderada', (0, 0, .035), min(w, d) * .38, .07, m['metal'])
        rod('Haste do candeeiro', (0, 0, .07), (0, 0, h * .49), .018, m['metal'])
        joint = (w * .10, 0, h * .47)
        sphere('Articulação da cabeça', joint, (.025, .025, .025), m['metal'])
        end = (w * .30, 0, h * .82)
        rod('Braço direcionável', joint, end, .014, m['metal'])
        cylinder('Cabeça orientável', (end[0], 0, end[2]), min(w, d) * .34, h * .17, shade, 32, min(w, d) * .16)
    else:
        cylinder('Base', (0, 0, .035), min(w, d) * .25, .07, m['metal'])
        rod('Haste', (0, 0, .06), (0, 0, h * .48), .018, m['metal'])
        cylinder('Abat-jour', (0, 0, h * .78), min(w, d) * .46, h * .40, shade, 40, min(w, d) * .22)
        if 'globo' in text or 'nuvem' in text or 'esfera' in text: sphere('Difusor opalino', (0, 0, h * .76), (min(w, d) * .42,) * 3, m['glass'])


def add_vase(name, w, d, h, m, description):
    text = normal(name + ' ' + description)
    if 'jarras' in text or 'conjunto de 2' in text or 'conjunto de 3' in text:
        count = 3 if '3' in text else 2
        for i in range(count):
            height = h * (0.58 + i * (.20 if count == 3 else .35))
            radius = min(w, d) * (0.18 if i % 2 else .25)
            x = (i - (count - 1) / 2) * w * .25
            profile = [(radius * .5, 0), (radius * .78, height * .08), (radius, height * .48), (radius * .78, height * .80), (radius * .42, height * .91), (radius * .38, height), (radius * .32, height)]
            lathe('Jarra do conjunto', (x, 0, .02), profile, m['ceramic'])
        return
    radius = min(w, d) * .46
    if 'anel' in text:
        black_glaze = mat('Esmalte preto brilhante da Jarra Anel', (.018, .019, .021), .16, .18)
        body = w * .43
        profile = [(body * .52, 0), (body * .76, h * .06), (body * .98, h * .22), (body, h * .48), (body * .90, h * .70), (body * .61, h * .84), (body * .34, h * .89), (body * .31, h * .98), (body * .39, h), (body * .39, h * .94), (body * .30, h * .91)]
        vessel = lathe('Corpo bojudo de cerâmica negra', (0, 0, .018), profile, black_glaze, 64); vessel.scale.y = d / w
        lip = torus('Aro espesso da abertura', (0, 0, h * .98), body * .36, .009, black_glaze); lip.scale.y = d / w
        interior = lathe('Interior oco do gargalo', (0, 0, h * .91), [(body * .29, 0), (body * .27, h * .03), (body * .27, h * .085)], m['dark'], 48); interior.scale.y = d / w
    else:
        neck = radius * (.38 if 'canelada' in text else .55)
        profile = [(radius * .45, 0), (radius * .78, h * .04), (radius, h * .30), (radius * .95, h * .55), (radius * .72, h * .78), (neck, h * .84), (neck, h * .98), (neck * .85, h)]
        body_material = m['glass'] if 'transpar' in text else m['ceramic']
        lathe('Corpo cerâmico', (0, 0, .015), profile, body_material, 48)
        if 'canelada' in text:
            for i in range(16):
                angle = i * math.tau / 16
                x, y = math.cos(angle) * radius * .93, math.sin(angle) * radius * .93
                rod('Canelura', (x, y, h * .14), (x, y, h * .72), .004, m['fabric_light'])


def add_textile(name, w, d, h, m, description):
    text = normal(name + ' ' + description)
    if 'tapete' in text or 'passadeira' in text or 'carpete' in text:
        base_z = .018; thickness = max(.018, min(.04, h * .35))
        nx, ny = 22, 24; verts, faces = [], []
        for row in range(ny + 1):
            v = row / ny; y = -d * .5 + d * v
            for col in range(nx + 1):
                u = col / nx; x = -w * .5 + w * u
                edge = abs(u * 2 - 1) ** 8 * abs(v * 2 - 1) ** 8
                ripple = .003 * math.sin(u * math.tau * 3 + v * 2.4) * max(abs(u * 2 - 1), abs(v * 2 - 1)) ** 3
                verts.append((x, y, base_z + thickness * .52 + .014 * edge + ripple))
        for row in range(ny):
            for col in range(nx):
                a = row * (nx + 1) + col; faces.append((a, a + 1, a + nx + 2, a + nx + 1))
        rug_mesh = bpy.data.meshes.new('Malha ondulada do tapete'); rug_mesh.from_pydata(verts, [], faces); rug_mesh.materials.append(m['fabric']); rug_mesh.update()
        rug = bpy.data.objects.new('Tapete com cantos levantados', rug_mesh); bpy.context.collection.objects.link(rug)
        for poly in rug_mesh.polygons: poly.use_smooth = True
        rug_thickness = rug.modifiers.new('Espessura do tapete', 'SOLIDIFY'); rug_thickness.thickness = thickness; rug_thickness.offset = -1
        cube('Rebordo tecido', (0, 0, base_z + thickness * .58), (w * .94, d * .94, .012), m['accent'], .008)
        for i in range(13):
            x = -w * .39 + i * w * .065
            cube('Nervura da trama', (x, 0, base_z + thickness + .004), (w * .018, d * .88, .008), m['accent2'] if i % 3 == 0 else m['fabric_light'], .003)
        for i in range(19):
            y = -d * .40 + i * d * .044
            cube('Fio transversal', (0, y, base_z + thickness + .006), (w * .86, d * .006, .006), m['fabric_light'], .002)
        for edge_y in (-d * .49, d * .49):
            for i in range(17):
                x = -w * .43 + i * w * .054
                rod('Franja do tapete', (x, edge_y, .023), (x + (i % 2 - .5) * .012, edge_y * 1.055, .017), .0035, m['fabric_light'])
    elif 'almofada' in text:
        # Rounded, puffed cushion with soft edges instead of a beveled box.
        segments = 64
        exponent = 2 / 4.2
        rings = [(.16, -.43), (.72, -.50), (.96, -.35), (1.0, -.12), (.96, .30), (.72, .50), (.34, .51)]
        verts, faces = [], []
        for factor, z_factor in rings:
            for index in range(segments):
                angle = math.tau * index / segments
                cx, sy = math.cos(angle), math.sin(angle)
                x = w * .5 * factor * math.copysign(abs(cx) ** exponent, cx)
                y = d * .5 * factor * math.copysign(abs(sy) ** exponent, sy)
                verts.append((x, y, h * (.50 + z_factor * .50)))
        for row in range(len(rings) - 1):
            for index in range(segments):
                a = row * segments + index; b = row * segments + (index + 1) % segments
                faces.append((a, b, b + segments, a + segments))
        faces.append(tuple(reversed(range(segments))))
        faces.append(tuple((len(rings) - 1) * segments + index for index in range(segments)))
        mesh = bpy.data.meshes.new('Malha almofadada de cantos arredondados'); mesh.from_pydata(verts, [], faces); mesh.materials.append(m['fabric']); mesh.update()
        cushion = bpy.data.objects.new('Almofada macia e volumosa', mesh); bpy.context.collection.objects.link(cushion)
        for poly in mesh.polygons: poly.use_smooth = True
        bevel = cushion.modifiers.new('Costuras arredondadas', 'BEVEL'); bevel.width = min(.008, h * .12); bevel.segments = 3
        # Five slightly curved blue stripes carry the woven reference pattern onto the top face.
        if 'trama' in text:
            stripe = mat('Azul das riscas da Almofada Trama', (.10, .24, .35), .78)
            for index in range(5):
                x = -w * .31 + index * w * .155
                points = []
                for step in range(11):
                    v = step / 10; y = -d * .28 + v * d * .56
                    z = h * (.79 + .012 * math.sin(math.pi * v) * max(0, 1 - abs(x / (w * .5)) ** 3))
                    points.append((x + .008 * math.sin(v * math.tau), y, z))
                for a, b in zip(points, points[1:]): rod('Risca tecida azul', a, b, .0035, stripe)
        for side in (-1, 1):
            y = side * d * .465
            rod('Pesponto da almofada', (-w * .33, y, h * .49), (w * .33, y, h * .49), .0025, m['fabric_light'])
    elif 'manta abrigo' in text:
        # A rolled terracotta throw with a separate soft tail, distinct from the open Sereno drape.
        roll_radius = min(h * .64, d * .095)
        roll = cylinder('Rolo macio da Manta Abrigo', (-w * .30, 0, roll_radius + .015), roll_radius, d * .78, m['fabric_light'], 48)
        roll.rotation_euler[0] = math.pi / 2
        for turn in range(5):
            torus('Volta de tecido do rolo', (-w * .30, 0, roll_radius + .015), roll_radius * (.86 - turn * .075), .006, m['accent2'], (math.pi / 2, 0, 0))
        nx, ny = 20, 28; verts, faces = [], []
        for row in range(ny + 1):
            v = row / ny; y = -d * .46 + d * .92 * v
            for col in range(nx + 1):
                u = col / nx; x = -w * .24 + w * .72 * u
                wave = .009 * math.sin(u * math.tau * 3 + v * 4)
                z = .025 + roll_radius * .62 * math.exp(-((x + w * .24) / max(.03, roll_radius)) ** 2) + wave
                verts.append((x, y, z))
        for row in range(ny):
            for col in range(nx):
                a = row * (nx + 1) + col; faces.append((a, a + 1, a + nx + 2, a + nx + 1))
        mesh = bpy.data.meshes.new('Malha da Manta Abrigo dobrada'); mesh.from_pydata(verts, [], faces); mesh.materials.append(m['fabric_light']); mesh.update()
        tail = bpy.data.objects.new('Cauda de tecido macio da manta', mesh); bpy.context.collection.objects.link(tail)
        solid = tail.modifiers.new('Espessura do tecido', 'SOLIDIFY'); solid.thickness = .009
        for poly in mesh.polygons: poly.use_smooth = True
        for edge_y in (-d * .46, d * .46): rod('Bainha da manta terracota', (-w * .22, edge_y, .035), (w * .46, edge_y, .035), .003, m['accent2'])
    elif 'manta sereno' in text:
        nx, ny = 32, 36; verts, faces = [], []
        for row in range(ny + 1):
            v = row / ny; y = -d * .48 + d * .96 * v
            for col in range(nx + 1):
                u = col / nx; x = -w * .48 + w * .96 * u
                edge = max(abs(u - .5) * 2, abs(v - .5) * 2)
                folds = .016 * math.sin(u * math.tau * 5 + v * 3) + .008 * math.sin(u * math.tau * 9 - v * 6)
                sag = .15 * math.sin(math.pi * u) ** .75 - .11 * max(0, (v - .70) / .30) ** 1.5 - .06 * max(0, (abs(u - .5) - .39) / .11) ** 1.4
                verts.append((x, y, max(.018, .045 + sag + folds * edge)))
        for row in range(ny):
            for col in range(nx):
                a = row * (nx + 1) + col; faces.append((a, a + 1, a + nx + 2, a + nx + 1))
        mesh = bpy.data.meshes.new('Malha fluida da Manta Sereno'); mesh.from_pydata(verts, [], faces); mesh.materials.append(m['fabric_light']); mesh.update()
        sheet = bpy.data.objects.new('Manta Sereno com pregas longas', mesh); bpy.context.collection.objects.link(sheet)
        for poly in mesh.polygons: poly.use_smooth = True
        solid = sheet.modifiers.new('Tecido fino', 'SOLIDIFY'); solid.thickness = .008
        for edge_y in (-d * .48, d * .48): rod('Bainha clara da Manta Sereno', (-w * .47, edge_y, .035), (w * .47, edge_y, .035), .003, m['fabric'])
        for edge_y in (-d * .49, d * .49):
            for index in range(19):
                x = -w * .43 + index * w * .048
                rod('Franja curta da Manta Sereno', (x, edge_y, .04), (x + .004 * math.sin(index), edge_y * 1.045, .018), .0025, m['fabric_light'])
    else:
        # Static gravity-inspired cloth geometry keeps GLB models lightweight and deterministic.
        nx, ny = 28, 32; verts, faces = [], []
        cloth_h = max(.13, min(.32, h * 2.2)); base_z = .035
        for row in range(ny + 1):
            v = row / ny; y = -d * .47 + d * .94 * v
            for col in range(nx + 1):
                u = col / nx; x = -w * .47 + w * .94 * u
                fold = math.sin(u * math.tau * 6 + v * 3.2) * .012 + math.sin(u * math.tau * 11 - v * 4.5) * .005
                center_lift = cloth_h * (.36 + .48 * math.sin(math.pi * u) ** .65)
                front_drop = cloth_h * .58 * max(0, (v - .78) / .22) ** 1.25
                side_drop = cloth_h * .20 * max(0, (abs(u - .5) - .39) / .11) ** 1.4
                sag = center_lift - front_drop - side_drop + fold
                verts.append((x, y, max(.012, base_z + sag)))
        for row in range(ny):
            for col in range(nx):
                a = row * (nx + 1) + col; faces.append((a, a + 1, a + nx + 2, a + nx + 1))
        mesh = bpy.data.meshes.new('Malha fluida da manta'); mesh.from_pydata(verts, [], faces); mesh.materials.append(m['fabric_light']); mesh.update()
        sheet = bpy.data.objects.new('Manta com queda e pregas', mesh); bpy.context.collection.objects.link(sheet)
        for poly in mesh.polygons: poly.use_smooth = True
        solid = sheet.modifiers.new('Espessura macia do tecido', 'SOLIDIFY'); solid.thickness = .009
        for edge_y in (-d * .47, d * .47): rod('Costura da bainha', (-w * .46, edge_y, .04), (w * .46, edge_y, .04), .003, m['accent'])
        for i in range(7):
            x = -w * .36 + i * w * .12
            rod('Vinco longo da manta', (x, -d * .34, base_z + cloth_h * .55), (x + .012, d * .31, base_z + cloth_h * .55), .0025, m['fabric'])
def add_rug(name, w, d, h, m, description):
    add_textile(name, w, d, h, m, description)


def add_mirror(name, w, d, h, m):
    frame = mat('Aro de madeira do espelho', (.34, .22, .13), .42)
    glass = mat('Vidro refletor', (.63, .74, .76), .10, .48)
    cx, cz, rx, rz, segments = 0, h * .51, w * .46, h * .47, 80
    outer, inner = [], []
    for i in range(segments):
        angle = math.tau * i / segments
        outer.append((cx + rx * math.cos(angle), -.018, cz + rz * math.sin(angle)))
        inner.append((cx + rx * .91 * math.cos(angle), -.024, cz + rz * .91 * math.sin(angle)))
    verts, faces = outer + inner, []
    for i in range(segments):
        j = (i + 1) % segments; faces.append((i, j, segments + j, segments + i))
    mesh = bpy.data.meshes.new('Aro oval do Espelho Reflexo'); mesh.from_pydata(verts, [], faces); mesh.materials.append(frame); mesh.update()
    rim = bpy.data.objects.new('Moldura oval fina', mesh); bpy.context.collection.objects.link(rim)
    solid = rim.modifiers.new('Volume da moldura', 'SOLIDIFY'); solid.thickness = .028
    bevel = rim.modifiers.new('Bordo polido', 'BEVEL'); bevel.width = .006; bevel.segments = 3
    mirror_verts = [(rx * .91 * math.cos(math.tau * i / segments), .002, cz + rz * .91 * math.sin(math.tau * i / segments)) for i in range(segments)] + [(0, .002, cz)]
    mirror_faces = [(i, (i + 1) % segments, segments) for i in range(segments)]
    glass_mesh = bpy.data.meshes.new('Superficie plana de vidro'); glass_mesh.from_pydata(mirror_verts, [], mirror_faces); glass_mesh.materials.append(glass); glass_mesh.update()
    surface = bpy.data.objects.new('Superficie refletora oval', glass_mesh); bpy.context.collection.objects.link(surface)
    if 'mesa' in normal(name):
        rod('Suporte traseiro', (0, .025, h * .31), (0, d * .39, .035), .014, m['metal'])
        cube('Base do espelho', (0, d * .30, .035), (w * .54, d * .32, .055), frame, .01)


def add_beeswax_candles(w, d, h, m):
    wax = mat('Cera de abelha dourada', (.72, .43, .10), .58)
    radius = min(w, d) * .055
    heights = (.66, .82, .73, .94, .78, .88)
    positions = [(-.20, -.18), (0, -.18), (.20, -.18), (-.20, .18), (0, .18), (.20, .18)]
    for i, ((px, py), height) in enumerate(zip(positions, heights)):
        x, y = px * w, py * d; candle_h = h * height
        cylinder('Vela hexagonal de cera', (x, y, candle_h * .5), radius, candle_h, wax, 6, radius * .88)
        for band in range(5): torus('Relevo de favo de mel', (x, y, candle_h * (.18 + band * .145)), radius * .99, .0025, wax)
        cylinder('Pavio de algodao', (x, y, candle_h + .007), .0025, .014, m['dark'], 8)


def add_decor(name, w, d, h, m, description):
    text = normal(name + ' ' + description)
    if 'jarra anel' in text:
        add_vase(name, w, d, h, m, description)
    elif 'espelho' in text:
        add_mirror(name, w, d, h, m)
    elif 'vela' in text and 'colmeia' in text:
        add_beeswax_candles(w, d, h, m)
    elif 'planta' in normal(name) and 'vaso' not in normal(name):
        cylinder('Vaso de planta', (0, 0, h * .16), min(w, d) * .36, h * .32, m['ceramic'], 28, min(w, d) * .43)
        for i in range(9):
            angle = i * math.tau / 9; radius = min(w, d) * (.16 + .015 * (i % 2))
            start = (math.cos(angle) * radius * .25, math.sin(angle) * radius * .25, h * .30)
            end = (math.cos(angle) * radius * 1.8, math.sin(angle) * radius * 1.8, h * (.62 + (i % 3) * .10))
            rod('Caule', start, end, .008, m['leaf'])
            leaf_obj = sphere('Folha', end, (min(w, d) * .13, min(w, d) * .075, h * .05), m['leaf']); leaf_obj.rotation_euler[2] = angle
    elif 'cesto' in text:
        radius = min(w, d) * .45
        for row in range(9):
            z = h * (.14 + row * .075); ring_radius = radius * (1 - row * .035)
            torus('Trama horizontal', (0, 0, z), ring_radius, .009, m['wood_light'])
        for i in range(16):
            angle = i * math.tau / 16; r = radius * .96
            rod('Trama vertical', (math.cos(angle) * r, math.sin(angle) * r, h * .10), (math.cos(angle) * r * .70, math.sin(angle) * r * .70, h * .82), .009, m['wood'])
    elif 'espelho' in text:
        mirror = mat('Vidro refletor', (.66, .76, .77), .12, .25)
        sphere('Moldura oval do espelho', (0, 0, h * .53), (w * .50, .045, h * .50), m['wood'])
        sphere('Superfície espelhada', (0, .035, h * .53), (w * .43, .014, h * .43), mirror)
        if 'mesa' in text:
            rod('Suporte do espelho', (0, -d * .24, h * .25), (0, -d * .34, .035), .018, m['metal'])
            cube('Base do espelho', (0, -d * .32, .035), (w * .56, d * .28, .06), m['wood'], .012)
    elif 'vela' in text or 'castical' in text:
        count = 6 if '6' in text else 1
        for i in range(count):
            x = (i - (count - 1) / 2) * w * .14
            cylinder('Vela de cera', (x, 0, h * .50), min(w, d) * .11, h * .94, m['fabric_light'], 20)
            cylinder('Pavio', (x, 0, h * .98), .005, .025, m['dark'], 8)
    else:
        add_vase(name, w, d, h, m, description)


def add_bed(name, w, d, h, m, description):
    cube('Estrutura da cama', (0, 0, h * .43), (w, d, h * .62), m['wood'], .05)
    cube('Colchão', (0, 0, h * .78), (w * .96, d * .95, h * .20), m['fabric_light'], .065)
    cube('Cabeceira', (0, -d * .48, h * 1.05), (w * .92, .09, h * .85), m['wood'], .035)
    for x in (-w * .27, 0, w * .27): cube('Almofada', (x, -d * .29, h * .91), (w * .24, d * .18, .10), m['fabric'], .04)


def add_tableware(name, w, d, h, m, description):
    text = normal(name + ' ' + description); radius = min(w, d) * .48
    if 'pratos alegria' in text:
        palette = [m['ceramic'], mat('Esmalte azul dos pratos', (.23, .39, .47), .24), mat('Esmalte ocre dos pratos', (.70, .43, .18), .25), mat('Esmalte verde dos pratos', (.35, .44, .34), .27)]
        offsets = [(-.19, -.19), (.19, -.19), (-.19, .19), (.19, .19)]
        for i, ((ox, oy), material) in enumerate(zip(offsets, palette)):
            x, y = ox * w, oy * d; z = .018 + i * .001; plate_r = radius * .43
            lathe('Prato colorido raso', (x, y, z), [(plate_r * .94, 0), (plate_r, .009), (plate_r * .91, .016), (plate_r * .70, .020), (plate_r * .56, .015)], material, 56)
            torus('Bordo canelado do prato', (x, y, z + .014), plate_r * .92, .0035, material)
            torus('Filete decorativo do prato', (x, y, z + .017), plate_r * .72, .0018, m['fabric_light'])
    elif 'servico' in text or '4 pecas' in text:
        cylinder('Prato grande', (-w * .22, 0, .025), radius * .56, .045, m['ceramic'], 48)
        cylinder('Prato pequeno', (w * .22, 0, .025), radius * .46, .035, m['fabric_light'], 48)
        lathe('Taça do serviço', (0, d * .30, .02), [(radius * .16, 0), (radius * .4, .03), (radius * .44, .12), (radius * .34, .19)], m['ceramic'])
        cylinder('Copo do serviço', (0, -d * .30, h * .30), radius * .27, h * .58, m['glass'], 32, radius * .22)
    elif 'prato' in text or 'pires' in text:
        lathe('Prato esmaltado', (0, 0, .01), [(radius * .95, 0), (radius, .018), (radius * .83, .04), (radius * .55, .065), (radius * .12, .07)], m['ceramic'], 48)
        if 'chavena' in text or 'chavena' in text:
            lathe('Chávena', (0, 0, .07), [(radius * .28, 0), (radius * .30, h * .35), (radius * .25, h * .42)], m['fabric_light'])
            torus('Asa da chávena', (radius * .32, 0, h * .27), radius * .14, .018, m['fabric_light'], (math.pi / 2, 0, 0))
    elif 'copo' in text:
        lathe('Copo de vidro', (0, 0, .01), [(radius * .48, 0), (radius * .52, h * .90), (radius * .49, h)], m['glass'], 32)
        torus('Rebordo do copo', (0, 0, h), radius * .50, .009, m['ceramic'])
    else:
        lathe('Corpo da caneca', (0, 0, .01), [(radius * .45, 0), (radius * .53, h * .09), (radius * .56, h * .84), (radius * .52, h)], m['ceramic'], 40)
        torus('Asa da caneca', (radius * .55, 0, h * .52), radius * .28, .035, m['ceramic'], (math.pi / 2, 0, 0))


def clear_scene():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images):
        for block in list(datablocks):
            if block.users == 0: datablocks.remove(block)


def build(product):
    clear_scene()
    text = normal(product['name'] + ' ' + product.get('description', '') + ' ' + product.get('material', ''))
    kind = kind_of(product); w, d, h = dimensions(product, kind)
    # Photo proportions influence width/depth if an item description has no dimensions.
    materials = product_palette(product)
    if 'poltrona trama' in text: add_trama_armchair(w, d, h, materials)
    elif kind == 'seating': add_seating(product['name'], w, d, h, materials, product.get('description', ''))
    elif kind == 'table': add_table(product['name'], w, d, h, materials, product.get('description', ''))
    elif kind == 'storage': add_storage(product['name'], w, d, h, materials, product.get('description', ''))
    elif kind == 'light': add_light(product['name'], w, d, h, materials, product.get('description', ''))
    elif kind == 'textile': add_textile(product['name'], w, d, h, materials, product.get('description', ''))
    elif kind == 'rug': add_rug(product['name'], w, d, h, materials, product.get('description', ''))
    elif kind == 'bed': add_bed(product['name'], w, d, h, materials, product.get('description', ''))
    elif kind == 'tableware': add_tableware(product['name'], w, d, h, materials, product.get('description', ''))
    else: add_decor(product['name'], w, d, h, materials, product.get('description', ''))
    # Model origin is the centre of its floor footprint, matching the planner's placement math.
    bpy.context.scene.unit_settings.system = 'METRIC'; bpy.context.scene.unit_settings.scale_length = 1.0
    bpy.ops.object.select_all(action='SELECT')
    for obj in bpy.context.selected_objects: obj.select_set(True)
    # Match the browser loader: normalize the display name, remove accents, then slug it.
    asset_slug = re.sub(r'[^a-z0-9]+', '-', normal(product['name'])).strip('-')
    filepath = os.path.join(OUT, asset_slug + '.glb')
    bpy.ops.export_scene.gltf(filepath=filepath, export_format='GLB', export_apply=True, export_materials='EXPORT', export_image_format='AUTO', export_lights=False, export_cameras=False, export_yup=True, use_selection=True)
    return filepath


with open(CATALOG, 'r', encoding='utf-8') as handle: catalog = json.load(handle)
if ARGS.get('slugs'):
    selected_slugs = {value.strip() for value in ARGS['slugs'].split(',') if value.strip()}
    catalog = [product for product in catalog if re.sub(r'[^a-z0-9]+', '-', normal(product['name'])).strip('-') in selected_slugs]
print('Generating', len(catalog), 'FORMA models in Blender')
failed = []
for index, product in enumerate(catalog, 1):
    try:
        path = build(product)
        if index % 10 == 0 or index == len(catalog): print(f'{index}/{len(catalog)} {product["name"]}: {os.path.getsize(path)} bytes', flush=True)
    except Exception as error:
        failed.append((product.get('name', '?'), str(error)))
        print('FAILED', product.get('name'), error, flush=True)
if failed:
    print('Failed models:', json.dumps(failed, ensure_ascii=False))
    sys.exit(1)
print('All models exported successfully.')
