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
app.stage.addChild(lineGraphics);

// 6) Node setup
const nodes = [];
function initNodes() {
  initGrid();
  const count = Math.floor((app.screen.width * app.screen.height) / 15000 * 1.3);
  for (let i = 0; i < count; i++) {
    const sprite = new PIXI.Sprite(circleTexture);
    sprite.tint = COLORS[i % COLORS.length];
    sprite.anchor.set(0.5);
    sprite.x = Math.random() * app.screen.width;
    sprite.y = Math.random() * app.screen.height;
    sprite.vx = (Math.random() - 0.5) * 0.6;
    sprite.vy = (Math.random() - 0.5) * 0.6;
    sprite.ix = 0;
    sprite.iy = 0;
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

function animate(delta) {
  time += delta;

  // Clear previous lines
  lineGraphics.clear();

  // Clear grid buckets
  grid.forEach(bucket => bucket.length = 0);

  // Bucket each node
  nodes.forEach(n => {
    const col = Math.floor(n.x / CELL);
    const row = Math.floor(n.y / CELL);
    const idx = row * cols + col;
    if (grid[idx]) grid[idx].push(n);
  });

  // Draw connections with dynamic shimmer and pulse
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
            lineGraphics.lineStyle(1.2, a.tint, Math.max(0, alpha));
            lineGraphics.moveTo(a.x, a.y).lineTo(b.x, b.y);
          }
        });
      }
    }
  });

  // Update node positions and draw
  const speed = delta / 1.6;
  const smoothing = 0.15;

  nodes.forEach(n => {
    const targetX = n.x + (n.vx + n.ix) * speed;
    const targetY = n.y + (n.vy + n.iy) * speed;

    n.x += (targetX - n.x) * smoothing;
    n.y += (targetY - n.y) * smoothing;

    n.ix *= 0.6;
    n.iy *= 0.6;

    // Mouse repulsion
    if (mouse) {
      const dx = n.x - mouse.x;
      const dy = n.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      if (dist < CELL) {
        const factor = (CELL - dist) / CELL;
        n.ix += (dx / dist) * 2 * factor;
        n.iy += (dy / dist) * 2 * factor;
      }
    }

    // Bounce edges
    if (n.x < 0 || n.x > app.screen.width) n.vx *= -1;
    if (n.y < 0 || n.y > app.screen.height) n.vy *= -1;
  });

  app.renderer.render(app.stage);
}

// 9) Ensure resize updates grid
window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight);
  initGrid();
});

// 10) Start
initNodes();
app.ticker.add(animate);
