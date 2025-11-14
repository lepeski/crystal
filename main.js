// main.js
// GPU-accelerated neural-net animation using Pixi.js

// 1) Create Pixi Application
const app = new PIXI.Application({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundAlpha: 0,
  antialias: true,
  resolution: window.devicePixelRatio || 1,
});
document.getElementById('canvas-container').appendChild(app.view);

// 2) Spatial grid parameters
const CELL = 150;
let cols = 0, rows = 0, grid = [];

function initGrid() {
  cols = Math.ceil(app.screen.width / CELL);
  rows = Math.ceil(app.screen.height / CELL);
  grid = Array(cols * rows).fill().map(() => []);
}

// 3) Prepare circle texture for nodes
const circleG = new PIXI.Graphics();
circleG.beginFill(0xffffff);
circleG.drawCircle(0, 0, 1.5);
circleG.endFill();
const circleTexture = app.renderer.generateTexture(circleG);

// 4) Node colors
const COLORS = [
  0xaa00ff, // purple
  0x00aaff, // electric blue
  0x004de6, // deep blue
];

// 5) Create containers
const lineGraphics = new PIXI.Graphics();
lineGraphics.blendMode = PIXI.BLEND_MODES.ADD;

// Apply Bloom filter for stunning glow (with graceful fallback)
const bloomFilter = (() => {
  if (PIXI?.filters?.BloomFilter) {
    return new PIXI.filters.BloomFilter({
      threshold: 0.5,
      intensity: 2.5,
      blur: 8,
    });
  }

  if (PIXI?.filters?.AdvancedBloomFilter) {
    return new PIXI.filters.AdvancedBloomFilter({
      threshold: 0.5,
      bloomScale: 1.8,
      brightness: 1.1,
    });
  }

  console.warn('Bloom filter unavailable – continuing without glow effect');
  return null;
})();

if (bloomFilter) {
  lineGraphics.filters = [bloomFilter];
}

app.stage.addChild(lineGraphics);

// 6) Node setup
const nodes = [];
let redNode;
function initNodes() {
  initGrid();

  // Create red node at center
  redNode = new PIXI.Sprite(circleTexture);
  redNode.tint = 0xff3333;
  redNode.anchor.set(0.5);
  redNode.x = app.screen.width / 2;
  redNode.y = app.screen.height / 2;
  redNode.vx = (Math.random() - 0.5) * 0.54;
  redNode.vy = (Math.random() - 0.5) * 0.54;
  redNode.ix = 0;
  redNode.iy = 0;
  redNode.decayTimer = 0;
  redNode.pulse = 1.0;
  redNode.scale.set(2.5);
  app.stage.addChild(redNode);
  nodes.push(redNode);

  const count = Math.floor((app.screen.width * app.screen.height) / 15000 * 1.3);
  for (let i = 0; i < count; i++) {
    const sprite = new PIXI.Sprite(circleTexture);
    sprite.tint = COLORS[i % COLORS.length];
    sprite.anchor.set(0.5);
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 100;
    sprite.x = app.screen.width / 2 + Math.cos(angle) * radius;
    sprite.y = app.screen.height / 2 + Math.sin(angle) * radius;
    sprite.vx = (Math.random() - 0.5) * 0.54;
    sprite.vy = (Math.random() - 0.5) * 0.54;
    sprite.ix = 0;
    sprite.iy = 0;
    sprite.decayTimer = 0;
    sprite.pulse = 0;
    app.stage.addChild(sprite);
    nodes.push(sprite);
  }
}

// 7) Mouse tracking for repulsion
let mouse = null;
window.addEventListener('mousemove', e => mouse = { x: e.clientX, y: e.clientY });
window.addEventListener('mouseleave', () => mouse = null);

// 8) Animation loop
let time = 0;
let pulseTimer = 0;

function animate(delta) {
  time += delta;
  pulseTimer += delta;

  if (pulseTimer > 180) {
    redNode.pulse = 1.0;
    pulseTimer = 0;
  }

  lineGraphics.clear();
  grid.forEach(bucket => bucket.length = 0);

  nodes.forEach(n => {
    const col = Math.floor(n.x / CELL);
    const row = Math.floor(n.y / CELL);
    const idx = row * cols + col;
    if (grid[idx]) grid[idx].push(n);
  });

  nodes.forEach(a => {
    const col = Math.floor(a.x / CELL);
    const row = Math.floor(a.y / CELL);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = col + dx;
        const r = row + dy;
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
        grid[r * cols + c].forEach(b => {
          if (a === b) return;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < CELL) {
            const baseAlpha = ((CELL - dist) / CELL) * 0.4;
            const pulseSpeed = 0.1 + (1 - dist / CELL) * 0.3;
            const pulse = Math.sin(time * pulseSpeed) * 0.1;
            const alpha = baseAlpha + pulse;

            const mixedPulse = Math.max(a.pulse, b.pulse);

            const baseR = (a.tint >> 16 & 0xFF) / 255;
            const baseG = (a.tint >> 8 & 0xFF) / 255;
            const baseB = (a.tint & 0xFF) / 255;

            const r = baseR * (1 - mixedPulse) + 1.0 * mixedPulse;
            const g = baseG * (1 - mixedPulse);
            const b = baseB * (1 - mixedPulse);

            const lineColor = PIXI.utils.rgb2hex([r, g, b]);

            if (mixedPulse > 0.05) {
              lineGraphics.lineStyle(6.0 * mixedPulse, 0xff3333, 0.2 * mixedPulse);
              lineGraphics.moveTo(a.x, a.y).lineTo(b.x, b.y);
            }

            lineGraphics.lineStyle(1.2 + mixedPulse * 2.0, lineColor, Math.min(1, alpha + mixedPulse * 1.2));
            lineGraphics.moveTo(a.x, a.y).lineTo(b.x, b.y);

            if (dist < CELL * 0.6) {
              const transfer = (a.pulse * 0.8);
              b.pulse = Math.min(1.0, b.pulse + transfer);
            }
          }
        });
      }
    }
  });

  nodes.forEach(n => {
    n.pulse *= 0.97;
  });

  const speed = delta / 1.6;
  const smoothing = 0.15;

  nodes.forEach(n => {
    const targetX = n.x + (n.vx + n.ix) * speed;
    const targetY = n.y + (n.vy + n.iy) * speed;

    n.x += (targetX - n.x) * smoothing;
    n.y += (targetY - n.y) * smoothing;

    n.ix *= 0.6;
    n.iy *= 0.6;

    if (mouse) {
      const dx = n.x - mouse.x;
      const dy = n.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      if (dist < CELL) {
        const factor = (CELL - dist) / CELL;
        n.ix += (dx / dist) * 2.5 * factor;
        n.iy += (dy / dist) * 2.5 * factor;
        n.decayTimer = 30;
      }
    }

    if (n.decayTimer > 0) {
      n.vx *= 0.985;
      n.vy *= 0.985;
      n.decayTimer--;
    }

    if (n.x < 0 || n.x > app.screen.width) n.vx *= -1;
    if (n.y < 0 || n.y > app.screen.height) n.vy *= -1;
  });

  app.renderer.render(app.stage);
}

window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight);
  initGrid();
});

initNodes();
app.ticker.add(animate);
