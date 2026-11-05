/*
  The museum the Analyses page walks through (three.js, loaded only on that page).

  A suite of seven bright gallery rooms, one per work, joined by doorways and winding through
  the building (north, east, north, west, ...), so the visitor goes through a door and turns a
  corner on the way to almost every work. In each room the work hangs on its own wall, lit, in a
  slim frame with a museum label; its other paintings hang on another wall. Each tradition's
  rooms have their own faint wall tint.

  The page scroll drives the visitor (see SiteMuseum.vue): in the gap before each analysis you
  turn from the painting you were looking at, walk a curved path through the doorway into the
  next room, and turn to face its work; while its analysis is read you stay facing it. The camera
  eases towards where the scroll says it should be and looks where it is walking; the scene is
  drawn only while something is moving.
*/
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

/* scanned materials, models and light from Poly Haven (CC0), in public/assets/museum */
const SCAN = "assets/museum/";

const S = 12; // each room is S x S
const HEIGHT = 6.5;
const EYE = 1.62;
const DOOR_W = 3.2;
const DOOR_H = 4.3;
const VIEW = 5.6; // how far from a painting you stand to look at it
const HANG = 2.3; // height of a painting's centre
const LABEL_W = 1.0, LABEL_H = 0.61; // the wall label, in metres
const GAZE = 1.95; // eye height when facing a painting: you look at it level, so it is not foreshortened
const HAZE = 0xf1ede6;

/* the winding route: each step goes north (-z) or east/west (x) into the next room */
const STEPS = ["N", "E", "N", "W", "N", "E"];
const DIR = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const OPP = { N: "S", S: "N", E: "W", W: "E" };

/* the deep colour of the wall each work hangs on, per tradition */
const FEATURE = { hebrew: 0x5b4a35, indian: 0x2f4a46, greek: 0x2e3e50, french: 0x55292f };
/* a faint wall tint per tradition */
const TINT = { hebrew: 0xd9d1c3, indian: 0xd3d5cd, greek: 0xd0d4d7, french: 0xd6d0d2 };
const TRADITION = { job: "hebrew", panchatantra: "indian", ramayana: "indian", mahabharata: "indian", iliad: "greek", odyssey: "greek", roland: "french" };

/* each work's other paintings, for a second wall of its room */
const OTHERS = {
  job: ["job-blake-watercolor"],
  panchatantra: ["panchatantra-lion-bull", "panchatantra-tortoise-monkey"],
  ramayana: [],
  mahabharata: ["mahabharata-krishna-arjuna"],
  iliad: ["iliad-ivanov-priam", "iliad-david-andromache"],
  odyssey: ["odyssey-circe", "odyssey-waterhouse-sirens"],
  roland: ["roland-chroniques", "roland-michallon"],
};

const smooth = (t) => t * t * (3 - 2 * t);
/* a room's colours and its second wall's paintings: from the room itself, or from the tables above */
const tradOf = (w) => w.trad || TRADITION[w.id];
const othersOf = (w) => w.others || OTHERS[w.id] || [];
const roman = (n) => {
  let out = "";
  for (const [v, r] of [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]) while (n >= v) { out += r; n -= v; }
  return out;
};
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export function createMuseum(host, works, onFrame, onSlow) {
  const phone = window.matchMedia("(max-width: 760px)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  /* the museum sits behind the reading, softened by a veil and a vignette: it does not need every
     screen pixel. It starts a little under the screen's sharpness and drops lower if frames run slow */
  const sharpest = Math.min(window.devicePixelRatio || 1, phone ? 0.8 : 1);
  let ratio = sharpest; // under the screen's own resolution: the grain and vignette hide it, the GPU does far less
  renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  /* soft shadows from the spotlights; the room never moves, so they are worked out once, not every frame */
  renderer.shadowMap.enabled = false; // real-time shadows cost every pixel; the soft contact shadows stay
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  /* a browser drawing 3D without the graphics card (hardware acceleration off or blocked) would
     crawl: then the museum stays away and the site reads as plain pages */
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  if (/swiftshader|software|llvmpipe|basic render/i.test(gpu)) {
    renderer.dispose();
    throw new Error("no hardware 3D: " + gpu);
  }
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HAZE);
  scene.fog = new THREE.Fog(HAZE, 18, 60);
  const camera = new THREE.PerspectiveCamera(phone ? 68 : 52, 1, 0.1, 140);
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  /* light bouncing round a room, for soft gradients and reflections on brass, wood and floor */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  scene.environment = keep(pmrem.fromScene(roomEnv, 0.04).texture);
  scene.environmentIntensity = 0.3;
  roomEnv.dispose?.();
  new RGBELoader().load(SCAN + "museum-light.hdr", (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const env = keep(pmrem.fromEquirectangular(hdr).texture);
    hdr.dispose();
    pmrem.dispose();
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    wake();
  });

  /* a soft general light from the skylights, kept low so the lit paintings stand out from the room */
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x6e6152, 0.42));


  /* ---- the plan: room centres, and which way each room is entered and left ---- */
  const rooms = works.map(() => ({ x: 0, z: 0 }));
  for (let k = 1; k < works.length; k++) {
    const [dx, dz] = DIR[STEPS[(k - 1) % STEPS.length]];
    rooms[k] = { x: rooms[k - 1].x + dx * S, z: rooms[k - 1].z + dz * S };
  }
  rooms.forEach((r, k) => {
    r.entry = k === 0 ? "S" : OPP[STEPS[(k - 1) % STEPS.length]]; // the wall you come in through
    r.exit = k < works.length - 1 ? STEPS[k % STEPS.length] : null;
    /* the work hangs opposite the way in if that wall is free, otherwise to one side */
    const free = ["N", "E", "S", "W"].filter((d) => d !== r.entry && d !== r.exit);
    r.main = free.includes(OPP[r.entry]) ? OPP[r.entry] : free.includes("E") ? "E" : free[0];
    r.second = free.find((d) => d !== r.main && d !== r.entry) || free.find((d) => d !== r.main);
  });

  /* ---- floor and ceiling under the whole plan ---- */
  const xs = rooms.map((r) => r.x), zs = rooms.map((r) => r.z);
  const minX = Math.min(...xs) - S / 2, maxX = Math.max(...xs) + S / 2;
  const minZ = Math.min(...zs) - S / 2, maxZ = Math.max(...zs) + S / 2;
  const W = maxX - minX, D = maxZ - minZ, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const [oak, oakRough] = boardsTexture();
  keep(oak); keep(oakRough);
  oak.repeat.set(W / 6, D / 6);
  oakRough.repeat.copy(oak.repeat);
  oak.anisotropy = oakRough.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: oak, roughnessMap: oakRough, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  scene.add(floor);
  const scanLoader = new THREE.TextureLoader();
  /* a set of scanned maps, tiled every `metres`; calls back once all have arrived */
  function scanned(name, metres, w, h, done) {
    const maps = {};
    let left = 3;
    for (const [key, file, srgb] of [["map", "color", true], ["normalMap", "normal", false], ["orm", "orm", false]]) {
      scanLoader.load(SCAN + name + "-" + file + ".webp", (t) => {
        keep(t);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(w / metres, h / metres);
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        maps[key] = t;
        if (--left === 0) done(maps);
      });
    }
  }
  scanned("parquet", 1.6, W, D, (m) => {
    Object.assign(floor.material, { map: m.map, normalMap: m.normalMap, roughnessMap: m.orm, aoMap: m.orm, roughness: 1, envMapIntensity: 0.7, color: new THREE.Color(0xcdbca8) });
    floor.material.normalScale.set(0.8, 0.8);
    floor.material.needsUpdate = true;
    wake();
  });
  /* the ceiling, with a square opening above each room's centre for its skylight well */
  const ceilShape = new THREE.Shape();
  ceilShape.moveTo(minX, minZ); ceilShape.lineTo(maxX, minZ); ceilShape.lineTo(maxX, maxZ); ceilShape.lineTo(minX, maxZ); ceilShape.lineTo(minX, minZ);
  for (const r of rooms) {
    const hole = new THREE.Path();
    hole.moveTo(r.x - 2.4, r.z - 2.4); hole.lineTo(r.x - 2.4, r.z + 2.4); hole.lineTo(r.x + 2.4, r.z + 2.4); hole.lineTo(r.x + 2.4, r.z - 2.4); hole.lineTo(r.x - 2.4, r.z - 2.4);
    ceilShape.holes.push(hole);
  }
  const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(ceilShape), new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 1, side: THREE.DoubleSide }));
  ceiling.rotation.x = Math.PI / 2; // shape x,y -> world x,z
  ceiling.position.y = HEIGHT;
  scene.add(ceiling);

  /* ---- walls, doorways and skylights, room by room ---- */
  const wallShade = keep(wallShadeTexture());
  /* fine plaster grain, as bump and roughness, tiled finer than the wall's own shading */
  const plaster = keep(grainTexture(512, 0.5));
  plaster.repeat.set(5, 3);
  const wallMats = [];
  scanned("plaster", 2.2, S, HEIGHT, (m) => {
    for (const mat of wallMats) {
      Object.assign(mat, { bumpMap: null, normalMap: m.normalMap, roughnessMap: m.orm, roughness: 1 });
      mat.normalScale.set(0.6, 0.6);
      mat.needsUpdate = true;
    }
    wake();
  });
  const skyMat = new THREE.MeshBasicMaterial({ color: 0xf8f6f2 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 0.7 });
  const revealMat = new THREE.MeshStandardMaterial({ color: 0xd8d1c5, roughness: 0.9 });
  const corniceMat = new THREE.MeshStandardMaterial({ color: 0xe4ded4, roughness: 0.85 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.7 });
  const dadoMat = new THREE.MeshStandardMaterial({ color: 0xcfc4b2, roughness: 0.9 });
  const dadoDark = new THREE.MeshStandardMaterial({ color: 0x2b241e, roughness: 0.85, transparent: true, opacity: 0.35 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a6d47, roughness: 0.5, metalness: 0.2 });
  const wellMat = new THREE.MeshStandardMaterial({ color: 0xf2eee8, roughness: 1, side: THREE.BackSide });
  /* a wall's group: centred on the wall, local x along it, local +z pointing into the room */
  const ROT = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };
  const wallGroup = (r, d) => {
    const g = new THREE.Group();
    (r.parts || (r.parts = [])).push(g);
    const [dx, dz] = DIR[d];
    g.position.set(r.x + dx * (S / 2 - 0.01), 0, r.z + dz * (S / 2 - 0.01));
    g.rotation.y = ROT[d];
    scene.add(g);
    return g;
  };
  const panel = (g, mat, w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, 0);
    g.add(m);
  };
  rooms.forEach((r, k) => {
    const trad = tradOf(works[k]);
    const mat = new THREE.MeshStandardMaterial({ color: TINT[trad] || 0xece7df, map: wallShade, bumpMap: plaster, bumpScale: 0.6, roughnessMap: plaster, roughness: 1 });
    const feature = new THREE.MeshStandardMaterial({ color: FEATURE[trad] || 0x5a4a3a, map: wallShade, bumpMap: plaster, bumpScale: 0.8, roughnessMap: plaster, roughness: 0.95 });
    wallMats.push(mat, feature);
    r.walls = {};
    for (const d of ["N", "E", "S", "W"]) {
      const g = wallGroup(r, d);
      r.walls[d] = g;
      const door = d === r.exit || (k > 0 && d === r.entry);
      const wm = d === r.main ? feature : mat;
      if (!door) panel(g, wm, S, HEIGHT, 0, HEIGHT / 2);
      else {
        const side = (S - DOOR_W) / 2;
        panel(g, wm, side, HEIGHT, -(DOOR_W + side) / 2, HEIGHT / 2);
        panel(g, wm, side, HEIGHT, (DOOR_W + side) / 2, HEIGHT / 2);
        panel(g, wm, DOOR_W, HEIGHT - DOOR_H, 0, (HEIGHT + DOOR_H) / 2);
        /* the doorway has the thickness of a real wall, and a slim frame */
        for (const [w, h, x, y] of [[0.36, DOOR_H, -DOOR_W / 2 - 0.18, DOOR_H / 2], [0.36, DOOR_H, DOOR_W / 2 + 0.18, DOOR_H / 2], [DOOR_W + 0.72, 0.36, 0, DOOR_H + 0.18]]) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), revealMat);
          t.position.set(x, y, -0.24);
          g.add(t);
        }
        for (const [w, h, x, y] of [[0.1, DOOR_H, -DOOR_W / 2 - 0.05, DOOR_H / 2], [0.1, DOOR_H, DOOR_W / 2 + 0.05, DOOR_H / 2], [DOOR_W + 0.2, 0.1, 0, DOOR_H + 0.05]]) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), trimMat);
          t.position.set(x, y, 0.03);
          g.add(t);
        }
      }
    }
    /* a cornice along the top of each wall and a skirting board along the bottom */
    for (const d of ["N", "E", "S", "W"]) {
      const g = r.walls[d];
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(S, 0.22, 0.2), corniceMat);
      cornice.position.set(0, HEIGHT - 0.11, 0.1);
      g.add(cornice);
      const door = d === r.exit || (k > 0 && d === r.entry);
      const skirts = door ? [[-(S + DOOR_W) / 4 - 0.18, (S - DOOR_W) / 2 - 0.36], [(S + DOOR_W) / 4 + 0.18, (S - DOOR_W) / 2 - 0.36]] : [[0, S]];
      for (const [x, w] of skirts) {
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.04), skirtMat);
        skirt.position.set(x, 0.08, 0.02);
        const dado = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.95), d === r.main ? dadoDark : dadoMat);
        dado.position.set(x, 0.475, 0.012);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.05), railMat);
        rail.position.set(x, 0.96, 0.025);
        g.add(skirt, dado, rail);
      }
    }
    /* the skylight sits in a recessed well, glowing */
    const well = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.9, 4.8), wellMat);
    well.position.set(r.x, HEIGHT + 0.45, r.z);
    scene.add(well);
    r.parts.push(well);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), skyMat);
    sky.rotation.x = Math.PI / 2;
    sky.position.set(r.x, HEIGHT + 0.88, r.z);
    scene.add(sky);
    r.parts.push(sky);
  });

  /* ---- the paintings ---- */
  const loader = new THREE.TextureLoader();
  /* a painting's image, decoded off the main thread (so walking into a room never stalls on it)
     and no larger than it is ever seen on the wall */
  const bitmaps = typeof createImageBitmap === "function";
  function loadPainting(src, width, done) {
    if (!bitmaps) return loader.load(src, done);
    fetch(src)
      .then((r) => r.blob())
      .then((b) => createImageBitmap(b, { resizeWidth: width, resizeQuality: "high", premultiplyAlpha: "none" }))
      .then((bmp) => {
        const tex = new THREE.Texture(bmp);
        tex.flipY = false; // (a bitmap is not flipped on upload: flip it through its coordinates instead)
        tex.repeat.set(1, -1);
        tex.offset.set(0, 1);
        tex.needsUpdate = true;
        done(tex);
      })
      .catch(() => loader.load(src, done));
  }
  const patina = keep(grainTexture(256, 0.35));
  patina.repeat.set(3, 3);
  const wood = new THREE.MeshStandardMaterial({ color: 0x24190f, roughness: 0.55, roughnessMap: patina });
  const gilt = new THREE.MeshStandardMaterial({ color: 0xc9a160, metalness: 1, roughness: 0.42, roughnessMap: patina });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xb08a4e, metalness: 1, roughness: 0.3 });
  /* a frame moulding: a rectangle with the picture's opening cut out, extruded with a rounded bevel */
  function moulding(w, h, border, depth, bevel) {
    const o = new THREE.Shape();
    const W2 = w / 2 + border, H2 = h / 2 + border;
    o.moveTo(-W2, -H2); o.lineTo(W2, -H2); o.lineTo(W2, H2); o.lineTo(-W2, H2); o.lineTo(-W2, -H2);
    const hole = new THREE.Path();
    hole.moveTo(-w / 2, -h / 2); hole.lineTo(-w / 2, h / 2); hole.lineTo(w / 2, h / 2); hole.lineTo(w / 2, -h / 2); hole.lineTo(-w / 2, -h / 2);
    o.holes.push(hole);
    return new THREE.ExtrudeGeometry(o, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 });
  }
  const pool = keep(glowTexture());
  const shadow = keep(shadowTexture());

  /* ceiling spotlights with a soft edge. Only the room you are in and the one you came from are
     lit by them, so a fixed few are moved from room to room: the GPU lights each pixel with 4
     lights instead of 14, and the count never changes, so nothing is recompiled on the way */
  const makeSpot = (shadows) => {
    const light = new THREE.SpotLight(0xffe2b8, 0, 18, 0.5, 0.75, 1.4);
    if (shadows) {
      light.castShadow = false;
      light.shadow.mapSize.set(phone ? 512 : 1024, phone ? 512 : 1024);
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.02;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 16;
    }
    scene.add(light, light.target);
    return light;
  };
  const mainSpots = [makeSpot(true), makeSpot(true)];
  const secondSpots = []; // (the side walls are lit by the room's general light: two lights a pixel, not four)
  function aim(light, r, d, power) {
    const [dx, dz] = DIR[d];
    light.position.set(r.x + dx * (S / 2 - 3.2), HEIGHT - 0.3, r.z + dz * (S / 2 - 3.2));
    light.target.position.set(r.x + dx * (S / 2), HANG, r.z + dz * (S / 2));
    /* (the building's matrices are frozen: work these two out by hand) */
    light.updateMatrix();
    light.target.updateMatrix();
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    light.intensity = power;
  }
  let litFor = null;
  function lightRooms(ks) {
    const key = ks.join();
    if (key === litFor) return;
    litFor = key;
    ks.forEach((k, slot) => {
      const r = rooms[k];
      aim(mainSpots[slot], r, r.main, 120);
      const second = secondSpots[slot];
      if (!second) return;
      if (r.second && othersOf(works[k]).length) aim(second, r, r.second, 70);
      else second.intensity = 0;
    });
    renderer.shadowMap.needsUpdate = true;
  }

  /* heavy things (painting images, scanned models) wait until their room is near; while the
     rooms are built, `building` is the room being built, so they can be queued on it */
  let building = null;
  const later = (fn) => (building ? building.pending.push(fn) : fn());

  /* hang one painting on a wall group at local x; max size in metres */
  function hang(g, src, x, maxW, maxH, label, onSize) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.22 }));
    const drop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false }));
    const lip = new THREE.Mesh(new THREE.BufferGeometry(), gilt);
    const frame = new THREE.Mesh(new THREE.BufferGeometry(), wood);
    /* a brass picture lamp on a short arm above the frame */
    const lamp = new THREE.Group();
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 20), lampMat);
    hood.rotation.z = Math.PI / 2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), lampMat);
    arm.rotation.x = Math.PI / 2 - 0.5;
    arm.position.set(0, 0.07, -0.13);
    lamp.add(hood, arm);
    if (label) g.add(lamp); // only above each work's own painting
    const art = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf2eee8, toneMapped: false }));
    glow.position.set(x, HANG + 0.35, 0.005);
    drop.position.set(x + 0.05, HANG - 0.12, 0.01);
    lip.position.set(x, HANG, 0.09);
    frame.position.set(x, HANG, 0.055);
    art.position.set(x, HANG, 0.1);
    g.add(glow, drop, lip, frame, art);
    const fit = (aspect) => {
      let w = maxW, h = w / aspect;
      if (h > maxH) { h = maxH; w = h * aspect; }
      art.scale.set(w, h, 1);
      if (onSize) onSize(w, h, art);
      lip.geometry.dispose();
      lip.geometry = moulding(w, h, 0.035, 0.02, 0.018);
      frame.geometry.dispose();
      frame.geometry = moulding(w + 0.07, h + 0.07, 0.15, 0.03, 0.045);
      hood.scale.set(1, Math.min(1.4, w * 0.45), 1);
      lamp.position.set(x, HANG + h / 2 + 0.36, 0.42);
      drop.scale.set(w + 1.1, h + 1.1, 1);
      glow.scale.set(w * 2.4, h * 2.1, 1);
      if (label) {
        if (phone) label.position.set(x, HANG - h / 2 - 0.62, 0.02);
        else label.position.set(x + w / 2 + 0.3 + LABEL_W / 2, 1.5, 0.02);
      }
    };
    fit(0.8);
    later(() => loadPainting(src, label ? (phone ? 900 : 1280) : 720, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      art.material.map = tex;
      art.material.color.set(0xffffff);
      art.material.needsUpdate = true;
      keep(tex);
      fit(tex.image.width / tex.image.height);
      renderer.initTexture(tex); // upload now, while you are still a room away
      renderer.shadowMap.needsUpdate = true;
      moved();
    }));
  }

  rooms.forEach((r, k) => {
    building = r;
    r.pending = [];
    const w = works[k];
    const label = new THREE.Group();
    const card = new THREE.Mesh(new THREE.PlaneGeometry(LABEL_W, LABEL_H), new THREE.MeshStandardMaterial({ color: 0xf3efe7, roughness: 0.92 }));
    later(() => document.fonts.load("600 124px 'Bodoni Moda'").then(() => document.fonts.load("600 56px Montserrat")).catch(() => {}).then(() => {
      const tex = keep(labelTexture(w, k)); // drawn only once its room is near, in the site's own fonts
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); // crisp, though seen at an angle
      card.material.map = tex;
      card.material.color.set(0xffffff);
      card.material.needsUpdate = true;
      wake();
    }));
    card.position.z = 0.014; // just in front of the board, so the two never fight over the same depth
    const board = new THREE.Mesh(new THREE.BoxGeometry(LABEL_W, LABEL_H, 0.012), new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.9 }));
    board.position.z = 0.006;
    label.add(board, card);
    r.walls[r.main].add(label);
    hang(r.walls[r.main], w.plate.src, 0, 3.6, 3.1, label, (pw, ph, mesh) => (r.art = { w: pw, h: ph, mesh }));
    const others = othersOf(w).map((n) => `assets/img/${n}.webp`);
    if (r.second && others.length) {
      const xs2 = others.length === 1 ? [0] : [-2.6, 2.6];
      others.slice(0, 2).forEach((src, i) => hang(r.walls[r.second], src, xs2[i], 2.2, 2.0, null));
    }
  });
  building = null;

  /* ---- furniture: a bench and a rope in front of each work, a vessel on a plinth, room signs ---- */
  const V2 = (x, y) => new THREE.Vector2(x, y);
  /* a smooth turned profile through a few points, for the lathe */
  const turned = (pts, n = 48) => new THREE.SplineCurve(pts.map(([x, y]) => V2(x, y))).getPoints(n);
  const bench = oak.clone();
  bench.repeat.set(0.5, 0.08);
  bench.needsUpdate = true;
  keep(bench);
  const oakMat = new THREE.MeshStandardMaterial({ map: bench, color: 0xc8b49a, roughness: 0.5, roughnessMap: patina });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 0.45, metalness: 0.8, roughnessMap: patina });
  /* satin bronze, not cartoon gold: darker, with a slightly uneven sheen */
  const brassMat = new THREE.MeshStandardMaterial({ color: 0x8c6c3e, roughness: 0.3, metalness: 1, roughnessMap: patina });
  /* velvet: deep, matte, with a soft sheen along its edges */
  const velvetMat = new THREE.MeshStandardMaterial({ color: 0x5a1219, roughness: 0.85 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0xa9a196, roughness: 0.9, bumpMap: plaster, bumpScale: 0.4, roughnessMap: plaster });
  const toeMat = new THREE.MeshStandardMaterial({ color: 0x1f1b17, roughness: 0.7 });

  /* a stanchion: weighted domed foot, tapered pole, collar and a ball finial, all one turned piece */
  const stanchion = new THREE.LatheGeometry(
    turned([[0, 0], [0.17, 0], [0.175, 0.012], [0.15, 0.03], [0.06, 0.06], [0.03, 0.09], [0.024, 0.3], [0.021, 0.8], [0.032, 0.83], [0.032, 0.86], [0.02, 0.875], [0.042, 0.91], [0.03, 0.95], [0, 0.96]], 60),
    40
  );
  const ropeEnd = new THREE.CylinderGeometry(0.03, 0.03, 0.07, 16);
  const contactMat = new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false, opacity: 0.85 });
  /* each scanned model is loaded once and shared by the rooms that show it */
  const models = {};
  const gltf = new GLTFLoader();
  function onModel(name, use) {
    if (!models[name]) {
      models[name] = { scene: null, waiting: [] };
      gltf.load(SCAN + name + "/" + name + ".gltf", (res) => {
        res.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = o.receiveShadow = true;
          if (o.material.map) o.material.map.anisotropy = 4;
        });
        /* its shaders compile in the background (where the browser can), then it goes on its plinths */
        const ready = () => {
          models[name].scene = res.scene;
          models[name].waiting.forEach((fn) => fn(res.scene));
          models[name].waiting = [];
        };
        (renderer.compileAsync ? renderer.compileAsync(res.scene, camera, scene) : Promise.resolve()).then(ready, ready);
      });
    }
    if (models[name].scene) use(models[name].scene);
    else models[name].waiting.push(use);
  }
  rooms.forEach((r, k) => {
    building = r;
    const g = r.walls[r.main];
    /* an oak bench, facing the work, with softened edges */
    const seat = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.07, 0.52, 3, 0.02), oakMat);
    seat.position.set(0, 0.46, 3.3);
    g.add(seat);
    for (const x of [-1, 1]) {
      const leg = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.42, 0.46, 2, 0.012), ironMat);
      leg.position.set(x * 1.0, 0.21, 3.3);
      g.add(leg);
    }
    const rail = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.04, 0.04, 2, 0.01), ironMat);
    rail.position.set(0, 0.12, 3.3);
    g.add(rail);
    /* bronze stanchions and a velvet rope, hooked to them with bronze caps */
    for (const x of [-2.1, 2.1]) {
      const post = new THREE.Mesh(stanchion, brassMat);
      post.position.set(x, 0, 1.1);
      g.add(post);
      const cap = new THREE.Mesh(ropeEnd, brassMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(x - Math.sign(x) * 0.06, 0.84, 1.1);
      g.add(cap);
    }
    const ropePath = new THREE.CatmullRomCurve3([new THREE.Vector3(-2.02, 0.84, 1.1), new THREE.Vector3(-1, 0.68, 1.1), new THREE.Vector3(0, 0.63, 1.1), new THREE.Vector3(1, 0.68, 1.1), new THREE.Vector3(2.02, 0.84, 1.1)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(ropePath, 64, 0.026, 12), velvetMat));
    /* a vessel on a plinth in the corner (a black-figure amphora in the Greek rooms, bronze elsewhere) */
    const px = -(S / 2 - 1.1);
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(0.62, 1.0, 0.62, 3, 0.01), plinthMat);
    plinth.position.set(px, 0.55, 1.1);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.56), toeMat); // a recessed dark foot, so it seems to float
    toe.position.set(px, 0.025, 1.1);
    g.add(plinth, toe);
    /* soft contact shadows where things meet the floor */
    for (const [x, z, w, d] of [[0, 3.3, 2.9, 0.9], [px, 1.1, 0.95, 0.95], [-2.1, 1.1, 0.5, 0.5], [2.1, 1.1, 0.5, 0.5]]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(w, d), contactMat);
      c.rotation.x = -Math.PI / 2;
      c.position.set(x, 0.004, z);
      g.add(c);
    }
    /* what stands on the plinth: a marble bust in the Greek rooms, a brass vase in the Indian ones,
       an antique ceramic vase elsewhere */
    const trad = tradOf(works[k]);
    const piece = trad === "greek" ? "marble_bust_01" : trad === "indian" ? "brass_vase_01" : "antique_ceramic_vase_01";
    later(() => onModel(piece, (model) => {
      const m = model.clone();
      m.scale.setScalar({ marble_bust_01: 1.35, brass_vase_01: 1.05, antique_ceramic_vase_01: 1.55 }[piece]);
      m.position.set(px, 1.05, 1.1);
      m.rotation.y = 0.6 + k * 0.9;
      g.add(m);
      renderer.shadowMap.needsUpdate = true;
      moved();
    }));
    /* above the way out, the name of the next room */
    if (r.exit && works[k + 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.42), new THREE.MeshBasicMaterial({ map: keep(signTexture(works[k + 1], k + 1)), transparent: true, toneMapped: false }));
      sign.position.set(0, DOOR_H + 0.75, 0.03);
      r.walls[r.exit].add(sign);
    }
  });
  building = null;

  scene.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
    o.receiveShadow = true;
    /* walls, floor and ceiling only receive shadows: drawing them into the shadow maps too would
       double the cost of every shadow update for nothing you could see */
    const t = o.geometry.type;
    o.castShadow = t !== "PlaneGeometry" && t !== "ShapeGeometry";
  });
  renderer.shadowMap.needsUpdate = true;
  /* nothing in the building moves, so its matrices are worked out once here, and again only when
     a painting, a model or a light is placed (moved()), not on every frame */
  let stale = true;
  scene.matrixWorldAutoUpdate = false;
  scene.traverse((o) => (o.matrixAutoUpdate = false));
  function freshen() {
    if (!stale) return;
    stale = false;
    scene.traverse((o) => o.updateMatrix());
    scene.updateMatrixWorld(true);
  }
  function moved() {
    stale = true;
    wake();
  }
  freshen();
  renderer.compile(scene, camera); // every shader now, rather than as each room comes into view
  renderer.render(scene, camera); // and every room's geometry onto the graphics card, once, while the page loads

  /* ---- where the visitor stands and looks ---- */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const inward = (d) => { const [dx, dz] = DIR[d]; return V(-dx, 0, -dz); };
  const wallPoint = (r, d, inset) => { const [dx, dz] = DIR[d]; return V(r.x + dx * (S / 2 - inset), EYE, r.z + dz * (S / 2 - inset)); };
  const artPoint = (k) => { const p = wallPoint(rooms[k], rooms[k].main, 0); p.y = HANG; return p; };
  const viewPoint = (k) => wallPoint(rooms[k], rooms[k].main, VIEW);
  /* where you look when you stand at room k: its painting, or (where its section stands beside it,
     on a wide screen) a little to the right of it, so the painting hangs on the left of the view */
  const facePoint = (k, y = GAZE) => {
    const p = artPoint(k).setY(y);
    if (!works[k].side || window.innerWidth < 1000) return p;
    const f = inward(rooms[k].main).negate();
    return p.addScaledVector(V(-f.z, 0, f.x), 2.4);
  };
  /* where you stand at the top of the site: a step back from the first room's painting, looking a
     little to the left of it, so it hangs on the right of the view beside the page's title */
  const facing0 = inward(rooms[0].main).negate();
  const left0 = V(facing0.z, 0, -facing0.x);
  const start = viewPoint(0).addScaledVector(facing0, -1.6).setY(GAZE);
  const startLook = artPoint(0).setY(GAZE).addScaledVector(left0, 1.9);

  /* the curved path into room k: from where you stood, out through the doorway, to the painting */
  const paths = rooms.map((r, k) => {
    if (k === 0) return new THREE.CatmullRomCurve3([start, viewPoint(0).lerp(start, 0.5), viewPoint(0)], false, "centripetal"); // a step up to it
    const a = rooms[k - 1];
    const door = V((a.x + r.x) / 2, EYE, (a.z + r.z) / 2);
    const [dx, dz] = DIR[STEPS[(k - 1) % STEPS.length]];
    const through = V(dx, 0, dz);
    return new THREE.CatmullRomCurve3(
      [viewPoint(k - 1), door.clone().addScaledVector(through, -2.6), door.clone().addScaledVector(through, 2.6), viewPoint(k)],
      false,
      "centripetal"
    );
  });

  /* pose (position + point looked at) on the walk to room k, t from 0 to 1 */
  function poseOn(k, t) {
    const path = paths[k];
    const s = smooth(clamp01((t - 0.12) / 0.76)); // a moment to turn away first, then walk, then settle
    const pos = path.getPointAt(s);
    const ahead = path.getPointAt(Math.min(1, s + 0.06));
    const heading = ahead.clone().sub(pos);
    const walkLook = heading.lengthSq() > 1e-6 ? ahead.clone().addScaledVector(heading.normalize(), 3) : artPoint(k);
    const arrive = smooth(clamp01((t - 0.62) / 0.38));
    pos.y += (GAZE - EYE) * Math.max(arrive, k === 0 ? 0 : 1 - smooth(clamp01(t / 0.3))); // stand tall to face a painting, ease down to walk on
    const from = k === 0 ? startLook : facePoint(k - 1);
    const look = walkLook.clone();
    look.lerp(from, 1 - smooth(clamp01(t / 0.3))); // still looking at the last painting as you set off
    look.lerp(facePoint(k, pos.y), arrive); // and turning to the new one, level, as you arrive
    pos.y += Math.sin(s * path.getLength() * 2.2) * 0.025 * Math.sin(s * Math.PI); // a gentle step
    return { pos, look };
  }

  /* ---- drawing: ease towards the target, draw only while moving ---- */
  let target = { pos: start.clone(), look: startLook.clone() };
  const cur = { pos: target.pos.clone(), look: target.look.clone() };
  const mid = { pos: target.pos.clone(), look: target.look.clone() };
  let frame = 0;
  let active = true;

  let lastDraw = 0, slow = 0;
  let walking = false;
  let crawl = 0;
  let fast = 0;
  /* (one steady resolution: resizing the canvas as each walk starts and ends would stall it) */
  function setWalking() {
    renderer.setPixelRatio(ratio);
    renderer.setSize(host.clientWidth, host.clientHeight, false);
  }
  function draw(now) {
    frame = 0;
    /* a frame that took far longer than the screen's refresh, many times over: draw fewer pixels */
    if (lastDraw && now - lastDraw < 1000) {
      const took = now - lastDraw;
      /* judged only while walking (a page loading is not the museum being slow), and a lowered
         resolution is raised again once the walk runs easily, so the view never stays soft */
      if (walking) {
        slow = took > 24 ? slow + 1 : Math.max(0, slow - 1);
        fast = took < 12 ? fast + 1 : 0;
        if (fast > 150 && ratio < sharpest) {
          ratio = Math.min(sharpest, ratio + 0.15);
          setWalking(walking);
          fast = 0;
        }
      }
      /* still crawling at the lowest resolution while you walk: this browser cannot draw the museum
         (no graphics card for it): hand back to the plain pages */
      if (walking) {
        crawl = took > 70 ? crawl + 1 : Math.max(0, crawl - 2);
        if (crawl > 15 && onSlow) return onSlow();
      }
      if (slow > 12 && ratio > 0.5) {
        ratio = Math.max(0.5, ratio - 0.15);
        setWalking(walking);
        slow = 0;
      }
    }
    /* follow the scroll closely, at the same pace whatever the screen's refresh rate */
    const dt = lastDraw && now - lastDraw < 100 ? now - lastDraw : 16.7;
    lastDraw = now;
    /* two easings in a row: each mouse-wheel step becomes one smooth glide, instead of a jump that
       then slows down (which reads as stutter), and it still keeps close to the scroll */
    const ease = 1 - Math.exp(-dt / 45);
    mid.pos.lerp(target.pos, ease);
    mid.look.lerp(target.look, ease);
    cur.pos.lerp(mid.pos, ease);
    cur.look.lerp(mid.look, ease * 0.9);
    camera.position.copy(cur.pos);
    camera.lookAt(cur.look);
    /* while you walk, draw far fewer pixels (motion hides it); sharp again once you stand still */
    walking = cur.pos.distanceTo(target.pos) + cur.look.distanceTo(target.look) > 0.03;
    freshen();
    /* only the rooms you can see from where you are (yours and the ones beside it) are drawn */
    cull(cur.pos);
    renderer.render(scene, camera);
    if (onFrame) onFrame();
    const moving = cur.pos.distanceTo(target.pos) + cur.look.distanceTo(target.look) + mid.pos.distanceTo(target.pos);
    if (moving > 0.002 && active) frame = requestAnimationFrame(draw);
  }
  /* what a room needs as you come near (images, models, labels) is set going in idle moments, one
     piece at a time, never inside a frame of the walk */
  const queue = [];
  let idle = 0;
  const later2 = window.requestIdleCallback || ((fn) => setTimeout(fn, 16));
  /* never while you walk: an upload or a label drawn mid-walk is exactly a dropped frame. They wait
     until the camera stands still */
  function work() {
    idle = 0;
    if (walking) {
      idle = setTimeout(() => ((idle = 0), wake()), 250);
      return;
    }
    const job = queue.shift();
    if (job) job();
    if (queue.length) idle = later2(work);
  }
  function cull(at) {
    for (const r of rooms) {
      const near = Math.hypot(r.x - at.x, r.z - at.z) < S * 1.75;
      if (r.parts && r.parts[0].visible !== near) r.parts.forEach((p) => (p.visible = near));
      if (near && r.pending.length) {
        queue.push(...r.pending.splice(0)); // its paintings, as you come near
        if (!idle) idle = later2(work); // (set going now: you may stop here and not move again)
      }
    }
  }
  function wake() {
    if (queue.length && !idle) idle = later2(work, { timeout: 300 });
    if (!frame && active) frame = requestAnimationFrame(draw);
  }

  /* k = the work being walked to, t = how far along (1 = facing it) */
  function setWalk(k, t) {
    const was = target;
    const room = Math.max(0, k);
    lightRooms(room === 0 ? [0, 1] : [room, room - 1]);
    if (k < 0) target = { pos: start.clone(), look: startLook.clone() };
    else if (t < 1) target = poseOn(k, clamp01(t));
    else target = { pos: viewPoint(k).setY(GAZE), look: facePoint(k) };
    /* standing still (facing a painting while its analysis comes up): nothing to redraw */
    if (was.pos.distanceTo(target.pos) + was.look.distanceTo(target.look) > 1e-5) wake();
  }


  /* where painting k is on screen right now, in pixels from the canvas's top left */
  const corner = new THREE.Vector3();
  function artRect(k) {
    const art = rooms[k] && rooms[k].art;
    if (!art || !art.mesh) return null;
    const W = host.clientWidth, H = host.clientHeight;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      corner.set(cx, cy, 0).applyMatrix4(art.mesh.matrixWorld).project(camera);
      const x = ((corner.x + 1) / 2) * W, y = ((1 - corner.y) / 2) * H;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  /* painting k has lifted off its wall (its frame shows empty); -1 puts every painting back */
  function lift(k) {
    rooms.forEach((r, i) => r.art && r.art.mesh && (r.art.mesh.visible = i !== k));
    wake();
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.position.copy(cur.pos);
    camera.lookAt(cur.look);
    renderer.render(scene, camera);
  }
  function setActive(on) {
    active = on;
    if (on) wake();
  }
  function dispose() {
    cancelAnimationFrame(frame);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    disposables.forEach((t) => t.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }

  /* the three scanned models load and compile in idle moments from the start, so none of them is
     being set up just as you walk into its room */
  for (const name of ["marble_bust_01", "brass_vase_01", "antique_ceramic_vase_01"]) queue.push(() => onModel(name, () => {}));
  resize();
  /* a quick test before showing anything: a few real frames, timed to the end of the GPU's work.
     A browser drawing 3D without a graphics card takes many times longer: then no museum (some
     browsers, like Brave, hide which GPU they use, so the name above cannot tell) */
  camera.position.copy(start);
  camera.lookAt(startLook);
  cull(start);
  const px = new Uint8Array(4);
  const frameTime = () => {
    const t0 = performance.now();
    renderer.render(scene, camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // waits for the frame to finish
    return performance.now() - t0;
  };
  frameTime(); // (the first frame also sets things up: not counted)
  const test = (frameTime() + frameTime() + frameTime()) / 3;
  if (test > 45) {
    dispose();
    throw new Error("too slow for the museum: " + test.toFixed(0) + " ms a frame");
  }
  /* go straight to where you are heading (behind a fade, for a jump to a far wing) */
  function snap() {
    cur.pos.copy(target.pos);
    cur.look.copy(target.look);
    mid.pos.copy(target.pos);
    mid.look.copy(target.look);
    wake();
  }
  /* load rooms from..to in idle moments now (while the page is being read, the camera still),
     rather than as you walk into them */
  function preload(from, to) {
    for (let i = Math.max(0, from); i <= Math.min(rooms.length - 1, to); i++) if (rooms[i].pending.length) queue.push(...rooms[i].pending.splice(0));
    wake();
  }
  return { gpu, ratio: () => ratio, preload, setWalk, snap, artRect, lift, resize, setActive, dispose };
}

/* ---- textures, drawn once on a canvas ---- */
function canvasTexture(w, h, paint, repeat = false, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* pale stone slabs with faint seams and a little variation */
function stoneTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const tones = ["#d9d2c6", "#d4ccbf", "#ddd6cb", "#d1c9bb"];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = tones[(x + y * 2) % 4];
      g.fillRect(x * 256, y * 256, 256, 256);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "120,105,90"}, .05)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = "rgba(120, 105, 90, .35)";
    g.lineWidth = 2;
    for (const p of [0, 256]) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
    }
  }, true);
}

/* oak planks, with a little variation from board to board */
function oakTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const rows = 8, rh = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -(i * 97) % 180;
      while (x < w) {
        const len = 180 + ((i * 53 + x) % 120);
        const tone = 124 + ((i * 31 + Math.round(x)) % 12);
        g.fillStyle = `rgb(${tone + 34}, ${tone + 6}, ${tone - 34})`;
        g.fillRect(x, i * rh, len, rh);
        g.strokeStyle = "rgba(40, 25, 12, .3)";
        g.lineWidth = 2;
        g.strokeRect(x, i * rh, len, rh);
        for (let j = 0; j < 6; j++) { // grain
          g.strokeStyle = "rgba(60, 38, 18, .12)";
          g.beginPath();
          const y = i * rh + 6 + j * (rh / 6);
          g.moveTo(x, y);
          g.bezierCurveTo(x + len / 3, y + 3, x + (2 * len) / 3, y - 3, x + len, y + 1);
          g.stroke();
        }
        x += len;
      }
    }
  }, true);
}

/* fine grain (value noise at a few scales), for bump and roughness: plaster, patina */
function grainTexture(size, contrast) {
  return canvasTexture(size, size, (g, w, h) => {
    const img = g.createImageData(w, h);
    const layer = (cell) => {
      const n = Math.ceil(w / cell) + 1, grid = new Float32Array(n * n).map(() => Math.random());
      const at = (x, y) => grid[(y % (n - 1)) * n + (x % (n - 1))];
      return (x, y) => {
        const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        return a + (b - a) * sy;
      };
    };
    const octaves = [[layer(64), 0.4], [layer(16), 0.3], [layer(4), 0.2], [layer(1), 0.1]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 0;
      for (const [fn, a] of octaves) v += fn(x, y) * a;
      const c = Math.round(255 * Math.min(1, Math.max(0, 0.5 + (v - 0.5) * 2 * contrast + 0.25)));
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, true, false);
}

/* long narrow oak boards: colour (with streaky grain and board-to-board variation) and a matching
   roughness map, so the varnish catches the light unevenly, as real floors do */
function boardsTexture() {
  const size = 1024, rows = 10, rh = size / rows;
  const boards = [];
  for (let i = 0; i < rows; i++) {
    let x = -Math.random() * 400;
    while (x < size) {
      const len = 300 + Math.random() * 420;
      boards.push({ x, y: i * rh, len, tone: Math.random(), seed: Math.random() * 1000 });
      x += len;
    }
  }
  const color = canvasTexture(size, size, (g) => {
    for (const b of boards) {
      const t = b.tone;
      g.fillStyle = `rgb(${Math.round(118 + t * 34)}, ${Math.round(82 + t * 24)}, ${Math.round(52 + t * 16)})`;
      g.fillRect(b.x, b.y, b.len, rh);
      /* grain: many fine streaks running along the board, a few darker */
      for (let j = 0; j < 46; j++) {
        const y = b.y + Math.random() * rh, dark = Math.random() < 0.25;
        g.strokeStyle = dark ? "rgba(52, 32, 16, .22)" : `rgba(${Math.random() < 0.5 ? "70, 44, 22" : "200, 160, 110"}, ${0.05 + Math.random() * 0.08})`;
        g.lineWidth = dark ? 1 + Math.random() * 1.5 : 0.6 + Math.random() * 1.2;
        g.beginPath();
        g.moveTo(b.x, y);
        const wob = 2 + Math.random() * 4;
        g.bezierCurveTo(b.x + b.len * 0.33, y + wob, b.x + b.len * 0.66, y - wob, b.x + b.len, y + (Math.random() - 0.5) * 3);
        g.stroke();
      }
      /* the odd knot */
      if (Math.random() < 0.35) {
        const kx = b.x + Math.random() * b.len, ky = b.y + rh * (0.3 + Math.random() * 0.4);
        const grad = g.createRadialGradient(kx, ky, 0, kx, ky, 9);
        grad.addColorStop(0, "rgba(40, 24, 12, .55)");
        grad.addColorStop(1, "rgba(40, 24, 12, 0)");
        g.fillStyle = grad;
        g.fillRect(kx - 12, ky - 10, 24, 20);
      }
      /* a fine dark seam where boards meet */
      g.fillStyle = "rgba(28, 18, 10, .7)";
      g.fillRect(b.x, b.y, b.len, 1.5);
      g.fillRect(b.x, b.y, 1.5, rh);
    }
  }, true);
  const rough = canvasTexture(size, size, (g) => {
    for (const b of boards) {
      const v = Math.round(70 + b.tone * 60); // some boards more worn than others
      g.fillStyle = `rgb(${v}, ${v}, ${v})`;
      g.fillRect(b.x, b.y, b.len, rh);
      g.fillStyle = "rgb(230, 230, 230)"; // seams are dull
      g.fillRect(b.x, b.y, b.len, 2);
      g.fillRect(b.x, b.y, 2, rh);
    }
    for (let i = 0; i < 3000; i++) { // scuffs
      g.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.12})`;
      g.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 18, 1);
    }
  }, true, false);
  return [color, rough];
}

/* an Attic black-figure amphora wrapped round the lathe: orange clay with a mottled surface,
   black glaze on the foot, neck and lip, a figure frieze on the belly and bands of tongues and
   meanders, all a little hand-painted (nothing quite straight) */
function amphoraTexture() {
  return canvasTexture(1024, 512, (g, w, h) => {
    /* v runs from the foot (bottom of the canvas) to the lip (top) */
    const y = (v) => h * (1 - v);
    g.fillStyle = "#b8653a";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { // mottling of the fired clay
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "120, 52, 24" : "214, 140, 96"}, ${Math.random() * 0.08})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    const glaze = "rgba(22, 16, 13, .94)";
    const band = (v0, v1) => {
      g.fillStyle = glaze;
      g.beginPath();
      g.moveTo(0, y(v0));
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y(v1) + Math.sin(x * 0.02) * 1.5);
      for (let x = w; x >= 0; x -= 32) g.lineTo(x, y(v0) + Math.cos(x * 0.017) * 1.5);
      g.fill();
    };
    band(0, 0.1); // foot
    band(0.7, 1); // neck and lip
    band(0.13, 0.15);
    band(0.6, 0.62);
    /* tongues round the shoulder */
    g.fillStyle = glaze;
    for (let x = 0; x < w; x += 20) {
      g.beginPath();
      g.ellipse(x + 10, y(0.655), 6, 13, 0, 0, Math.PI * 2);
      g.fill();
    }
    /* a meander under the frieze */
    g.strokeStyle = glaze;
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x < w; x += 24) {
      const a = y(0.2), b2 = y(0.24);
      g.moveTo(x, a); g.lineTo(x, b2); g.lineTo(x + 18, b2); g.lineTo(x + 18, a + 8); g.lineTo(x + 8, a + 8);
    }
    g.stroke();
    /* the frieze: striding black figures with spears and round shields */
    for (let i = 0; i < 6; i++) {
      const cx = (i + 0.5) * (w / 6), base = y(0.27), top = y(0.56);
      const hgt = base - top;
      g.fillStyle = glaze;
      g.beginPath(); g.ellipse(cx, top + hgt * 0.1, hgt * 0.06, hgt * 0.075, 0, 0, Math.PI * 2); g.fill(); // head
      g.beginPath(); // body, legs mid-stride
      g.moveTo(cx - hgt * 0.07, top + hgt * 0.2); g.lineTo(cx + hgt * 0.07, top + hgt * 0.2);
      g.lineTo(cx + hgt * 0.05, top + hgt * 0.55); g.lineTo(cx + hgt * 0.2, base); g.lineTo(cx + hgt * 0.12, base);
      g.lineTo(cx, top + hgt * 0.62); g.lineTo(cx - hgt * 0.12, base); g.lineTo(cx - hgt * 0.2, base);
      g.lineTo(cx - hgt * 0.05, top + hgt * 0.55); g.closePath(); g.fill();
      g.beginPath(); g.arc(cx + hgt * 0.13, top + hgt * 0.38, hgt * 0.16, 0, Math.PI * 2); g.fill(); // shield
      g.strokeStyle = "rgba(184, 101, 58, .8)"; // incised rim, the way black-figure was detailed
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(cx + hgt * 0.13, top + hgt * 0.38, hgt * 0.12, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = glaze;
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx - hgt * 0.25, top + hgt * 0.95); g.lineTo(cx + hgt * 0.05, top - hgt * 0.05); g.stroke(); // spear
    }
  });
}

/* bronze: warm metal under a mottled brown-green patina, brighter where hands have worn it */
function bronzeTexture() {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = "#7a5a32";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const r = 2 + Math.random() * 14;
      g.fillStyle = Math.random() < 0.45 ? `rgba(70, 96, 74, ${Math.random() * 0.22})` : `rgba(${Math.random() < 0.5 ? "40, 28, 16" : "176, 132, 78"}, ${Math.random() * 0.16})`;
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "rgba(30, 22, 14, .5)"; // two cast rings round the belly
    g.fillRect(0, h * 0.42, w, 3);
    g.fillRect(0, h * 0.47, w, 2);
  });
}

/* the name of the next room, painted above the doorway */
function signTexture(w, k) {
  return canvasTexture(1360, 168, (g, cw, ch) => {
    g.fillStyle = "#6b5b45";
    g.font = "500 44px Montserrat, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const text = `ROOM ${roman(k + 1)}  ·  ${w.title.toUpperCase()}`;
    g.fillText(text.split("").join("\u200A"), cw / 2, ch / 2);
  });
}

/* walls: a touch darker towards the floor and the ceiling, as real light falls off */
function wallShadeTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    /* shade into the floor, the ceiling and both corners, as light falls off where surfaces meet */
    const edge = (x0, y0, x1, y1, a) => {
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, `rgba(90, 78, 64, ${a})`);
      grad.addColorStop(1, "rgba(90, 78, 64, 0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    };
    edge(0, h, 0, h * 0.7, 0.42); // floor
    edge(0, 0, 0, h * 0.22, 0.3); // ceiling
    edge(0, 0, w * 0.14, 0, 0.32); // left corner
    edge(w, 0, w * 0.86, 0, 0.32); // right corner
  });
}

/* the warm pool a picture light throws on the wall */
function glowTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.5, w / 2);
    grad.addColorStop(0, "rgba(255, 214, 160, .55)");
    grad.addColorStop(0.55, "rgba(255, 214, 160, .18)");
    grad.addColorStop(1, "rgba(255, 214, 160, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/* the soft shadow a hung frame casts on the wall */
function shadowTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.filter = "blur(18px)";
    g.fillStyle = "rgba(40, 30, 20, .45)";
    g.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
  });
}

/* the museum label beside each work: room, title, lens */
function labelTexture(w, k) {
  const plate = w.plate.look || {};
  const caption = plate.caption || w.plate.caption || "";
  /* (a sentence ends at a full stop, but not after "c." or an initial like "J. M. W.") */
  const [first, ...rest] = caption.split(/(?<!\b[A-Za-z])\.\s(?=[A-Z])/);
  const comma = first.indexOf(",");
  const artist = comma > 0 ? first.slice(0, comma) : first.replace(/\.$/, "");
  const date = comma > 0 ? first.slice(comma + 1).trim().replace(/\.$/, "") : "";
  const where = rest.join(" ").replace(/\.$/, "");
  return canvasTexture(2048, 1248, (g, cw, ch) => {
    /* laid out at 1312 x 800, drawn larger: sharp even when seen small across the room */
    g.scale(cw / 1312, ch / 800);
    cw = 1312;
    ch = 800;
    g.fillStyle = "#f3efe7";
    g.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 1200; i++) { // the fibre of the card
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "150,135,115"}, ${Math.random() * 0.05})`;
      g.fillRect(Math.random() * cw, Math.random() * ch, 2, 2);
    }
    /* set to be read from the bench: few lines, heavy enough to survive the distance */
    const x = 80, max = cw - 160;
    g.fillStyle = "#6e5126";
    g.font = "700 54px Montserrat, sans-serif";
    g.fillText(`ROOM ${roman(k + 1)}`.split("").join(" "), x, 130);
    g.fillStyle = "#151311";
    g.font = "600 124px 'Bodoni Moda', serif";
    let y = wrap(g, w.title, x, 290, max, 128, 420);
    g.fillStyle = "#2c2722";
    g.font = "600 60px Montserrat, sans-serif";
    y += 104;
    wrap(g, date ? `${artist}, ${date}` : artist, x, y, max, 68, 700);
    g.fillStyle = "#4a4239";
    g.font = "600 54px Montserrat, sans-serif";
    g.fillText(w.lens ? `${w.lens} lens` : w.kicker || "", x, ch - 110);
  });
}
/* write text in lines no wider than max; stops before maxY; returns the last line's y */
function wrap(g, text, x, y, max, line, maxY = Infinity) {
  let row = "";
  for (const word of text.split(" ")) {
    const test = row ? `${row} ${word}` : word;
    if (g.measureText(test).width > max && row) {
      if (y + line > maxY) { g.fillText(row + "…", x, y); return y; }
      g.fillText(row, x, y);
      row = word;
      y += line;
    } else row = test;
  }
  g.fillText(row, x, y);
  return y;
}
