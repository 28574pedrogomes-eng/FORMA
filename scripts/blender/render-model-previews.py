import bpy
import math
import os
import sys
from mathutils import Vector


ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOT = os.path.abspath(ARGS[0] if ARGS else '.')
OUT = os.path.join(ROOT, 'output', 'model-previews')
os.makedirs(OUT, exist_ok=True)
SLUGS = ['cadeira-arco', 'sofa-brisa', 'poltrona-trama', 'candeeiro-de-secretaria-foco']


def render(slug):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'public', 'models', slug + '.glb'))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
    high = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
    center = (low + high) * .5
    size = max((high - low).x, (high - low).y, (high - low).z, .6)
    for obj in objects:
        obj.location.x -= center.x
        obj.location.y -= center.y
        obj.location.z -= low.z
    bpy.ops.mesh.primitive_plane_add(size=size * 4, location=(0, 0, -.015))
    bpy.context.object.name = 'Preview floor'
    bpy.context.object.data.materials.append(bpy.data.materials.new('Preview floor material'))
    bpy.context.object.active_material.diffuse_color = (.78, .77, .72, 1)
    bpy.ops.object.light_add(type='AREA', location=(size * 1.2, -size * 1.7, size * 2.4))
    bpy.context.object.data.energy = 220
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = size * 1.6
    bpy.ops.object.camera_add(location=(size * 2.25, size * 3.1, size * 1.7))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, size * .43)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = size * 2.1
    bpy.context.scene.camera = camera
    bpy.context.scene.render.engine = 'BLENDER_EEVEE'
    bpy.context.scene.render.resolution_x = 860
    bpy.context.scene.render.resolution_y = 700
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.world = bpy.data.worlds.new('Preview world')
    bpy.context.scene.world.use_nodes = True
    bpy.context.scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.45, .45, .45, 1)
    bpy.context.scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .35
    bpy.context.scene.view_settings.view_transform = 'Standard'
    bpy.context.scene.render.image_settings.file_format = 'PNG'
    bpy.context.scene.render.filepath = os.path.join(OUT, slug + '.png')
    bpy.ops.render.render(write_still=True)
    print('Rendered', slug, flush=True)


for SLUG in SLUGS:
    render(SLUG)
