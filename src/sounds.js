/**
 * sounds.js — Web Audio API retro sound effects module
 * Exposes window.SoundFX with: click, success, error, dialup, badge, floppy
 * All sounds generated programmatically — no audio files required.
 */
(function () {
    'use strict';

    let _ctx = null;

    function ctx() {
        if (!_ctx) {
            try {
                _ctx = new (window.AudioContext || window.webkitAudioContext)();
            } catch {
                return null;
            }
        }
        // Resume if suspended (browser autoplay policy)
        if (_ctx.state === 'suspended') _ctx.resume();
        return _ctx;
    }

    // ── Core helpers ─────────────────────────────────────────────────────────

    function oscillator(type, freq, startTime, duration, gainVal, ac) {
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.type      = type;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(gainVal, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
        return { osc, gain };
    }

    function noise(startTime, duration, gainVal, ac) {
        const bufSize = ac.sampleRate * duration;
        const buffer  = ac.createBuffer(1, Math.ceil(bufSize), ac.sampleRate);
        const data    = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src  = ac.createBufferSource();
        const gain = ac.createGain();
        src.buffer = buffer;
        gain.gain.setValueAtTime(gainVal, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        src.connect(gain);
        gain.connect(ac.destination);
        src.start(startTime);
        return { src, gain };
    }

    // ── Click — mechanical keyboard clack ────────────────────────────────────
    function click() {
        const ac = ctx();
        if (!ac) return;
        const t = ac.currentTime;
        // Low thump
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.04);
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        osc.connect(gain); gain.connect(ac.destination);
        osc.start(t); osc.stop(t + 0.06);
        // High click transient
        noise(t, 0.015, 0.12, ac);
    }

    // ── Success — Mario-style ascending chime ─────────────────────────────────
    function success() {
        const ac = ctx();
        if (!ac) return;
        const t     = ac.currentTime;
        const notes = [523.25, 659.26, 783.99, 1046.5]; // C5 E5 G5 C6
        notes.forEach((freq, i) => {
            oscillator('square', freq, t + i * 0.10, 0.12, 0.15, ac);
        });
        // Final sustain chord
        oscillator('triangle', 1046.5, t + 0.44, 0.30, 0.10, ac);
        oscillator('triangle', 783.99, t + 0.44, 0.30, 0.07, ac);
    }

    // ── Error — buzzer tone ────────────────────────────────────────────────────
    function error() {
        const ac = ctx();
        if (!ac) return;
        const t = ac.currentTime;
        // Harsh buzz
        oscillator('sawtooth', 110, t,       0.14, 0.20, ac);
        oscillator('sawtooth', 115, t + 0.15, 0.14, 0.20, ac);
        oscillator('sawtooth', 108, t + 0.30, 0.20, 0.22, ac);
        // Low thud
        const lfo = ac.createOscillator();
        const g   = ac.createGain();
        lfo.type = 'square';
        lfo.frequency.setValueAtTime(55, t);
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        lfo.connect(g); g.connect(ac.destination);
        lfo.start(t); lfo.stop(t + 0.55);
    }

    // ── Dial-up — modem handshake snippet ─────────────────────────────────────
    function dialup() {
        const ac = ctx();
        if (!ac) return;
        const t = ac.currentTime;

        // Dialing tones (DTMF-ish)
        const dtmf = [941, 1336, 697, 1209, 852, 1477, 770, 1209];
        dtmf.forEach((freq, i) => {
            oscillator('sine', freq, t + i * 0.06, 0.055, 0.10, ac);
        });

        // Connection negotiation chirps
        const chirps = [
            [2100, 0.55, 0.12], [1700, 0.67, 0.10],
            [2400, 0.79, 0.08], [3000, 0.87, 0.09],
            [2100, 0.96, 0.12], [1200, 1.08, 0.18],
        ];
        chirps.forEach(([freq, delay, dur]) => {
            oscillator('sawtooth', freq, t + delay, dur, 0.07, ac);
        });

        // Carrier noise burst
        noise(t + 1.26, 0.45, 0.06, ac);

        // Final connect tone
        oscillator('sine', 2100, t + 1.75, 0.35, 0.12, ac);
    }

    // ── Badge — achievement unlock jingle ─────────────────────────────────────
    function badge() {
        const ac = ctx();
        if (!ac) return;
        const t = ac.currentTime;

        // Rising arpeggio
        const melody = [261.63, 329.63, 392.00, 523.25, 659.26, 783.99];
        melody.forEach((freq, i) => {
            oscillator('triangle', freq, t + i * 0.07, 0.10, 0.12, ac);
            oscillator('square',   freq * 2, t + i * 0.07, 0.10, 0.05, ac);
        });

        // Final chord
        [523.25, 659.26, 783.99, 1046.5].forEach((freq, i) => {
            const g = ac.createGain();
            const o = ac.createOscillator();
            o.type = i % 2 === 0 ? 'triangle' : 'sine';
            o.frequency.setValueAtTime(freq, t + 0.50);
            g.gain.setValueAtTime(0.10, t + 0.50);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 1.20);
            o.connect(g); g.connect(ac.destination);
            o.start(t + 0.50); o.stop(t + 1.25);
        });
    }

    // ── Floppy — disk seek noise ───────────────────────────────────────────────
    function floppy() {
        const ac = ctx();
        if (!ac) return;
        const t = ac.currentTime;

        // Mechanical stepping noise
        for (let i = 0; i < 6; i++) {
            const step = t + i * 0.09;
            noise(step, 0.035, 0.18, ac);

            const osc  = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(80 + i * 15, step);
            osc.frequency.exponentialRampToValueAtTime(40, step + 0.04);
            gain.gain.setValueAtTime(0.14, step);
            gain.gain.exponentialRampToValueAtTime(0.0001, step + 0.06);
            osc.connect(gain); gain.connect(ac.destination);
            osc.start(step); osc.stop(step + 0.08);
        }

        // Motor hum
        oscillator('sawtooth', 120, t, 0.55, 0.04, ac);
    }

    // ── Public API ────────────────────────────────────────────────────────────
    const SoundFX = { click, success, error, dialup, badge, floppy };

    // Expose globally
    if (typeof window !== 'undefined') {
        window.SoundFX = SoundFX;
    }

    // Also export for module environments
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SoundFX;
    }
})();
