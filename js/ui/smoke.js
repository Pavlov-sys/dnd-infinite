// Drifting smoke behind the My Characters page: a small WebGL shader (layered, warped noise) drawn at
// half resolution and capped at 30 fps. Heavier mist rolls along the bottom with a faint ember-red
// tint; thin wisps drift higher up and lean away from the mouse. Stops whenever you leave the page,
// pauses in background tabs, and stays off for reduced motion or without WebGL.
const FRAG = `
precision mediump float;
uniform vec2 r; uniform float t; uniform vec2 m;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / r;
  vec2 p = uv * vec2(r.x / r.y, 1.0) * 2.0;
  p += (uv - m) * 0.25 * exp(-3.0 * length(uv - m));          // wisps lean away from the cursor
  float tt = t * 0.035;
  vec2 q = vec2(fbm(p + vec2(0.0, tt)), fbm(p + vec2(5.2, 1.3) - tt));
  vec2 w = vec2(fbm(p + 2.0 * q + vec2(1.7, 9.2) + tt * 1.4), fbm(p + 2.0 * q + vec2(8.3, 2.8) - tt));
  float f = fbm(p + 2.4 * w + vec2(tt * 1.8, 0.0));
  float low = 1.0 - smoothstep(0.0, 0.7, uv.y);                 // denser near the bottom
  float dens = smoothstep(0.38, 0.95, f) * (0.22 + 0.78 * low);
  vec3 col = mix(vec3(0.58, 0.58, 0.64), vec3(0.78, 0.16, 0.14), clamp(low * 0.7 * f, 0.0, 1.0));
  gl_FragColor = vec4(col * dens, dens);
}`;
const VERT = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';

let canvas = null; let gl = null; let prog = null; let raf = 0; let running = false; let last = 0; let t0 = 0;
const mouse = [0.5, 0.5]; let target = [0.5, 0.5];

function init() {
  canvas = document.createElement('canvas');
  canvas.className = 'smoke-bg';
  canvas.setAttribute('aria-hidden', 'true');
  gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) { canvas = null; return false; }
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas = null; gl = null; return false; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  window.addEventListener('pointermove', (e) => { target = [e.clientX / innerWidth, 1 - e.clientY / innerHeight]; }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (running && !document.hidden) loop(performance.now()); });
  t0 = performance.now() - Math.random() * 60000;
  return true;
}
function size() {
  const scale = 0.5; const w = Math.max(1, Math.round(innerWidth * scale)); const hgt = Math.max(1, Math.round(innerHeight * scale));
  if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt; gl.viewport(0, 0, w, hgt); }
}
function loop(now) {
  if (!running || document.hidden) return;
  raf = requestAnimationFrame(loop);
  if (now - last < 33) return; // ~30 fps is plenty for smoke
  last = now;
  size();
  mouse[0] += (target[0] - mouse[0]) * 0.05; mouse[1] += (target[1] - mouse[1]) * 0.05;
  gl.uniform2f(gl.getUniformLocation(prog, 'r'), canvas.width, canvas.height);
  gl.uniform1f(gl.getUniformLocation(prog, 't'), (now - t0) / 1000);
  gl.uniform2f(gl.getUniformLocation(prog, 'm'), mouse[0], mouse[1]);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
export function startSmoke() {
  if (running) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (!canvas && !init()) return;
  if (!canvas.isConnected) document.body.prepend(canvas);
  running = true; canvas.classList.add('on'); loop(performance.now());
}
export function stopSmoke() {
  if (!running) return;
  running = false; cancelAnimationFrame(raf); canvas?.classList.remove('on');
}
