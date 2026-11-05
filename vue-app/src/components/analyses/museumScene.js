/*
  The museum the Analyses page walks through (three.js, loaded only on that page).

  A suite of seven bright gallery rooms, one per work, joined by doorways and winding through
  the building (north, east, north, west, ...), so the visitor goes through a door and turns a
  corner on the way to almost every work. In each room the work hangs on its own wall, lit, in a
  slim frame with a museum label; its other paintings hang on another wall. Each tradition's
  rooms have their own faint wall tint.

  The page scroll drives the visitor (see MuseumWalk.vue): in the gap before each analysis you
  turn from the painting you were looking at, walk a curved path through the doorway into the
  next room, and turn to face its work; while its analysis is read you stay facing it. The camera
  eases towards where the scroll says it should be and looks where it is walking; the scene is
  drawn only while something is moving.
*/
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const S = 12; // each room is S x S
const HEIGHT = 6.5;
const EYE = 1.62;
const DOOR_W = 3.2;
const DOOR_H = 4.3;
const VIEW = 5.6; // how far from a painting you stand to look at it
const HANG = 2.3; // height of a painting's centre
const GAZE = 1.95; // eye height when facing a painting: you look at it level, so it is not foreshortened
const HAZE = 0xf1ede6;

/* the winding route: each step goes north (-z) or east/west (x) into the next room */
const STEPS = ["N", "E", "N", "W", "N", "E"];
const DIR = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const OPP = { N: "S", S: "N", E: "W", W: "E" };

/* the deep colour of the wall each work hangs on, per tradition */
const FEATURE = { hebrew: 0x6e5a3a, indian: 0x2c5a55, greek: 0x2c4865, french: 0x642a33 };
/* a faint wall tint per tradition */
const TINT = { hebrew: 0xede5d7, indian: 0xe3e7e0, greek: 0xe2e6ea, french: 0xe7e2e8 };
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
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export function createMuseum(host, works, onFrame) {
  const phone = window.matchMedia("(max-width: 760px)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: !phone, powerPreference: "high-performance" });
  /* the museum sits behind the reading, softened by a veil and a vignette: it does not need every
     screen pixel. It starts a little under the screen's sharpness and drops lower if frames run slow */
  let ratio = Math.min(window.devicePixelRatio, phone ? 1 : 1.25);
  renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  /* soft shadows from the spotlights; the room never moves, so they are worked out once, not every frame */
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
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
  scene.environmentIntensity = 0.45;
  roomEnv.dispose?.();
  pmrem.dispose();

  /* a soft general light from the skylights, kept low so the lit paintings stand out from the room */
  scene.add(new THREE.HemisphereLight(0xfffaf2, 0xa89c8a, 0.75));
  const sun = new THREE.DirectionalLight(0xfff3e2, 0.4);
  sun.position.set(3, 10, 5);
  scene.add(sun);

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
  const oak = keep(oakTexture());
  oak.repeat.set(W / 4, D / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: oak, roughness: 0.34, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  scene.add(floor);
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
    const trad = TRADITION[works[k].id];
    const mat = new THREE.MeshStandardMaterial({ color: TINT[trad] || 0xece7df, map: wallShade, roughness: 0.95 });
    const feature = new THREE.MeshStandardMaterial({ color: FEATURE[trad] || 0x5a4a3a, map: wallShade, roughness: 0.9 });
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
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.6 });
  const gilt = new THREE.MeshStandardMaterial({ color: 0xb08d55, metalness: 0.7, roughness: 0.35 });
  const pool = keep(glowTexture());
  const shadow = keep(shadowTexture());

  /* ceiling spotlights with a soft edge. Only the room you are in and the one you came from are
     lit by them, so a fixed few are moved from room to room: the GPU lights each pixel with 4
     lights instead of 14, and the count never changes, so nothing is recompiled on the way */
  const makeSpot = (shadows) => {
    const light = new THREE.SpotLight(0xffe7c4, 0, 16, 0.62, 0.85, 1.6);
    if (shadows) {
      light.castShadow = true;
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
  const secondSpots = phone ? [] : [makeSpot(false), makeSpot(false)];
  function aim(light, r, d, power) {
    const [dx, dz] = DIR[d];
    light.position.set(r.x + dx * (S / 2 - 3.2), HEIGHT - 0.3, r.z + dz * (S / 2 - 3.2));
    light.target.position.set(r.x + dx * (S / 2), HANG, r.z + dz * (S / 2));
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
      aim(mainSpots[slot], r, r.main, 60);
      const second = secondSpots[slot];
      if (!second) return;
      if (r.second && (OTHERS[works[k].id] || []).length) aim(second, r, r.second, 38);
      else second.intensity = 0;
    });
    renderer.shadowMap.needsUpdate = true;
  }

  /* hang one painting on a wall group at local x; max size in metres */
  function hang(g, src, x, maxW, maxH, label, onSize) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.22 }));
    const drop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false }));
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.075), gilt);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.07), wood);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf2eee8, toneMapped: false }));
    glow.position.set(x, HANG + 0.35, 0.005);
    drop.position.set(x + 0.05, HANG - 0.12, 0.01);
    lip.position.set(x, HANG, 0.04);
    frame.position.set(x, HANG, 0.04);
    art.position.set(x, HANG, 0.08);
    g.add(glow, drop, lip, frame, art);
    const fit = (aspect) => {
      let w = maxW, h = w / aspect;
      if (h > maxH) { h = maxH; w = h * aspect; }
      art.scale.set(w, h, 1);
      if (onSize) onSize(w, h, art);
      lip.scale.set(w + 0.1, h + 0.1, 1);
      frame.scale.set(w + 0.22, h + 0.22, 1);
      drop.scale.set(w + 1.1, h + 1.1, 1);
      glow.scale.set(w * 2.4, h * 2.1, 1);
      if (label) {
        if (phone) label.position.set(x, HANG - h / 2 - 0.55, 0.03);
        else label.position.set(x + w / 2 + 0.85, 1.55, 0.03);
      }
    };
    fit(0.8);
    loader.load(src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      art.material.map = tex;
      art.material.color.set(0xffffff);
      art.material.needsUpdate = true;
      keep(tex);
      fit(tex.image.width / tex.image.height);
      renderer.shadowMap.needsUpdate = true;
      wake();
    });
  }

  rooms.forEach((r, k) => {
    const w = works[k];
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.46), new THREE.MeshBasicMaterial({ map: keep(labelTexture(w, k)), toneMapped: false }));
    r.walls[r.main].add(label);
    hang(r.walls[r.main], w.plate.src, 0, 3.6, 3.1, label, (pw, ph, mesh) => (r.art = { w: pw, h: ph, mesh }));
    const others = (OTHERS[w.id] || []).map((n) => `assets/img/${n}.webp`);
    if (r.second && others.length) {
      const xs2 = others.length === 1 ? [0] : [-2.6, 2.6];
      others.slice(0, 2).forEach((src, i) => hang(r.walls[r.second], src, xs2[i], 2.2, 2.0, null));
    }
  });

  /* ---- furniture: a bench and a rope in front of each work, a vessel on a plinth, room signs ---- */
  const oakMat = new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.55 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.5, metalness: 0.4 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc09a55, roughness: 0.3, metalness: 0.85 });
  const velvetMat = new THREE.MeshStandardMaterial({ color: 0x7a1d24, roughness: 0.8 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0xf0ebe3, roughness: 0.8 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.45, metalness: 0.5 });
  const urnTex = keep(amphoraTexture());
  const clayMat = new THREE.MeshStandardMaterial({ map: urnTex, roughness: 0.6 });
  const vessel = new THREE.LatheGeometry(
    [[0, 0], [0.12, 0.02], [0.1, 0.08], [0.2, 0.25], [0.26, 0.45], [0.22, 0.62], [0.11, 0.74], [0.09, 0.86], [0.14, 0.9], [0.13, 0.93]].map(([x, y]) => new THREE.Vector2(x, y)),
    32
  );
  rooms.forEach((r, k) => {
    const g = r.walls[r.main];
    /* an oak bench, facing the work */
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.55), oakMat);
    seat.position.set(0, 0.46, 3.3);
    g.add(seat);
    for (const x of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.5), ironMat);
      leg.position.set(x * 1.05, 0.21, 3.3);
      g.add(leg);
    }
    /* brass posts and a velvet rope */
    const ends = [-2.1, 2.1];
    for (const x of ends) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 12), brassMat);
      post.position.set(x, 0.45, 1.1);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 20), brassMat);
      base.position.set(x, 0.02, 1.1);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), brassMat);
      knob.position.set(x, 0.92, 1.1);
      g.add(post, base, knob);
    }
    const ropePath = new THREE.CatmullRomCurve3([new THREE.Vector3(-2.1, 0.86, 1.1), new THREE.Vector3(0, 0.62, 1.1), new THREE.Vector3(2.1, 0.86, 1.1)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(ropePath, 24, 0.022, 6), velvetMat));
    /* a vessel on a plinth in the corner (a black-figure amphora in the Greek rooms, bronze elsewhere) */
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.62), plinthMat);
    plinth.position.set(-(S / 2 - 1.1), 0.525, 1.1);
    const urn = new THREE.Mesh(vessel, TRADITION[works[k].id] === "greek" ? clayMat : bronzeMat);
    urn.position.set(-(S / 2 - 1.1), 1.05, 1.1);
    g.add(plinth, urn);
    /* above the way out, the name of the next room */
    if (r.exit && works[k + 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.42), new THREE.MeshBasicMaterial({ map: keep(signTexture(works[k + 1], k + 1)), transparent: true, toneMapped: false }));
      sign.position.set(0, DOOR_H + 0.75, 0.03);
      r.walls[r.exit].add(sign);
    }
  });

  scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.isMeshStandardMaterial) o.castShadow = o.receiveShadow = true;
  });
  renderer.shadowMap.needsUpdate = true;

  /* ---- where the visitor stands and looks ---- */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const inward = (d) => { const [dx, dz] = DIR[d]; return V(-dx, 0, -dz); };
  const wallPoint = (r, d, inset) => { const [dx, dz] = DIR[d]; return V(r.x + dx * (S / 2 - inset), EYE, r.z + dz * (S / 2 - inset)); };
  const artPoint = (k) => { const p = wallPoint(rooms[k], rooms[k].main, 0); p.y = HANG; return p; };
  const viewPoint = (k) => wallPoint(rooms[k], rooms[k].main, VIEW);
  const start = wallPoint(rooms[0], "S", 1.2);
  const startLook = V(rooms[0].x, EYE, rooms[0].z - 6);

  /* the curved path into room k: from where you stood, out through the doorway, to the painting */
  const paths = rooms.map((r, k) => {
    if (k === 0) return new THREE.CatmullRomCurve3([start, V(r.x, EYE, r.z + 1), viewPoint(0)], false, "centripetal");
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
    const from = k === 0 ? startLook : artPoint(k - 1).setY(GAZE);
    const look = walkLook.clone();
    look.lerp(from, 1 - smooth(clamp01(t / 0.3))); // still looking at the last painting as you set off
    look.lerp(artPoint(k).setY(pos.y), arrive); // and turning to the new one, level, as you arrive
    pos.y += Math.sin(s * path.getLength() * 2.2) * 0.025 * Math.sin(s * Math.PI); // a gentle step
    return { pos, look };
  }

  /* ---- drawing: ease towards the target, draw only while moving ---- */
  let target = { pos: start.clone(), look: startLook.clone() };
  const cur = { pos: target.pos.clone(), look: target.look.clone() };
  let frame = 0;
  let active = true;

  let lastDraw = 0, slow = 0;
  function draw(now) {
    frame = 0;
    /* a frame that took far longer than the screen's refresh, many times over: draw fewer pixels */
    if (lastDraw && now - lastDraw < 100) {
      slow = now - lastDraw > 24 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 20 && ratio > 0.6) {
        ratio = Math.max(0.6, ratio - 0.2);
        renderer.setPixelRatio(ratio);
        renderer.setSize(host.clientWidth, host.clientHeight, false);
        slow = 0;
      }
    }
    lastDraw = now;
    cur.pos.lerp(target.pos, 0.06); // a soft follow, so the walk never rushes
    cur.look.lerp(target.look, 0.05);
    camera.position.copy(cur.pos);
    camera.lookAt(cur.look);
    /* only the rooms you can see from where you are (yours and the ones beside it) are drawn */
    for (const r of rooms) {
      const near = Math.hypot(r.x - cur.pos.x, r.z - cur.pos.z) < S * 1.75;
      if (r.parts && r.parts[0].visible !== near) r.parts.forEach((p) => (p.visible = near));
    }
    renderer.render(scene, camera);
    if (onFrame) onFrame();
    const moving = cur.pos.distanceTo(target.pos) + cur.look.distanceTo(target.look);
    if (moving > 0.002 && active) frame = requestAnimationFrame(draw);
  }
  function wake() {
    if (!frame && active) frame = requestAnimationFrame(draw);
  }

  /* k = the work being walked to, t = how far along (1 = facing it) */
  function setWalk(k, t) {
    const was = target;
    const room = Math.max(0, k);
    lightRooms(room === 0 ? [0, 1] : [room, room - 1]);
    if (k < 0) target = { pos: start.clone(), look: startLook.clone() };
    else if (t < 1) target = poseOn(k, clamp01(t));
    else target = { pos: viewPoint(k).setY(GAZE), look: artPoint(k).setY(GAZE) };
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

  resize();
  return { setWalk, artRect, lift, resize, setActive, dispose };
}

/* ---- textures, drawn once on a canvas ---- */
function canvasTexture(w, h, paint, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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

/* terracotta with black-figure bands, for the amphorae */
function amphoraTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#b5602f";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1c1410";
    for (const [y, t] of [[0, 30], [70, 10], [150, 50], [215, 8], [236, 20]]) g.fillRect(0, y, w, t);
    g.fillStyle = "#b5602f";
    for (let x = 6; x < w; x += 22) { g.beginPath(); g.arc(x, 175, 7, 0, Math.PI * 2); g.fill(); } // a band of dots
  });
}

/* the name of the next room, painted above the doorway */
function signTexture(w, k) {
  return canvasTexture(1360, 168, (g, cw, ch) => {
    g.fillStyle = "#6b5b45";
    g.font = "500 44px Montserrat, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const text = `ROOM ${["I", "II", "III", "IV", "V", "VI", "VII"][k]}  ·  ${w.title.toUpperCase()}`;
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
  return canvasTexture(620, 300, (g, cw, ch) => {
    g.fillStyle = "#fbf9f5";
    g.fillRect(0, 0, cw, ch);
    g.fillStyle = "#9a7a48";
    g.font = "600 24px Montserrat, sans-serif";
    g.fillText(`ROOM ${["I", "II", "III", "IV", "V", "VI", "VII"][k]} · ${w.kicker.toUpperCase()}`, 32, 56);
    g.fillStyle = "#1b1a1b";
    g.font = "52px 'Bodoni Moda', serif";
    wrap(g, w.title, 32, 128, 560, 58);
    g.fillStyle = "#5a534b";
    g.font = "24px Montserrat, sans-serif";
    g.fillText(`Read through the ${w.lens} lens`, 32, 268);
  });
}
function wrap(g, text, x, y, max, line) {
  let row = "";
  for (const word of text.split(" ")) {
    const test = row ? `${row} ${word}` : word;
    if (g.measureText(test).width > max && row) {
      g.fillText(row, x, y);
      row = word;
      y += line;
    } else row = test;
  }
  g.fillText(row, x, y);
}
