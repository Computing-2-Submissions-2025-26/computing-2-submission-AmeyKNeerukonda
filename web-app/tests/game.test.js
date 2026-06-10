// UNIT TESTS
// Testing functional core in isolation without DOM.
// -----------------------------------------------------------------------------

import assert from "assert";
import Game from "../game.js";

describe("Game Logic Module", function () {

    describe("createInitialState()", function () {
        it(
            "Given config, applies custom names and colours",
            function () {
                let testConfig = {
                    p1Color: "#111111",
                    p1Name: "Alice",
                    p2Color: "#222222",
                    p2Name: "Bob"
                };

                let state = Game.createInitialState(testConfig);

                assert.strictEqual(state.players[0].name, "Alice");
                assert.strictEqual(state.players[0].color, "#111111");
                assert.strictEqual(state.players[1].name, "Bob");
                assert.strictEqual(state.players[1].color, "#222222");
            }
        );

        it(
            "Given new game, phase is aiming and turn is 0",
            function () {
                let state = Game.createInitialState();

                assert.strictEqual(state.phase, "aiming");
                assert.strictEqual(state.turn, 0);
                assert.strictEqual(state.projectile, null);
            }
        );
    });

    describe("fireShot()", function () {
        it(
            "Given aiming phase, returns firing with projectile",
            function () {
                let initialState = Game.createInitialState();
                let angle = 0;
                let power = 20;

                let nextState = Game.fireShot(initialState, angle, power);

                assert.strictEqual(nextState.phase, "firing");
                assert.notStrictEqual(nextState.projectile, null);
                assert.strictEqual(nextState.projectile.vx, 20);
                assert.strictEqual(nextState.projectile.vy, 0);
                assert.strictEqual(nextState.projectile.age, 0);
            }
        );

        it(
            "Given not aiming, fireShot returns same state",
            function () {
                let state = Game.createInitialState();
                state.phase = "transitioning";

                let nextState = Game.fireShot(state, 0, 20);

                assert.deepStrictEqual(nextState, state);
            }
        );
    });

    describe("updatePhysics()", function () {
        it(
            "Given flying projectile, updates via gravity",
            function () {
                let state = Game.createInitialState();
                state.phase = "firing";
                state.wind = 0;
                state.projectile = {
                    age: 0,
                    vx: 10,
                    vy: -10,
                    x: 500,
                    y: 500
                };

                let nextState = Game.updatePhysics(state);

                assert.strictEqual(nextState.projectile.x, 510);
                assert.strictEqual(nextState.projectile.y, 490);
                assert.strictEqual(
                    nextState.projectile.vy,
                    -10 + Game.GRAVITY
                );
                assert.strictEqual(nextState.projectile.age, 1);
            }
        );

        it(
            "Given ground hit, phase changes and applies damage",
            function () {
                let state = Game.createInitialState();
                state.phase = "firing";
                state.players[0].x = 500;
                state.players[0].y = Game.GROUND_Y;

                state.projectile = {
                    age: 10,
                    vx: 0,
                    vy: 10,
                    x: 510,
                    y: Game.GROUND_Y - 5
                };

                let nextState = Game.updatePhysics(state);

                assert.strictEqual(nextState.phase, "transitioning");
                assert.strictEqual(nextState.projectile, null);
                assert.strictEqual(nextState.players[0].hp, 70);
                assert.strictEqual(nextState.players[1].hp, 100);
            }
        );

        it(
            "Given out of bounds, destroys projectile safely",
            function () {
                let state = Game.createInitialState();
                state.phase = "firing";
                state.projectile = {
                    age: 10,
                    vx: -50,
                    vy: 0,
                    x: -1500,
                    y: 200
                };

                let nextState = Game.updatePhysics(state);

                assert.strictEqual(nextState.phase, "transitioning");
                assert.strictEqual(nextState.projectile, null);
                assert.strictEqual(nextState.players[0].hp, 100);
            }
        );

        it(
            "Given HP is 0, declares game over and winner",
            function () {
                let state = Game.createInitialState();
                state.phase = "firing";
                state.players[1].hp = 30;
                state.players[1].x = 800;

                state.projectile = {
                    age: 10,
                    vx: 0,
                    vy: 5,
                    x: 800,
                    y: Game.GROUND_Y - 2
                };

                let nextState = Game.updatePhysics(state);

                assert.strictEqual(nextState.phase, "gameover");
                assert.strictEqual(nextState.players[1].hp, 0);
                assert.strictEqual(nextState.winner, 1);
            }
        );
    });

    describe("startNextTurn()", function () {
        it(
            "Given transitioning state, swaps turn to aiming",
            function () {
                let state = Game.createInitialState();
                state.phase = "transitioning";
                state.turn = 0;
                let originalWind = state.wind;

                let nextState = Game.startNextTurn(state);

                assert.strictEqual(nextState.phase, "aiming");
                assert.strictEqual(nextState.turn, 1);
                assert.strictEqual(nextState.wind, originalWind);
            }
        );
    });
});