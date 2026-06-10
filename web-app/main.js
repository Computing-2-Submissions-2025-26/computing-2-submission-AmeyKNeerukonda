// UI CONTROLLER
// Orchestrates the DOM, renders the canvas, and manages user input.
// Visual logic (like particles) lives here to keep the game module pure.
// -----------------------------------------------------------------------------

import Game from "./game.js";

import R from "./ramda.js";

let canvas = document.getElementById("game-canvas");
let ctx = canvas.getContext("2d");

/** Intercepts window resizes to ensure canvas spans the whole viewport */
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

let palette = [
    "#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c",
    "#3498db", "#9b59b6", "#ecf0f1", "#95a5a6", "#34495e"
];

let p1SelectedColor = "#3498db";
let p2SelectedColor = "#e74c3c";

/** Dynamically populates the DOM with colour selection inputs */
function buildColorGrid(containerId, isP1) {
    let container = document.getElementById(containerId);

    // Use Ramda to iterate over the palette array
    R.forEach(function (color) {
        let swatch = document.createElement("div");
        swatch.className = "swatch";
        swatch.style.backgroundColor = color;

        let isP1Match = (isP1 && color === p1SelectedColor);
        let isP2Match = (!isP1 && color === p2SelectedColor);

        if (isP1Match || isP2Match) {
            swatch.classList.add("selected");
        }

        // Binds an event listener to update selection states
        swatch.addEventListener("click", function () {
            Array.from(container.children).forEach(function (c) {
                c.classList.remove("selected");
            });
            swatch.classList.add("selected");
            if (isP1) {
                p1SelectedColor = color;
            } else {
                p2SelectedColor = color;
            }
        });
        container.appendChild(swatch);
    }, palette);
}

buildColorGrid("p1-colors", true);
buildColorGrid("p2-colors", false);

// Base configuration passed into the pure module upon initialisation
let gameConfig = {
    p1Color: p1SelectedColor,
    p1Name: "Player 1",
    p2Color: p2SelectedColor,
    p2Name: "Player 2"
};

// Application State tracking
let gameState = Game.createInitialState(gameConfig);
let cameraX = 0;
let isDragging = false;
let isTimeoutRunning = false;
let gameOverProcessed = false;
let isGameOverLingering = false;
let isCameraMoving = false;
let currentMouse = {
    x: 0,
    y: 0
};

// Distinct arrays to hold visual-only entities that do not affect physics
let particles = [];
let windParticles = [];
let smokeParticles = [];
let lastProjectile = null;

/** Procedurally calculates background trees for the rendering loop */
function generateTrees() {
    let tArray = [];
    let tX = -1000;
    while (tX < Game.GAME_WIDTH + 1000) {
        let greenVal = Math.floor(Math.random() * 60) + 30;
        tArray.push({
            color: "rgba(10, " + String(greenVal) + ", 10, 0.4)",
            size: Math.random() * 100 + 80,
            trunkHeight: Math.random() * 60 + 40,
            trunkWidth: Math.random() * 15 + 15,
            type: (
                Math.random() < 0.5
                ? "triangle"
                : "circle"
            ),
            x: tX,
            y: Game.GROUND_Y
        });
        // Introduce randomness to spacing
        tX += Math.random() * 150 + 60;
    }
    return tArray;
}

let trees = generateTrees();

// DOM References
let menuLayer = document.getElementById("menu-layer");
let uiLayer = document.getElementById("ui-layer");
let gameOverControls = document.getElementById("game-over-controls");

let p1NameInput = document.getElementById("p1-name-input");
let p2NameInput = document.getElementById("p2-name-input");
let p1NameDisplay = document.getElementById("p1-name-display");
let p2NameDisplay = document.getElementById("p2-name-display");
let p1HealthBar = document.getElementById("p1-health-bar");
let p2HealthBar = document.getElementById("p2-health-bar");
let playAgainBtn = document.getElementById("play-again-btn");
let returnMenuBtn = document.getElementById("return-menu-btn");
let startGameBtn = document.getElementById("start-game-btn");

/** Maps the pure GameState data structure into actual DOM element styles */
function updateDOM() {
    p1HealthBar.style.width = String(gameState.players[0].hp) + "%";
    p2HealthBar.style.width = String(gameState.players[1].hp) + "%";

    // Reveal restart options only when the camera rests on the winner
    if (gameState.phase === "gameover" && !isGameOverLingering) {
        if (!isCameraMoving) {
            gameOverControls.style.display = "block";
        }
    } else {
        gameOverControls.style.display = "none";
    }
}

// Applies configurations from the form and begins the match
startGameBtn.addEventListener("click", function () {
    gameConfig = {
        p1Color: p1SelectedColor,
        p1Name: p1NameInput.value || "Player 1",
        p2Color: p2SelectedColor,
        p2Name: p2NameInput.value || "Player 2"
    };
    gameState = Game.createInitialState(gameConfig);

    // Clear visual effects arrays
    particles = [];
    smokeParticles = [];
    lastProjectile = null;
    isTimeoutRunning = false;
    gameOverProcessed = false;
    isGameOverLingering = false;

    // Toggle layer visibility
    menuLayer.style.display = "none";
    uiLayer.style.display = "block";
    p1NameDisplay.innerText = gameConfig.p1Name;
    p2NameDisplay.innerText = gameConfig.p2Name;

    updateDOM();
});

// Resets logic for a rematch using identical configurations
playAgainBtn.addEventListener("click", function () {
    gameState = Game.createInitialState(gameConfig);
    particles = [];
    smokeParticles = [];
    lastProjectile = null;
    isTimeoutRunning = false;
    gameOverProcessed = false;
    isGameOverLingering = false;
    gameOverControls.style.display = "none";
    updateDOM();
});

// Escapes the match to select new names and colours
returnMenuBtn.addEventListener("click", function () {
    uiLayer.style.display = "none";
    menuLayer.style.display = "flex";
    gameOverControls.style.display = "none";
});

/** Maps raw window interaction coords into the canvas element space */
function getMousePos(event) {
    let rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

/** Instantiates purely visual explosion entities at a coordinate */
function spawnExplosion(x, y, hitTank) {
    let i = 0;
    // Differentiate impacts visually for better user feedback
    let colors = (
        hitTank
        ? ["#e74c3c", "#d35400", "#e67e22", "#f1c40f"]
        : ["#333333", "#555555", "#777777", "#999999"]
    );
    while (i < 20) {
        let randColor = colors[Math.floor(Math.random() * 4)];
        particles.push({
            color: randColor,
            life: 1.0, // Represents alpha channel decay
            radius: Math.random() * 8 + 4,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            x: x,
            y: y
        });
        i += 1;
    }
}

// User Interaction Hook Listeners
let container = document.getElementById("game-container");

container.addEventListener("mousedown", function (event) {
    if (menuLayer.style.display !== "none") {
        return; // Prevent logic updates if the user is in the menu
    }
    // Aims can only begin once the panning camera settles
    if (gameState.phase === "aiming" && !isCameraMoving) {
        isDragging = true;
        currentMouse = getMousePos(event);
    }
});

container.addEventListener("mousemove", function (event) {
    if (isDragging) {
        currentMouse = getMousePos(event);
    }
});

container.addEventListener("mouseup", function (event) {
    if (isDragging && gameState.phase === "aiming") {
        isDragging = false;
        currentMouse = getMousePos(event);

        let activeTank = gameState.players[gameState.turn];

        // Offset the mouse coordinate by camera position to map to world
        let worldMouseX = currentMouse.x + cameraX;
        let dx = activeTank.x - worldMouseX;
        let dy = (activeTank.y - 18) - currentMouse.y;

        // Trigonometric derivation of launch vectors
        let angle = Math.atan2(dy, dx);
        let dist = Math.sqrt((dx * dx) + (dy * dy));

        // Prevent shots extending past max velocity
        let power = Math.min(dist * 0.2, 38);

        // Feed inputs to functional core to receive the next state tree
        gameState = Game.fireShot(gameState, angle, power);
    }
});

/** Resolves interpolation for the viewport dependent on game progression */
function updateCamera() {
    let targetX = cameraX;
    let speed = 0.04;

    let activePlayer = gameState.players[gameState.turn];
    // Determines spatial buffer to allow the user to drag backward
    // cleanly without the camera panning away
    let offset = (
        gameState.turn === 0
        ? -(canvas.width * 0.4)
        : -(canvas.width * 0.6)
    );

    // Identifies the subject of interest to frame inside the canvas
    if (gameState.phase === "firing" && gameState.projectile) {
        targetX = gameState.projectile.x - (canvas.width * 0.5);
        speed = 0.15;
    } else if (gameState.phase === "transitioning" && lastProjectile) {
        targetX = lastProjectile.x - (canvas.width * 0.5);
        speed = 0.15;
    } else if (gameState.phase === "gameover") {
        if (isGameOverLingering && lastProjectile) {
            targetX = lastProjectile.x - (canvas.width * 0.5);
            speed = 0.15;
        } else {
            let winnerIndex = (
                gameState.winner === 1
                ? 0
                : 1
            );
            if (gameState.winner === "Draw") {
                winnerIndex = 0;
            }
            targetX = gameState.players[winnerIndex].x - (canvas.width * 0.5);
            speed = 0.08;
        }
    } else {
        targetX = activePlayer.x + offset;
    }

    // Prevents camera escaping the logical bounds of the terrain
    let minScroll = 0;
    let maxScroll = Math.max(0, Game.GAME_WIDTH - canvas.width);

    if (gameState.phase !== "aiming") {
        minScroll = -1000;
        maxScroll += 1000;
    }

    targetX = Math.max(minScroll, Math.min(targetX, maxScroll));

    // Flags the camera as moving to block input
    isCameraMoving = Math.abs(targetX - cameraX) > 5;

    // Linear interpolation
    cameraX += (targetX - cameraX) * speed;
}

/** Draws physical shapes onto the HTML5 Canvas from the logic state */
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Abstract the camera by sliding the context backwards
    ctx.translate(-cameraX, 0);

    // Paint the basic terrain block
    ctx.fillStyle = "#27ae60";
    ctx.fillRect(-1000, Game.GROUND_Y, Game.GAME_WIDTH + 2000, canvas.height);

    // Iteratively draw geometric trees constructed during initialisation
    R.forEach(function (t) {
        ctx.fillStyle = "rgba(70, 50, 40, 0.4)";
        ctx.fillRect(
            t.x - (t.trunkWidth * 0.5),
            t.y - t.trunkHeight,
            t.trunkWidth,
            t.trunkHeight
        );

        ctx.fillStyle = t.color;
        if (t.type === "circle") {
            ctx.beginPath();
            ctx.arc(
                t.x,
                t.y - t.trunkHeight - (t.size * 0.3),
                t.size * 0.5,
                0,
                Math.PI * 2
            );
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(t.x - (t.size * 0.5), t.y - t.trunkHeight + 10);
            ctx.lineTo(t.x + (t.size * 0.5), t.y - t.trunkHeight + 10);
            ctx.lineTo(t.x, t.y - t.trunkHeight - t.size);
            ctx.fill();
        }
    }, trees);

    let activeTankId = gameState.players[gameState.turn].id;

    // Draw the tanks mapping attributes from the data structure
    R.forEach(function (player) {
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x - 37, player.y - 18, 75, 27);
        ctx.fillStyle = "#222";
        ctx.fillRect(player.x - 45, player.y + 9, 90, 18);

        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x, player.y - 18, 24, Math.PI, 0);
        ctx.fill();

        ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
        ctx.beginPath();
        ctx.arc(player.x, player.y - 18, 24, Math.PI, 0);
        ctx.fill();

        let tAngle = 0;
        let isAiming = gameState.phase === "aiming";

        // Dynamically compute turret rotation visual feedback
        if (isAiming && player.id === activeTankId && isDragging) {
            let mx = currentMouse.x + cameraX;
            let my = currentMouse.y;
            tAngle = Math.atan2((player.y - 18) - my, player.x - mx);
        } else {
            tAngle = (
                player.id === 1
                ? -0.2
                : Math.PI + 0.2
            );
        }

        ctx.save();
        ctx.translate(player.x, player.y - 18);
        ctx.rotate(tAngle);
        ctx.fillStyle = "#7f8c8d";
        ctx.fillRect(0, -6, 48, 12);
        ctx.restore();
    }, gameState.players);

    // Renders the prediction trace trajectory line
    if (gameState.phase === "aiming" && isDragging) {
        let activeTank = gameState.players[gameState.turn];
        let wMouseX = currentMouse.x + cameraX;
        let dx = activeTank.x - wMouseX;
        let dy = (activeTank.y - 18) - currentMouse.y;

        let angle = Math.atan2(dy, dx);
        let dist = Math.sqrt((dx * dx) + (dy * dy));
        let power = Math.min(dist * 0.2, 38);

        ctx.fillStyle = "white";
        let i = 1;
        while (i <= 7) {
            let distance = i * (power * 1.5);
            let dotX = activeTank.x + Math.cos(angle) * distance;
            let dotY = (activeTank.y - 18) + Math.sin(angle) * distance;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
            ctx.fill();
            i += 1;
        }
    }

    if (gameState.projectile) {
        ctx.fillStyle = "#f1c40f";
        ctx.beginPath();
        ctx.arc(
            gameState.projectile.x,
            gameState.projectile.y,
            5,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }

    // Isolate rendering side-effects for visual systems via mapping arrays
    R.forEach(function (p) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    }, smokeParticles);

    R.forEach(function (p) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    }, particles);

    ctx.globalAlpha = 1.0;
    ctx.lineWidth = 2;

    R.forEach(function (wp) {
        ctx.strokeStyle = "rgba(" + wp.color + ", " + String(wp.opacity) + ")";
        ctx.beginPath();
        ctx.moveTo(wp.x, wp.y);
        ctx.lineTo(wp.x + wp.length, wp.y);
        ctx.stroke();
    }, windParticles);

    ctx.lineWidth = 1;
    ctx.restore(); // Return context position to overlay standard UI items

    // Top-centre game feedback telemetry
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";

    let windDisplay = Math.abs(gameState.wind);
    let windText = "Wind: None";
    if (gameState.wind > 0) {
        windText = "Wind: >>> " + String(windDisplay);
    } else if (gameState.wind < 0) {
        windText = "Wind: <<< " + String(windDisplay);
    }
    ctx.fillText(windText, canvas.width * 0.5, 40);

    // Overlay post-match text onto the view
    if (gameState.phase === "gameover" && !isGameOverLingering) {
        ctx.fillStyle = "gold";
        ctx.font = "bold 80px sans-serif";
        ctx.textAlign = "center";
        if (gameState.winner === "Draw") {
            ctx.fillText("DRAW!", canvas.width * 0.5, 120);
        } else {
            let winnerIndex = (
                gameState.winner === 1
                ? 0
                : 1
            );
            let winnerTank = gameState.players[winnerIndex];
            ctx.fillText(
                winnerTank.name + " WINS!",
                canvas.width * 0.5,
                120
            );
        }
    }
}

/** Recursively computes loop steps for logic modules and UI systems */
function loop() {
    // Computes independent kinematic changes for explosion shrapnel
    R.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.radius += 0.5;
        p.life -= 0.02;
    }, particles);

    // Ramda filtering garbage collects arrays functionally
    particles = R.filter(function (p) {
        return p.life > 0;
    }, particles);

    // Randomised generation of structural damage indicators
    R.forEach(function (player) {
        let damage = 100 - player.hp;
        if (damage > 0) {
            let smokeChance = damage * 0.003;
            if (Math.random() < smokeChance) {
                let cStr = String(Math.floor(200 - (damage * 1.5)));
                let rad = (damage * 0.08) + 2;
                smokeParticles.push({
                    color: "rgba(" + cStr + "," + cStr + "," + cStr + ",0.4)",
                    life: 1.0,
                    radius: rad,
                    vx: (Math.random() - 0.5) * 1.5 + (gameState.wind * 0.2),
                    vy: (Math.random() * -1.5) - 0.5,
                    x: player.x + (Math.random() - 0.5) * 10,
                    y: player.y - 18
                });
            }
        }
    }, gameState.players);

    R.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.radius += 0.2;
        p.life -= 0.015;
    }, smokeParticles);

    smokeParticles = R.filter(function (p) {
        return p.life > 0;
    }, smokeParticles);

    // Determine the density of wind traces algorithmically
    let targetWindCount = Math.abs(gameState.wind) * 6;
    let shades = [
        "160, 160, 160",
        "140, 150, 150",
        "150, 140, 140",
        "150, 150, 160"
    ];

    while (windParticles.length < targetWindCount) {
        let colorStr = shades[Math.floor(Math.random() * 4)];
        windParticles.push({
            color: colorStr,
            length: Math.random() * 40 + 20,
            opacity: Math.random() * 0.2 + 0.1,
            speedMultiplier: Math.random() * 0.8 + 0.4,
            x: cameraX + Math.random() * canvas.width,
            y: Math.random() * (Game.GROUND_Y - 50)
        });
    }

    if (windParticles.length > targetWindCount) {
        windParticles.splice(targetWindCount);
    }

    // Pan wind streams horizontally to imply velocity and wrap off-screen
    R.forEach(function (wp) {
        let actualSpeed = gameState.wind * wp.speedMultiplier * 0.8;
        wp.x += actualSpeed;

        let rightBound = cameraX + canvas.width + 50;
        let leftBound = cameraX - wp.length - 50;

        if (actualSpeed > 0 && wp.x > rightBound) {
            wp.x = leftBound;
            wp.y = Math.random() * (Game.GROUND_Y - 50);
        } else if (actualSpeed < 0 && wp.x < leftBound) {
            wp.x = rightBound;
            wp.y = Math.random() * (Game.GROUND_Y - 50);
        }
    }, windParticles);

    // Process the functional game API call sequentially
    if (gameState.phase === "firing") {
        lastProjectile = {
            x: gameState.projectile.x,
            y: gameState.projectile.y
        };

        gameState = Game.updatePhysics(gameState);

        // Visual consequence of phase alterations
        if (gameState.phase !== "firing") {
            let inBounds = (
                lastProjectile.x >= -1000 &&
                lastProjectile.x <= Game.GAME_WIDTH + 1000
            );

            if (inBounds) {
                let nearGround = lastProjectile.y > Game.GROUND_Y - 100;
                let hitTank = false;

                R.forEach(function (player) {
                    let dx = Math.abs(player.x - lastProjectile.x);
                    let dy = Math.abs(player.y - lastProjectile.y);
                    if (dx < 100 && dy < 100) {
                        hitTank = true;
                    }
                }, gameState.players);

                if (nearGround || hitTank) {
                    let explosionY = Math.min(lastProjectile.y, Game.GROUND_Y);
                    spawnExplosion(lastProjectile.x, explosionY, hitTank);
                }
            }
        }
        updateDOM();
    }

    // Handles logic execution delays using setTimeout
    if (gameState.phase === "transitioning" && !isTimeoutRunning) {
        isTimeoutRunning = true;
        window.setTimeout(function () {
            gameState = Game.startNextTurn(gameState);
            isTimeoutRunning = false;
            updateDOM();
        }, 1500);
    }

    // Ensures we delay showing menu until the explosion animation resolves
    if (gameState.phase === "gameover" && !gameOverProcessed) {
        gameOverProcessed = true;
        isGameOverLingering = true;
        window.setTimeout(function () {
            isGameOverLingering = false;
            updateDOM();
        }, 2000);
    }

    // Triggers updateDOM logic seamlessly if camera completes its target pan
    if (gameState.phase === "gameover" && !isGameOverLingering) {
        let isBtnsHidden = gameOverControls.style.display === "none";
        if (!isCameraMoving && isBtnsHidden) {
            updateDOM();
        }
    }

    // Synchronise rendering pipeline to execution frame
    updateCamera();
    render();
    window.requestAnimationFrame(loop);
}

updateDOM();
window.requestAnimationFrame(loop);