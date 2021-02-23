/// <reference path="./node_modules/@types/p5/global.d.ts"/>

// == SETTINGS == //
var SHOW_FRAME_INFO = false;
var DEBUG = false;
var MAX_TRIES = 500;
var BLOOM = true;
var BLOOM_QUALITY = 0.2;
var BLOOM_STRENGTH = 0.1;
var BLOOM_SIZE = 8;
var FRAME_TIME_MIN = 0;
var FRAME_TIME_MAX = 80;
var MAX_GROUPS = 0; // 0 -> auto
// == SETTINGS == //

// Palette
var Cbg = '#1a0337';
var Cpink = '#ff00da';
var Cblue = '#3c4de5';
var Ccyan = '#25e4fe';
var Cpurple = '#9740dc';
var colors = [Cpink, Cblue, Ccyan, Cpurple];
var colorsBloom;

/**@type {import('./main').Node[]} */
var nodes = [];
/**@type {import('./main').Group[]} */
var groups = [];
/**@type {[import('./main').Node, import('./main').Node, number][]} */
var connections = [];
let portDistribution = [1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4];

/**
 * @param {import('p5').Vector} a
 * @param {import('p5').Vector} b
 * @returns {number}
 */
function sqDist(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    return dx * dx + dy * dy;
}
/**
 * Create a connection hash
 * @param {number} a node a index
 * @param {number} b node b index
 * @returns {number}
 */
function connHash(a, b) {
    var A = Math.max(a, b);
    var B = Math.min(a, b);
    return ((A & 0xff) << 8) | (B & 0xff);
}
// do i even need this?
function mod(a, n) {
    return a - floor(a / n) * n;
}
function angleDiff(a, b) {
    return mod(b - a + PI, TAU) - PI;
}

/**
 * Generate node groups
 * @param {number} type
 * @param {boolean} expand
 * @param {boolean} compact
 * @param {number} [factor]
 * @param {number} [maxNodes]
 */
function generate(type, expand, compact, factor = 1, maxNodes = 6) {
    let gOffset = groups.length;
    // Create Groups
    for (let i = gOffset; i < MAX_GROUPS; i++) {
        /**@type {import('./main').Group} */
        let g = {
            pos: createVector(),
            count: 0,
            color: int(random(0, 4)),
            type,
            radius: type == 1 ? random(8, 12) : random(80, 100) * factor,
            nodes: [],
            connections: [],
            growing: type == 0,
        };
        // Packing
        let hradius = 0;
        let maxX = width - hradius;
        let maxY = height - hradius;
        let tries = 0;
        packing: while (++tries < MAX_TRIES) {
            g.pos.set(random(hradius, maxX), random(hradius, maxY));
            for (let j = 0; j < groups.length; j++) {
                if (i == j) continue;
                let gg = groups[j];
                let minDist = g.radius + gg.radius;
                if (sqDist(g.pos, gg.pos) < minDist * minDist) continue packing;
            }
            break;
        }
        if (tries == MAX_TRIES) break;
        groups.push(g);
    }

    // Expand groups' radii
    /**@type {Set<import('./main').Group>} */
    var stopped = new Set();
    while (expand && stopped.size < groups.length - gOffset) {
        expansion: for (let i = gOffset; i < groups.length; i++) {
            let g = groups[i];
            if (!g.growing) {
                stopped.add(g);
                continue;
            }
            g.radius += 2;
            for (let j = 0; j < groups.length; j++) {
                if (i == j) continue;
                let gg = groups[j];
                let minDist = g.radius + gg.radius;
                if (sqDist(g.pos, gg.pos) < minDist * minDist) {
                    stopped.add(g);
                    g.growing = false;
                    continue expansion;
                }
            }
        }
    }

    for (let i = gOffset; i < groups.length; i++) {
        let g = groups[i];
        // g.count = g.type == 1 ? 1 : int(random(2, maxNodes));
        g.count = g.type == 1 ? 1 : int(Math.min(maxNodes, (random(1, 2.5) * g.radius) / 22));

        // Create nodes
        let a = random(0, TAU);
        let startX = 0,
            endX = 0,
            startY = 0,
            endY = 0;
        let giant = random() > 0.8;
        for (let j = 0; j < g.count; j++) {
            /**@type {import('./main').Node} */
            let p = {
                pos: j == 0 ? createVector() : p5.Vector.fromAngle(a, random(g.nodes[0].radius + 10, g.radius)),
                radius: j == 0 ? Math.pow(random(), 4) * 6 + 4 : giant ? random(8, 10) : random(4, 7),
                color: null,
            };

            // Move away from intersecting nodes
            let lengthFactor = 1;
            for (let j = 0; j < g.nodes.length; j++) {
                let pp = g.nodes[j];
                let minDist = p.radius + pp.radius + 10;
                if (sqDist(p.pos, pp.pos) < minDist * minDist) {
                    let dir = p5.Vector.sub(p.pos, pp.pos);
                    dir.setMag(minDist * lengthFactor);
                    p.pos.add(dir);
                    lengthFactor *= 0.5;
                }
            }

            if (p.pos.x < startX) startX = p.pos.x - p.radius;
            if (p.pos.y < startY) startY = p.pos.y - p.radius;
            if (p.pos.x > endX) endX = p.pos.x + p.radius;
            if (p.pos.y > endY) endY = p.pos.y + p.radius;

            a += random(PI * 0.2, HALF_PI);
            nodes.push(p);
            g.nodes.push(p);
        }

        // Make connections
        if (g.count == 1) continue;
        /**@type {Set<import('./main').ConnectionHash>} */
        let tested = new Set();
        /**@type {Set<import('./main').ConnectionHash>} */
        let connections = new Set();
        for (let j = 0; j < g.count; j++) {
            // Get closest nodes
            let p = g.nodes[j];
            let ports = portDistribution[int(random(portDistribution.length))];

            let closestDist = [];
            let closestId = [];
            for (let k = 0; k < g.count; k++) {
                let id = connHash(j, k);
                if (j == k || tested.has(id)) continue;
                tested.add(id);
                let pp = g.nodes[k];
                let dst = sqDist(p.pos, pp.pos);
                for (let l = ports - 1; l >= 0; l--) {
                    if ((closestDist[l] || Number.POSITIVE_INFINITY) > dst) {
                        closestDist.splice(l, 0, dst);
                        closestId.splice(l, 0, id);
                        break;
                    }
                }
            }
            for (let k = 0; k < ports; k++) connections.add(closestId[k]);
        }
        g.connections = Array.from(connections);

        // Compact group
        if (compact) {
            let center = createVector((startX + endX) * 0.5, (startY + endY) * 0.5);
            g.radius = Math.max(center.x - startX, endX - center.x, center.y - startY, endY - center.y) + 10;
            for (let j = 0; j < g.count; j++) {
                g.nodes[j].pos.sub(center);
            }
        }
    }
}

var galaxy;
var galaxySize = 800;
function preload() {
    galaxy = new Image();
    galaxy.src = 'galaxy.png';
    galaxy.onerror = () => {
        galaxy = null;
        console.error('Missing galaxy image');
    };
}
/**@type {import('p5').Graphics} */
var bloomPass;
function setup() {
    imageMode('corner');
    textAlign(LEFT, TOP);
    ellipseMode(RADIUS);
    colorMode(HSL);

    createCanvas(window.screen.width, window.screen.height);
    galaxySize = Math.min(height, width / 2);
    MAX_GROUPS = MAX_GROUPS || (150 / (1366 * 768)) * width * height;
    bloomPass = createGraphics(width * BLOOM_QUALITY, height * BLOOM_QUALITY);
    bloomPass.scale(bloomPass.width / width, bloomPass.height / height);
    bloomPass.strokeWeight(2 + BLOOM_SIZE);

    colorsBloom = [color(Cpink), color(Cblue), color(Ccyan), color(Cpurple)];
    for (let c of colorsBloom) c.setAlpha(BLOOM_STRENGTH);

    // Generate a few times to try and fill the whole canvas
    // (there's probably a better way to deal with this)
    generate(0, true, true);
    generate(0, true, true);
    generate(0, true, true, 0.8, 5);
    generate(0, true, true, 0.6, 4);
    generate(0, true, true, 0.4, 2);
    generate(1, false, false);

    for (let i = 0; i < groups.length; i++) {
        let g = groups[i];
        // Get connection from hash
        for (let j = 0; j < g.connections.length; j++) {
            let c = g.connections[j];
            let a = g.nodes[c >> 8];
            let b = g.nodes[c & 0xff];
            connections.push([a, b, g.color]);
        }
        for (let j = 0; j < g.count; j++) {
            // Move nodes to world space
            g.nodes[j].pos.add(g.pos);
            // Grab parent color
            g.nodes[j].color = g.color;
        }
    }
}
var avgFPS = 0;
var avgDelta = 0;
var avgDeltaTime = 0;
var xoff = 0;
function draw() {
    background(Cbg);
    let delta = Math.max(FRAME_TIME_MIN, Math.min(FRAME_TIME_MAX, deltaTime)) * 0.0004;
    xoff += delta;

    if (BLOOM) bloomPass.clear();
    for (let i = 0; i < nodes.length; i++) {
        let p = nodes[i];
        p.pos.add(cos(xoff + i * 37) * delta * 5, sin(xoff + i * 37) * delta * 5);
        let col1 = colors[p.color];
        let col2 = colorsBloom[p.color];
        strokeWeight(4);
        fill(col1);
        noStroke();
        ellipse(p.pos.x, p.pos.y, p.radius, p.radius);
        if (BLOOM) {
            bloomPass.fill(col2);
            bloomPass.noStroke();
            let s = p.radius * 2 + BLOOM_SIZE;
            bloomPass.ellipse(p.pos.x, p.pos.y, s, s);
        }
    }
    for (let i = 0; i < connections.length; i++) {
        let c = connections[i];
        let col1 = colors[c[2]];
        let col2 = colorsBloom[c[2]];
        strokeWeight(2);
        stroke(col1);
        line(c[0].pos.x, c[0].pos.y, c[1].pos.x, c[1].pos.y);
        if (BLOOM) {
            bloomPass.stroke(col2);
            bloomPass.line(c[0].pos.x, c[0].pos.y, c[1].pos.x, c[1].pos.y);
        }
    }
    if (BLOOM) image(bloomPass, 0, 0, width, height);
    for (let i = 0; i < groups.length; i++) {
        let g = groups[i];
        if (DEBUG) {
            stroke(255);
            noFill();
            ellipse(g.pos.x, g.pos.y, g.radius, g.radius);
        }
    }
    /**@type {CanvasRenderingContext2D} */
    var ctx = window['drawingContext'];
    if (galaxy) ctx.drawImage(galaxy, width - galaxySize, height - galaxySize, galaxySize, galaxySize);

    if (SHOW_FRAME_INFO) {
        fill(255);
        stroke(0);
        avgFPS = avgFPS * 0.8 + frameRate() * 0.2;
        text(avgFPS.toFixed(1).padStart(4, '0') + ' FPS', 10, 20);
        avgDelta = avgDelta * 0.8 + delta * 0.2;
        avgDeltaTime = avgDeltaTime * 0.8 + deltaTime * 0.2;
        text(
            `${avgDeltaTime.toFixed(0)}ms (${FRAME_TIME_MIN.toFixed(0)} < ${(avgDelta * 4000).toFixed(
                0
            )} < ${FRAME_TIME_MAX.toFixed(0)})`,
            10,
            34
        );
    }
}
function keyTyped() {
    if (key == 'f') SHOW_FRAME_INFO = !SHOW_FRAME_INFO;
    if (key == 'd') DEBUG = !DEBUG;
    if (key == 'b') BLOOM = !BLOOM;
}
