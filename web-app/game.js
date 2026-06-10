// PURE GAME API
// This module dictates the rules, physics, and state transitions of the game.
// It relies entirely on pure functions and creates zero side-effects.
// -----------------------------------------------------------------------------

import R from "./ramda.js";

let GAME_WIDTH = 2500;
let GROUND_Y = 600;
let GRAVITY = 0.2;

/**
 * @typedef {Object} Player
 * @property {string} color - Hex code determining visual rendering.
 * @property {number} hp - Remaining hit points.
 * @property {number} id - Unique identifier (1 or 2).
 * @property {string} name - Display string for the HUD.
 * @property {number} x - Horizontal coordinate in the world.
 * @property {number} y - Vertical coordinate in the world.
 */

/**
 * @typedef {Object} Projectile
 * @property {number} age - Lifespan in frames (prevents self-collision).
 * @property {number} vx - Horizontal velocity component.
 * @property {number} vy - Vertical velocity component.
 * @property {number} x - Horizontal coordinate.
 * @property {number} y - Vertical coordinate.
 */

/**
 * @typedef {Object} GameState
 * @property {string} phase - Tracks the FSM state of the round.
 * @property {Player[]} players - The data representation of the tanks.
 * @property {Projectile|null} projectile - Data for the active shot.
 * @property {number} turn - Index tracking whose turn it is.
 * @property {number} wind - Magnitude and sign affecting projectile vx.
 * @property {number|string|null} winner - Holds the win state if game is over.
 */

/**
 * Constructs the initial immutable state tree for a new game.
 * @param {Object} config - Setup parameters passed from the UI form.
 * @returns {GameState} The baseline pure state representation.
 */
function createInitialState(config) {
    // Generate variable initial placements to increase game variety
    let offsetP1 = Math.floor(Math.random() * 300) + 200;
    let offsetP2 = Math.floor(Math.random() * 300) + 200;
    let p1X = offsetP1;
    let p2X = GAME_WIDTH - offsetP2;

    let windDir = (
        Math.random() < 0.5
        ? 1
        : -1
    );

    // Default config ensures the module can run standalone in tests
    let c = config || {
        p1Color: "#3498db",
        p1Name: "Player 1",
        p2Color: "#e74c3c",
        p2Name: "Player 2"
    };

    return {
        phase: "aiming",
        players: [
            {
                color: c.p1Color,
                hp: 100,
                id: 1,
                name: c.p1Name,
                x: p1X,
                y: GROUND_Y
            },
            {
                color: c.p2Color,
                hp: 100,
                id: 2,
                name: c.p2Name,
                x: p2X,
                y: GROUND_Y
            }
        ],
        projectile: null,
        turn: 0,
        wind: (Math.floor(Math.random() * 10) + 1) * windDir,
        winner: null
    };
}

/**
 * Transition function: Generates a projectile from the active player.
 * @param {GameState} state - The previous state.
 * @param {number} angle - Computed launch trajectory.
 * @param {number} power - Computed launch magnitude.
 * @returns {GameState} The new state containing the active projectile.
 */
function fireShot(state, angle, power) {
    if (state.phase !== "aiming") {
        return state;
    }

    let activePlayer = state.players[state.turn];

    // Resolve the vector into Cartesian coordinates for simulation
    let vx = Math.cos(angle) * power;
    let vy = Math.sin(angle) * power;

    // Use Ramda to create a fresh object instead of mutating old state
    let nextState = R.assoc("phase", "firing", state);
    nextState = R.assoc("projectile", {
        age: 0,
        vx: vx,
        vy: vy,
        x: activePlayer.x,
        y: activePlayer.y - 18
    }, nextState);

    return nextState;
}

/**
 * Updates kinematics for the projectile and handles collision logic.
 * Extensively uses Ramda for mapping and filtering arrays.
 * @param {GameState} state - The current game state.
 * @returns {GameState} The state evaluated for the next frame.
 */
function updatePhysics(state) {
    if (state.phase !== "firing" || !state.projectile) {
        return state;
    }

    let p = state.projectile;

    // Apply velocity vectors to spatial coordinates
    let nextX = p.x + p.vx;
    let nextY = p.y + p.vy;

    // Wind modifies horizontal velocity; gravity modifies vertical velocity
    let nextVx = p.vx + (state.wind * 0.015);
    let nextVy = p.vy + GRAVITY;
    let nextAge = p.age + 1;

    // Boundary check prevents simulation running infinitely if shot misses
    if (nextX < -1000 || nextX > GAME_WIDTH + 1000) {
        let outState = R.assoc("phase", "transitioning", state);
        return R.assoc("projectile", null, outState);
    }

    let hitGround = nextY >= GROUND_Y;
    let blastRadius = 100;

    // Pure helper to determine if the projectile intersects a tank area
    let checkDirectHit = function (player) {
        let dx = Math.abs(player.x - nextX);
        let dy = player.y - nextY;
        // Age gate prevents detonating on the firing player instantly
        let isHitX = dx < 50;
        let isHitY = dy > -10 && dy < 50;
        return isHitX && isHitY && nextAge > 5;
    };

    // Use Ramda to check if any player satisfies the hit criteria
    let hitTank = R.any(checkDirectHit, state.players);

    if (hitGround || hitTank) {
        // Pure helper to assess and assign damage values
        let applyDamage = function (player) {
            let dx = Math.abs(player.x - nextX);
            let dy = player.y - nextY;

            let isHitX = dx < 50;
            let isHitY = dy > -10 && dy < 50;

            let directHit = isHitX && isHitY && nextAge > 5;
            let splashHit = hitGround && dx < blastRadius;

            if (directHit || splashHit) {
                // Return a fresh player object with reduced HP
                return R.assoc("hp", Math.max(0, player.hp - 30), player);
            }
            return player;
        };

        // Ramda map safely processes the array, returning a new array
        let newPlayers = R.map(applyDamage, state.players);

        let p1Dead = newPlayers[0].hp === 0;
        let p2Dead = newPlayers[1].hp === 0;
        let winner = null;

        // Calculate termination state based on remaining hit points
        if (p1Dead && p2Dead) {
            winner = "Draw";
        } else if (p1Dead) {
            winner = 2;
        } else if (p2Dead) {
            winner = 1;
        }

        return {
            phase: (
                winner
                ? "gameover"
                : "transitioning"
            ),
            players: newPlayers,
            projectile: null,
            turn: state.turn,
            wind: state.wind,
            winner: winner
        };
    }

    // Return the continued simulation state if no collision took place
    let progressState = R.assoc("projectile", {
        age: nextAge,
        vx: nextVx,
        vy: nextVy,
        x: nextX,
        y: nextY
    }, state);

    return progressState;
}

/**
 * Advances the turn-based system after a round resolves.
 * @param {GameState} state - The transitioning state.
 * @returns {GameState} A new state resetting phase for the next player.
 */
function startNextTurn(state) {
    if (state.phase !== "transitioning") {
        return state;
    }

    let newWind = state.wind;

    // Wind mechanics are recalculated only when a full round completes
    if (state.turn === 1) {
        let windDir = (
            Math.random() < 0.5
            ? 1
            : -1
        );
        newWind = (Math.floor(Math.random() * 10) + 1) * windDir;
    }

    let turnState = R.assoc("phase", "aiming", state);
    turnState = R.assoc("turn", (
        state.turn === 0
        ? 1
        : 0
    ), turnState);
    return R.assoc("wind", newWind, turnState);
}

export default Object.freeze({
    GAME_WIDTH: GAME_WIDTH,
    GRAVITY: GRAVITY,
    GROUND_Y: GROUND_Y,
    createInitialState: createInitialState,
    fireShot: fireShot,
    startNextTurn: startNextTurn,
    updatePhysics: updatePhysics
});