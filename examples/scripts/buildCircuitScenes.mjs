/**
 * Lays out Night Circuit's five tracks: `node scripts/buildCircuitScenes.mjs`.
 *
 * A map's road was a radial loop built at boot from a handful of sine
 * harmonics, which meant no editor could open a circuit and no one could
 * move a cone. The shaping runs here, once (see circuitMaps.mjs), and
 * `scenes/circuit*.json` are the tracks: the road as a closed smooth path
 * whose points carry the half-width of the asphalt, and every cone,
 * barrel, slick, boost pad, gate, traffic car and checkpoint placed on it.
 *
 * The game rebuilds the kerbs and the surface from that path, so moving a
 * point in the editor moves the road, its barriers and everything that
 * reads the centreline with it.
 *
 * Every sprite is a free, open asset under `src/circuit/textures/` (see
 * THIRD_PARTY_NOTICES.md).
 */
import { writeFileSync } from 'node:fs';
import { writeScene } from 'm2d-editor-core';
import { seedTarget, placer } from './seedScene.mjs';
import { MAPS, trackFor } from './circuitMaps.mjs';
import { Track } from '../src/circuit/track.js';
import { CAR } from '../src/circuit/actors.js';

/** Every image the circuits draw from, by the key a scene names it by. */
const IMAGES = {
  carRed: 'car_red_1.png', carBlue: 'car_blue_1.png', carGreen: 'car_green_1.png',
  carBlack: 'car_black_3.png', carYellow: 'car_yellow_3.png',
  cone: 'cone_straight.png', coneDown: 'cone_down.png',
  barrel: 'barrel_blue.png', barrelDown: 'barrel_blue_down.png',
  barrelRed: 'barrel_red.png', barrelRedDown: 'barrel_red_down.png',
  oil: 'oil.png', arrow: 'arrow_yellow.png',
  barrierWhite: 'barrier_white.png', barrierRed: 'barrier_red.png',
  curbWhite: 'barrier_white_race.png', curbRed: 'barrier_red_race.png',
  tiresWhite: 'tires_white.png', tiresRed: 'tires_red.png',
  treeSmall: 'tree_small.png', treeLarge: 'tree_large.png',
  tribune: 'tribune_full.png', tent: 'tent_blue.png', rock: 'rock1.png',
  lamp: 'light_white.png',
  grass: 'land_grass.png', dirt: 'land_dirt.png', sand: 'land_sand.png'
};

/** The art the road draws itself from, and the cars the director may spawn. */
const ROAD_ART = ['grass', 'dirt', 'sand', 'barrierWhite', 'barrierRed', 'curbWhite', 'curbRed',
  'tiresWhite', 'tiresRed', 'treeSmall', 'treeLarge', 'tribune', 'tent', 'rock', 'lamp'];
const CAR_ART = ['carRed', 'carBlue', 'carGreen', 'carBlack', 'carYellow'];
const named = (keys) => Object.fromEntries(keys.map((key) => [key, key]));

/** One circuit's scene. */
function circuitScene(map) {
  // Shifted so the loop starts at the world's corner: a circuit's file
  // carries no dead space, and opening one in the editor lands on it.
  const shaped = trackFor(map);
  const dx = -shaped.bounds.left;
  const dy = -shaped.bounds.top;
  const track = new Track(shaped.controls.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })));
  const { objects, add } = placer();
  const at = (t, offset = 0) => track.pose(t, offset);

  // Boost pads first: everything else draws over them.
  for (const spec of map.props.boosts) {
    const pose = at(spec.t, spec.o);
    add('boost', pose.x, pose.y, 90, 54, undefined, { angle: round(pose.angle) });
  }
  for (const spec of map.props.oil) {
    const pose = at(spec.t, spec.o);
    add('oil', pose.x, pose.y, spec.r * 1.6, spec.r * 1.6, { radius: spec.r }, { angle: round(pose.angle) });
  }
  // The checkpoints in lap order, then the finish line as the last of them.
  [...map.checkpoints, 0].forEach((t, index) => {
    const pose = at(t, 0);
    add('checkpoint', pose.x, pose.y, 26, pose.width * 2 + 50,
      { index, finish: index === map.checkpoints.length }, { angle: round(pose.angle) });
  });
  // Traffic shuttles a stretch of road and a gate shuttles across one:
  // both are an open path the engine's PathFollow walks and reverses at.
  const paths = {};
  const line = (points) => ({ points: points.map((p) => ({ x: round(p.x), y: round(p.y) })) });
  map.props.traffic.forEach((spec, i) => {
    const name = `traffic-${i + 1}`;
    const points = [];
    for (let t = spec.t0; t <= spec.t1; t += 140 / track.length) points.push(at(t, spec.o));
    paths[name] = line(points);
    add('traffic', points[0].x, points[0].y, CAR.bodyLength, CAR.bodyWidth, undefined, {
      constraints: { path: { type: 'PathFollow', params: { path: name, stopAtPoints: false, speed: spec.speed, waitTime: 900, acceleration: spec.speed } } }
    });
  });
  map.props.gates.forEach((spec, i) => {
    const name = `gate-${i + 1}`;
    const pose = at(spec.t, 0);
    const across = pose.angle + Math.PI / 2;
    // The beam covers a third of the road and shuttles between the
    // shoulders, so there is always at least a car and a half of room
    // somewhere — the gate costs a line, never the lap.
    const travel = pose.width * 0.62;
    const beside = (offset) => ({ x: pose.x + Math.cos(across) * offset, y: pose.y + Math.sin(across) * offset });
    paths[name] = line([beside(-travel), beside(travel)]);
    const start = beside(-travel);
    add('gate', start.x, start.y, pose.width * 0.7, 14, undefined, {
      angle: round(across),
      constraints: { path: { type: 'PathFollow', params: { path: name, stopAtPoints: false, speed: round(90 + pose.width * 0.3), waitTime: 650, acceleration: 260 } } }
    });
  });
  for (const row of map.props.cones) {
    for (let i = 0; i < row.n; i++) {
      const pose = at(row.t + (i * row.spacing) / track.length, row.o);
      add('cone', pose.x, pose.y, 13, 13, undefined, { angle: round(pose.angle) });
    }
  }
  for (const cluster of map.props.barrels) {
    for (let i = 0; i < cluster.n; i++) {
      const pose = at(cluster.t + (i * 30) / track.length, cluster.o);
      add('barrel', pose.x, pose.y, 22, 22, i % 2 === 1 ? { rusted: true } : undefined);
    }
  }

  // The road itself, and the director that runs the rounds on it.
  const course = placer();
  course.add('road', 0, 0, 16, 16, { path: 'road', layer: 'ground', art: named(ROAD_ART), ...roadLook(map) });
  course.add('road', 0, 0, 16, 16, { path: 'road', layer: 'over', art: named(ROAD_ART), ...roadLook(map) });
  course.add('director', 0, 0, 16, 16, { path: 'road', cars: named(CAR_ART), ghost: 'carBlack' });

  const bounds = track.bounds;   // left and top are 0 now, give or take a rounding
  return {
    version: 4,
    name: map.name,
    type: 'level',
    gameType: 'topDown',
    title: map.title,
    paths: {
      // The centreline, with the asphalt's half-width at every control
      // point: the game resamples it into the surface and the kerbs.
      road: { closed: true, smooth: true, points: track.controls.map((p) => ({ x: round(p.x), y: round(p.y), w: round(p.w) })) },
      ...paths
    },
    world: {
      width: Math.ceil(bounds.right),
      height: Math.ceil(bounds.bottom),
      gravity: { x: 0, y: 0 },
      // A point ahead of the car is what the camera follows; the director
      // hands it one, so no object is named here.
      // The world is the circuit's own extent, so the view is held to it.
      camera: { lerp: 0.085, bounds: 'world' },
      lighting: { ambient: map.ambient },
      post: {
        bloom: { threshold: 0.62, strength: map.grade.bloom, blur: 26 },
        vignette: { strength: map.grade.vignette, start: 0.55 },
        grade: {
          shadows: map.grade.shadows ?? '#394068', highlights: map.grade.highlights ?? '#fff0d2',
          amount: 0.3, saturation: map.grade.saturation ?? 1.3, contrast: 1.08
        },
        ...(map.theme?.weather ? { grain: { strength: 0.06 } } : {})
      },
      music: { track: 'game' }
    },
    assets: {
      images: Object.fromEntries(Object.entries(IMAGES).map(([key, file]) => [key, { url: `textures/${file}` }])),
      sounds: {
        checkpoint: { url: 'sounds/confirmation_001.ogg' },
        lap: { url: 'sounds/maximize_008.ogg' },
        boost: { url: 'sounds/maximize_006.ogg' },
        count: { url: 'sounds/minimize_008.ogg' },
        go: { url: 'sounds/maximize_006.ogg' },
        barrel: { url: 'sounds/error_008.ogg' },
        hit: { url: 'sounds/error_008.ogg' },
        spill: { url: 'sounds/drop_003.ogg' },
        cone: { url: 'sounds/drop_003.ogg' },
        drift: { url: 'sounds/minimize_006.ogg' },
        tyres: { url: 'sounds/tyre_squeal_loop.wav' }
      },
      music: { game: { url: 'music/evelon-longing-for-rain.ogg' } }
    },
    prefabs: placed({
      road: { actor: 'Road', physics: { bodyType: 'static', isSensor: true } },
      director: { actor: 'RaceDirector', physics: { bodyType: 'static', isSensor: true } },
      boost: { actor: 'BoostPad', physics: { bodyType: 'static', isSensor: true }, properties: { image: 'arrow' } },
      oil: { actor: 'OilSlick', physics: { bodyType: 'static', isSensor: true, shape: 'circle' }, properties: { image: 'oil' } },
      checkpoint: { actor: 'Checkpoint', physics: { bodyType: 'static', isSensor: true } },
      traffic: { actor: 'TrafficCar', physics: { bodyType: 'kinematic', friction: 0.2 }, properties: { image: 'carYellow' } },
      gate: { actor: 'GateArm', physics: { bodyType: 'kinematic', friction: 0.2 }, properties: { image: 'curbRed' } },
      cone: { actor: 'Cone', physics: { bodyType: 'dynamic', friction: 0.4, frictionAir: 0.06 }, properties: { up: 'cone', down: 'coneDown' } },
      barrel: {
        actor: 'Barrel',
        physics: { bodyType: 'dynamic', shape: 'circle', friction: 0.4, frictionAir: 0.05, restitution: 0.3 },
        properties: { blue: 'barrel', blueDown: 'barrelDown', red: 'barrelRed', redDown: 'barrelRedDown' }
      }
    }, [...course.objects, ...objects]),
    layers: [
      // The course stands for the whole visit; the props are rebuilt from
      // here at the start of every round, which is what makes a round a
      // unit a replay can reproduce.
      { name: 'course', objects: course.objects },
      { name: 'props', objects }
    ],
    hud: [
      { type: 'text', id: 'title', x: 20, y: 16, anchor: 'top-left', properties: { text: map.title.toUpperCase(), fontSize: '18px', letterSpacing: 2, color: '#ffd34d' } },
      { type: 'text', id: 'speedLabel', x: -20, y: 16, anchor: 'top-right', properties: { text: 'KM/H', align: 'right', fontSize: '12px', letterSpacing: 2, color: '#9fb0cc' } },
      { type: 'text', id: 'nitroLabel', x: -26, y: 76, anchor: 'top-right', properties: { text: 'X', align: 'right', fontSize: '12px', color: '#9fb0cc' } },
      { type: 'text', id: 'hint', x: 0, y: -18, anchor: 'bottom', properties: { text: 'Arrows drive · Space handbrake · X nitro · R restart · Enter replay best · O settings', align: 'center', fontSize: '13px', color: '#8292ae' } },
      { type: 'component', id: 'race', component: 'raceHud', x: 0, y: 0, anchor: 'top-left' }
    ]
  };
}

/** Only the prefabs a circuit actually places; an unplaced one is dead weight in the file. */
function placed(prefabs, objects) {
  const used = new Set(objects.map((object) => object.prefab));
  return Object.fromEntries(Object.entries(prefabs).filter(([name]) => used.has(name)));
}

/** The look a map gives its road, as the Road actor's properties. */
function roadLook(map) {
  const theme = map.theme ?? {};
  return {
    ground: theme.ground ?? 'grass',
    asphalt: theme.asphalt, worn: theme.worn, shoulder: theme.shoulder,
    edge: theme.edge, dash: theme.dash, lampColor: theme.lamp,
    decor: theme.decor, weather: theme.weather ?? undefined,
    lampEvery: map.lampEvery, seed: map.seed
  };
}

const round = (n) => Math.round(n * 1000) / 1000;

for (const map of MAPS) {
  const out = seedTarget(new URL(`../src/circuit/scenes/${map.name}.json`, import.meta.url));
  const scene = circuitScene(map);
  writeFileSync(out, writeScene(scene));
  console.log(`${map.name}: ${scene.layers[1].objects.length} props, ${scene.paths.road.points.length} road points → ${out}`);
}
