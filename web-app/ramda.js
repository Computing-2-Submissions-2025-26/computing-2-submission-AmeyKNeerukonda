/**
 * Integration fix for Ramda.
 * Destructured import to satisfy JSLint.
 */
import {
    any,
    assoc,
    filter,
    forEach,
    map
} from "../node_modules/ramda/es/index.js";

export default Object.freeze({
    any,
    assoc,
    filter,
    forEach,
    map
});