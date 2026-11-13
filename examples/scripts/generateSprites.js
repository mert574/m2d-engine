import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
// Output is resolved relative to this script, so any working directory works.
const targetDir = fileURLToPath(new URL('../src', import.meta.url));
const example = args[args.length - 1];

function writeSprite(filePath, buffer) {
    if (!args.includes('--missing') || !existsSync(filePath)) {
        writeFileSync(filePath, buffer);
    }
}

function ensureDirectoryExists(filePath) {
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
}

function getOutputPath(example, filename) {
    return join(targetDir, example, 'assets', filename);
}

// Renderer Showcase Sprites
//
// The showcase draws tens of thousands of these, so every sheet is a single
// small texture: one texture bind for the whole field is what lets a batching
// backend collapse the field into a handful of draw calls.
const generateShowcaseSprites = () => {
    // Mote sheet: 32x32 soft discs, warm tiles first then cool.
    //
    // The order matters. MoteField picks a tile by zone rather than at random:
    // warm tiles are fireflies over the reed bank, cool tiles are sea spray and
    // mist over the water. Keeping warm and cool contiguous lets the field
    // index into one half or the other without a lookup table.
    const WARM_MOTES = ['#FFD54F', '#FFA726'];
    const COOL_MOTES = ['#B3E5FC', '#E1F5FE'];
    const moteHues = [...WARM_MOTES, ...COOL_MOTES];
    const moteCanvas = createCanvas(32 * moteHues.length, 32);
    const moteCtx = moteCanvas.getContext('2d');

    moteHues.forEach((hue, index) => {
        const cx = index * 32 + 16;
        const gradient = moteCtx.createRadialGradient(cx, 16, 0, cx, 16, 15);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.3, hue);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        moteCtx.fillStyle = gradient;
        moteCtx.beginPath();
        moteCtx.arc(cx, 16, 15, 0, Math.PI * 2);
        moteCtx.fill();
    });

    const motePath = getOutputPath('showcase', 'mote.png');
    ensureDirectoryExists(motePath);
    writeSprite(motePath, moteCanvas.toBuffer('image/png'));

    // Gull sheet: six 48x32 frames of one wingbeat, down through up and
    // back. Drawn as two tapered wings and a body, in the harbour's own
    // cool white, so a flock reads as silhouettes at any size.
    const gullFrames = 6;
    const gullCanvas = createCanvas(48 * gullFrames, 32);
    const gullCtx = gullCanvas.getContext('2d');
    for (let frame = 0; frame < gullFrames; frame++) {
        // -1 at the bottom of the beat, +1 at the top.
        const beat = Math.cos((frame / gullFrames) * Math.PI * 2);
        const originX = frame * 48 + 24;
        const originY = 18;
        const lift = beat * 9;
        const sweep = 6 - Math.abs(beat) * 3;

        gullCtx.strokeStyle = '#E8F1FF';
        gullCtx.lineWidth = 3;
        gullCtx.lineCap = 'round';
        gullCtx.lineJoin = 'round';
        for (const side of [-1, 1]) {
            gullCtx.beginPath();
            gullCtx.moveTo(originX, originY);
            gullCtx.quadraticCurveTo(originX + side * 10, originY - lift * 0.8, originX + side * 19, originY - lift - sweep);
            gullCtx.stroke();
        }
        gullCtx.fillStyle = '#F4F8FF';
        gullCtx.beginPath();
        gullCtx.ellipse(originX, originY + 1, 6, 3.2, 0, 0, Math.PI * 2);
        gullCtx.fill();
        // The head, and a dot of bill so the bird has a direction.
        gullCtx.beginPath();
        gullCtx.arc(originX + 6, originY - 1, 2.4, 0, Math.PI * 2);
        gullCtx.fill();
        gullCtx.fillStyle = '#FFC46B';
        gullCtx.fillRect(originX + 8, originY - 1.6, 3, 1.6);
    }
    const gullPath = getOutputPath('showcase', 'gull.png');
    ensureDirectoryExists(gullPath);
    writeSprite(gullPath, gullCanvas.toBuffer('image/png'));

    // Reed sheet: eight 32x64 stalks — six grasses and two flowering heads.
    // Enough variety that a dense bank does not read as one repeated sprite.
    const reedStalks = [
        { stalk: '#2E7D32', head: '#A5D6A7', lean: -5, kind: 'seed' },
        { stalk: '#388E3C', head: '#C5E1A5', lean: -2, kind: 'seed' },
        { stalk: '#1B5E20', head: '#81C784', lean: 1, kind: 'blade' },
        { stalk: '#43A047', head: '#DCEDC8', lean: 4, kind: 'blade' },
        { stalk: '#2E7D32', head: '#9CCC65', lean: -3, kind: 'blade' },
        { stalk: '#33691E', head: '#AED581', lean: 2, kind: 'seed' },
        { stalk: '#386641', head: '#F8BBD0', lean: -1, kind: 'flower' },
        { stalk: '#2E7D32', head: '#FFF59D', lean: 3, kind: 'flower' }
    ];

    const reedCanvas = createCanvas(32 * reedStalks.length, 64);
    const reedCtx = reedCanvas.getContext('2d');

    reedStalks.forEach((reed, index) => {
        const originX = index * 32 + 16;
        const tipX = originX + reed.lean * 2;

        reedCtx.strokeStyle = reed.stalk;
        reedCtx.lineWidth = reed.kind === 'blade' ? 2 : 3;
        reedCtx.lineCap = 'round';
        reedCtx.beginPath();
        reedCtx.moveTo(originX, 63);
        reedCtx.quadraticCurveTo(originX + reed.lean, 32, tipX, 6);
        reedCtx.stroke();

        // A second shorter blade makes each tile read as a clump, so the bank
        // looks dense without doubling the sprite count.
        reedCtx.lineWidth = 2;
        reedCtx.beginPath();
        reedCtx.moveTo(originX + 3, 63);
        reedCtx.quadraticCurveTo(originX + reed.lean + 6, 40, tipX + 8, 20);
        reedCtx.stroke();

        reedCtx.fillStyle = reed.head;
        if (reed.kind === 'flower') {
            // Five small petals around a centre.
            for (let petal = 0; petal < 5; petal++) {
                const angle = (petal / 5) * Math.PI * 2;
                reedCtx.beginPath();
                reedCtx.arc(tipX + Math.cos(angle) * 3.2, 6 + Math.sin(angle) * 3.2, 2.4, 0, Math.PI * 2);
                reedCtx.fill();
            }
            reedCtx.fillStyle = '#FFF176';
            reedCtx.beginPath();
            reedCtx.arc(tipX, 6, 1.8, 0, Math.PI * 2);
            reedCtx.fill();
        } else if (reed.kind === 'seed') {
            reedCtx.beginPath();
            reedCtx.ellipse(tipX, 7, 3, 7, 0, 0, Math.PI * 2);
            reedCtx.fill();
        } else {
            reedCtx.beginPath();
            reedCtx.ellipse(tipX, 9, 1.8, 5, 0, 0, Math.PI * 2);
            reedCtx.fill();
        }
    });

    const reedPath = getOutputPath('showcase', 'reed.png');
    ensureDirectoryExists(reedPath);
    writeSprite(reedPath, reedCanvas.toBuffer('image/png'));

    // Lighthouse: one 64x160 tower. Its lamp is the origin of the sweeping
    // beam, and the minimap plots the same angle.
    const towerCanvas = createCanvas(64, 160);
    const towerCtx = towerCanvas.getContext('2d');

    // Tapered body.
    towerCtx.fillStyle = '#ECEFF1';
    towerCtx.beginPath();
    towerCtx.moveTo(18, 159);
    towerCtx.lineTo(24, 42);
    towerCtx.lineTo(40, 42);
    towerCtx.lineTo(46, 159);
    towerCtx.closePath();
    towerCtx.fill();

    // Red bands.
    towerCtx.fillStyle = '#C62828';
    [60, 100, 140].forEach((y) => {
        const spread = 18 + (y / 160) * 10;
        towerCtx.fillRect(32 - spread / 2, y, spread, 12);
    });

    // Gallery, lamp room and glow.
    towerCtx.fillStyle = '#37474F';
    towerCtx.fillRect(20, 36, 24, 6);
    towerCtx.fillStyle = '#FFF59D';
    towerCtx.fillRect(25, 18, 14, 18);
    towerCtx.fillStyle = '#546E7A';
    towerCtx.fillRect(23, 10, 18, 8);
    towerCtx.beginPath();
    towerCtx.moveTo(32, 0);
    towerCtx.lineTo(42, 10);
    towerCtx.lineTo(22, 10);
    towerCtx.closePath();
    towerCtx.fill();

    const towerPath = getOutputPath('showcase', 'lighthouse.png');
    ensureDirectoryExists(towerPath);
    writeSprite(towerPath, towerCanvas.toBuffer('image/png'));

    // Rain streak: one 8x32 tile, a soft vertical line that fades at both
    // ends. Drawn by the thousands through drawParticles.
    const rainCanvas = createCanvas(8, 32);
    const rainCtx = rainCanvas.getContext('2d');
    const streak = rainCtx.createLinearGradient(0, 0, 0, 32);
    streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
    streak.addColorStop(0.35, 'rgba(255, 255, 255, 0.9)');
    streak.addColorStop(1, 'rgba(255, 255, 255, 0)');
    rainCtx.strokeStyle = streak;
    rainCtx.lineWidth = 2;
    rainCtx.lineCap = 'round';
    rainCtx.beginPath();
    rainCtx.moveTo(4, 1);
    rainCtx.lineTo(4, 31);
    rainCtx.stroke();

    const rainPath = getOutputPath('showcase', 'rain.png');
    ensureDirectoryExists(rainPath);
    writeSprite(rainPath, rainCanvas.toBuffer('image/png'));

    // Lantern sheet: two 32x32 frames (lit / dim) for the harbour lights.
    const lanternCanvas = createCanvas(64, 32);
    const lanternCtx = lanternCanvas.getContext('2d');

    [['#FFE082', '#FF8F00'], ['#FFCC80', '#E65100']].forEach(([inner, outer], index) => {
        const cx = index * 32 + 16;

        lanternCtx.fillStyle = '#4E342E';
        lanternCtx.fillRect(cx - 7, 4, 14, 3);
        lanternCtx.fillRect(cx - 7, 25, 14, 3);

        const glass = lanternCtx.createLinearGradient(cx - 6, 7, cx + 6, 25);
        glass.addColorStop(0, inner);
        glass.addColorStop(1, outer);
        lanternCtx.fillStyle = glass;
        lanternCtx.fillRect(cx - 6, 7, 12, 18);

        lanternCtx.strokeStyle = '#3E2723';
        lanternCtx.lineWidth = 2;
        lanternCtx.strokeRect(cx - 6, 7, 12, 18);
    });

    const lanternPath = getOutputPath('showcase', 'lantern.png');
    ensureDirectoryExists(lanternPath);
    writeSprite(lanternPath, lanternCanvas.toBuffer('image/png'));

    // Crate sheet: one 32x32 tile for the physics props the player shoves.
    const crateCanvas = createCanvas(32, 32);
    const crateCtx = crateCanvas.getContext('2d');

    crateCtx.fillStyle = '#6D4C41';
    crateCtx.fillRect(0, 0, 32, 32);
    crateCtx.fillStyle = '#8D6E63';
    crateCtx.fillRect(3, 3, 26, 26);
    crateCtx.strokeStyle = '#4E342E';
    crateCtx.lineWidth = 2;
    crateCtx.beginPath();
    crateCtx.moveTo(3, 3);
    crateCtx.lineTo(29, 29);
    crateCtx.moveTo(29, 3);
    crateCtx.lineTo(3, 29);
    crateCtx.stroke();
    crateCtx.strokeRect(3, 3, 26, 26);

    const cratePath = getOutputPath('showcase', 'crate.png');
    ensureDirectoryExists(cratePath);
    writeSprite(cratePath, crateCanvas.toBuffer('image/png'));

    // Dock sheet: one 32x32 plank tile for the static geometry.
    const dockCanvas = createCanvas(32, 32);
    const dockCtx = dockCanvas.getContext('2d');

    dockCtx.fillStyle = '#37474F';
    dockCtx.fillRect(0, 0, 32, 32);
    dockCtx.fillStyle = '#455A64';
    dockCtx.fillRect(0, 0, 32, 8);
    dockCtx.strokeStyle = '#263238';
    dockCtx.lineWidth = 1;
    for (let y = 8; y < 32; y += 8) {
        dockCtx.beginPath();
        dockCtx.moveTo(0, y);
        dockCtx.lineTo(32, y);
        dockCtx.stroke();
    }

    const dockPath = getOutputPath('showcase', 'dock.png');
    ensureDirectoryExists(dockPath);
    writeSprite(dockPath, dockCanvas.toBuffer('image/png'));
};

// Generate sprites based on command line argument
if (!example || example === 'all') {
    console.log(`Generating all sprites in ${targetDir}...`);
    generateShowcaseSprites();
} else {
    console.log(`Generating ${example} sprites in ${targetDir}...`);
    switch (example) {
        case 'showcase':
            generateShowcaseSprites();
            break;
        default:
            console.error(`Unknown example: ${example}`);
            process.exit(1);
    }
}
