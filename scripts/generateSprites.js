import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

function ensureDirectoryExists(filePath) {
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
}

// Platformer Example Sprites
const generatePlatformerSprites = () => {
    // Player sprite (96x32 with three frames: idle, run, and jump)
    const playerCanvas = createCanvas(96, 32);
    const playerCtx = playerCanvas.getContext('2d');

    // Idle frame (green square)
    playerCtx.fillStyle = '#4CAF50';
    playerCtx.fillRect(0, 0, 32, 32);

    // Run frame (blue square)
    playerCtx.fillStyle = '#2196F3';
    playerCtx.fillRect(32, 0, 32, 32);

    // Jump frame (yellow square)
    playerCtx.fillStyle = '#FFC107';
    playerCtx.fillRect(64, 0, 32, 32);

    const playerPath = 'src/examples/platformer/assets/player.png';
    ensureDirectoryExists(playerPath);
    writeFileSync(playerPath, playerCanvas.toBuffer());

    // Platform sprite
    const platformCanvas = createCanvas(32, 32);
    const platformCtx = platformCanvas.getContext('2d');

    // Fill with brown color
    platformCtx.fillStyle = '#8B4513';
    platformCtx.fillRect(0, 0, 32, 32);

    // Add a lighter border
    platformCtx.strokeStyle = '#CD853F';
    platformCtx.lineWidth = 2;
    platformCtx.strokeRect(1, 1, 30, 30);

    // Add some texture/detail
    platformCtx.fillStyle = '#A0522D';
    platformCtx.fillRect(4, 4, 24, 24);

    const platformPath = 'src/examples/platformer/assets/platform.png';
    ensureDirectoryExists(platformPath);
    writeFileSync(platformPath, platformCanvas.toBuffer());

    // Moving Platform sprite
    const movingPlatformCanvas = createCanvas(32, 32);
    const movingPlatformCtx = movingPlatformCanvas.getContext('2d');

    // Base metal color
    movingPlatformCtx.fillStyle = '#708090';
    movingPlatformCtx.fillRect(0, 0, 32, 32);

    // Add metallic sheen
    const gradient = movingPlatformCtx.createLinearGradient(0, 0, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    movingPlatformCtx.fillStyle = gradient;
    movingPlatformCtx.fillRect(0, 0, 32, 32);

    // Add mechanical details
    movingPlatformCtx.fillStyle = '#2F4F4F';
    movingPlatformCtx.fillRect(4, 14, 24, 4);
    movingPlatformCtx.fillRect(14, 4, 4, 24);

    // Add border
    movingPlatformCtx.strokeStyle = '#4682B4';
    movingPlatformCtx.lineWidth = 2;
    movingPlatformCtx.strokeRect(1, 1, 30, 30);

    const movingPlatformPath = 'src/examples/platformer/assets/movingPlatform.png';
    ensureDirectoryExists(movingPlatformPath);
    writeFileSync(movingPlatformPath, movingPlatformCanvas.toBuffer());

    // Bee enemy sprite
    const beeCanvas = createCanvas(96, 32);  // 3 frames of 32x32
    const beeCtx = beeCanvas.getContext('2d');

    // Common bee colors
    const colors = {
        body: '#FFD700',     // Gold
        stripes: '#000000',  // Black
        wing: '#FFFFFF',     // White with transparency
        outline: '#000000'   // Black outline
    };

    // Draw three frames: idle, flying left, flying right
    [0, 1, 2].forEach(frame => {
        const x = frame * 32;
        
        // Body
        beeCtx.fillStyle = colors.body;
        beeCtx.beginPath();
        beeCtx.ellipse(x + 16, 16, 12, 8, 0, 0, Math.PI * 2);
        beeCtx.fill();
        beeCtx.strokeStyle = colors.outline;
        beeCtx.stroke();

        // Stripes
        beeCtx.fillStyle = colors.stripes;
        [-4, 0, 4].forEach(offset => {
            beeCtx.fillRect(x + 12 + offset, 12, 3, 8);
        });

        // Wings
        beeCtx.fillStyle = colors.wing;
        beeCtx.globalAlpha = 0.6;
        
        // Wing animation based on frame
        const wingOffset = frame === 0 ? 0 : (frame === 1 ? -2 : 2);
        
        // Left wing
        beeCtx.beginPath();
        beeCtx.ellipse(x + 16 - 4, 10 + wingOffset, 6, 4, Math.PI / 4, 0, Math.PI * 2);
        beeCtx.fill();
        
        // Right wing
        beeCtx.beginPath();
        beeCtx.ellipse(x + 16 + 4, 10 - wingOffset, 6, 4, -Math.PI / 4, 0, Math.PI * 2);
        beeCtx.fill();
        
        beeCtx.globalAlpha = 1.0;
    });

    const beePath = 'src/examples/platformer/assets/enemy.png';
    ensureDirectoryExists(beePath);
    writeFileSync(beePath, beeCanvas.toBuffer());

    // Coin sprite (32x32 with shine effect)
    const coinCanvas = createCanvas(32, 32);
    const coinCtx = coinCanvas.getContext('2d');

    // Main circle (gold)
    coinCtx.fillStyle = '#FFD700';
    coinCtx.beginPath();
    coinCtx.arc(16, 16, 12, 0, Math.PI * 2);
    coinCtx.fill();

    // Inner circle (darker gold)
    coinCtx.fillStyle = '#DAA520';
    coinCtx.beginPath();
    coinCtx.arc(16, 16, 10, 0, Math.PI * 2);
    coinCtx.fill();

    // Dollar sign
    coinCtx.fillStyle = '#FFD700';
    coinCtx.font = 'bold 14px Arial';
    coinCtx.textAlign = 'center';
    coinCtx.textBaseline = 'middle';
    coinCtx.fillText('$', 16, 16);

    // Shine effect
    coinCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    coinCtx.beginPath();
    coinCtx.arc(12, 12, 3, 0, Math.PI * 2);
    coinCtx.fill();

    const coinPath = 'src/examples/platformer/assets/coin.png';
    ensureDirectoryExists(coinPath);
    writeFileSync(coinPath, coinCanvas.toBuffer());
};

// Maze Example Sprites
const generateMazeSprites = () => {
    // Player sprite
    const playerCanvas = createCanvas(32, 32);
    const playerCtx = playerCanvas.getContext('2d');

    playerCtx.fillStyle = '#2196F3';
    playerCtx.beginPath();
    playerCtx.arc(16, 16, 12, 0, Math.PI * 2);
    playerCtx.fill();
    playerCtx.fillStyle = '#1976D2';
    playerCtx.beginPath();
    playerCtx.arc(16, 16, 6, 0, Math.PI * 2);
    playerCtx.fill();

    const playerPath = 'src/examples/maze/assets/player.png';
    ensureDirectoryExists(playerPath);
    writeFileSync(playerPath, playerCanvas.toBuffer());

    // Wall sprite
    const wallCanvas = createCanvas(32, 32);
    const wallCtx = wallCanvas.getContext('2d');

    wallCtx.fillStyle = '#607D8B';
    wallCtx.fillRect(0, 0, 32, 32);
    wallCtx.fillStyle = '#455A64';
    wallCtx.fillRect(0, 0, 4, 32);
    wallCtx.fillRect(28, 0, 4, 32);

    const wallPath = 'src/examples/maze/assets/wall.png';
    ensureDirectoryExists(wallPath);
    writeFileSync(wallPath, wallCanvas.toBuffer());

    // Floor sprite
    const floorCanvas = createCanvas(32, 32);
    const floorCtx = floorCanvas.getContext('2d');

    floorCtx.fillStyle = '#EEEEEE';
    floorCtx.fillRect(0, 0, 32, 32);
    floorCtx.fillStyle = '#E0E0E0';
    floorCtx.fillRect(0, 0, 16, 16);
    floorCtx.fillRect(16, 16, 16, 16);

    const floorPath = 'src/examples/maze/assets/floor.png';
    ensureDirectoryExists(floorPath);
    writeFileSync(floorPath, floorCanvas.toBuffer());
};

// Physics Example Sprites
const generatePhysicsSprites = () => {
    // Ball sprite
    const ballCanvas = createCanvas(32, 32);
    const ballCtx = ballCanvas.getContext('2d');

    ballCtx.fillStyle = '#F44336';
    ballCtx.beginPath();
    ballCtx.arc(16, 16, 14, 0, Math.PI * 2);
    ballCtx.fill();
    ballCtx.fillStyle = '#D32F2F';
    ballCtx.beginPath();
    ballCtx.arc(12, 12, 4, 0, Math.PI * 2);
    ballCtx.fill();

    const ballPath = 'src/examples/physics/assets/ball.png';
    ensureDirectoryExists(ballPath);
    writeFileSync(ballPath, ballCanvas.toBuffer());

    // Box sprite
    const boxCanvas = createCanvas(32, 32);
    const boxCtx = boxCanvas.getContext('2d');

    boxCtx.fillStyle = '#FFC107';
    boxCtx.fillRect(2, 2, 28, 28);
    boxCtx.fillStyle = '#FFA000';
    boxCtx.fillRect(2, 2, 28, 4);
    boxCtx.fillRect(2, 26, 28, 4);
    boxCtx.fillRect(2, 2, 4, 28);
    boxCtx.fillRect(26, 2, 4, 28);

    const boxPath = 'src/examples/physics/assets/box.png';
    ensureDirectoryExists(boxPath);
    writeFileSync(boxPath, boxCanvas.toBuffer());

    // Platform sprite
    const platformCanvas = createCanvas(32, 32);
    const platformCtx = platformCanvas.getContext('2d');

    platformCtx.fillStyle = '#9C27B0';
    platformCtx.fillRect(0, 0, 32, 32);
    platformCtx.fillStyle = '#7B1FA2';
    platformCtx.fillRect(0, 0, 32, 4);
    platformCtx.fillRect(0, 28, 32, 4);

    const platformPath = 'src/examples/physics/assets/platform.png';
    ensureDirectoryExists(platformPath);
    writeFileSync(platformPath, platformCanvas.toBuffer());
};

// Generate all sprites
generatePlatformerSprites();
generateMazeSprites();
generatePhysicsSprites(); 