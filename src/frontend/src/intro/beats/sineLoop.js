/**
 * Style vars for a sine loop `a·sin(ω·t + φ)` (ω in rad/s) driven by an alternating ease-in-out
 * animation between -a and a. `--p` is half a period; `--o` is the negative delay that puts the loop
 * at phase φ at t = 0. Pair with `animation: x var(--p) cubic-bezier(0.37, 0, 0.63, 1) var(--o) infinite alternate`.
 */
export function sineLoop(omega, phase = 0) {
    return {
        '--p': `${Math.round((Math.PI / omega) * 1000)}ms`,
        '--o': `${Math.round((-(phase + Math.PI / 2) / omega) * 1000)}ms`,
    };
}
