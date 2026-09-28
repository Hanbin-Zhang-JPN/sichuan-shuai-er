(() => {
  'use strict';

  const BPM = [88, 116, 148];
  const MODE_NAMES = ['平稳', '紧张', '决胜'];

  function modeForRound(round) {
    if (!round || round.phase !== 'playing') return 0;
    const remaining = Math.max(...round.hands.map(hand => hand.length));
    const exposedPoints = round.trick.flatMap(play => play.cards)
      .reduce((sum, card) => sum + (card.rank === '5' ? 5 : card.rank === '10' || card.rank === 'K' ? 10 : 0), 0);
    const score = round.defenderPoints;
    if (remaining <= 2 || score >= 40 || (round.level === 14 && (round.trickNumber === 1 || remaining <= 3))
      || (score >= 30 && exposedPoints >= 10)) return 2;
    if (remaining <= 6 || score >= 25 || round.level === 14) return 1;
    return 0;
  }

  function createPlayer() {
    let context = null;
    let musicGain = null;
    let timer = null;
    let nextNote = 0;
    let step = 0;
    let mode = 0;
    let enabled = false;
    let unlocked = false;

    function getContext() {
      if (!context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        context = new AudioContext();
        musicGain = context.createGain();
        musicGain.gain.value = 0;
        musicGain.connect(context.destination);
      }
      return context;
    }

    function pluck(frequency, time, length, volume, output, type = 'triangle') {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, time);
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.exponentialRampToValueAtTime(volume, time + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + length);
      oscillator.connect(envelope).connect(output);
      oscillator.start(time);
      oscillator.stop(time + length + 0.015);
    }

    const notes = [293.66, 349.23, 392.00, 440.00, 523.25, 587.33];
    const melody = [0, null, 2, null, 3, 2, 1, null, 0, null, 4, 3, 2, null, 1, null];
    function scheduleStep(time) {
      const index = step % 16;
      const beat = 60 / BPM[mode];
      const note = melody[index];
      if (note !== null) pluck(notes[note], time, beat * 0.42, mode === 2 ? 0.19 : 0.16, musicGain);
      if (index % 4 === 0) pluck(index < 8 ? 146.83 : 130.81, time, beat * 0.8, 0.15, musicGain, 'sine');
      if (mode > 0 && index % 4 === 2) pluck(880, time, 0.045, mode === 2 ? 0.065 : 0.045, musicGain, 'sine');
      if (mode === 2 && index % 2 === 1) pluck(notes[(index + 2) % notes.length] * 2, time, 0.065, 0.035, musicGain, 'sine');
      step++;
      nextNote += beat / 2;
    }

    function schedule() {
      if (!enabled || !context || context.state !== 'running' || document.hidden) return;
      nextNote = Math.max(nextNote, context.currentTime + 0.025);
      while (nextNote < context.currentTime + 0.12) scheduleStep(nextNote);
    }

    async function start() {
      if (!enabled || document.hidden) return;
      try {
        const ctx = getContext();
        if (!ctx) return;
        await ctx.resume();
        if (!enabled || document.hidden) return;
        unlocked = true;
        musicGain.gain.cancelScheduledValues(ctx.currentTime);
        musicGain.gain.setTargetAtTime(0.115, ctx.currentTime, 0.18);
        nextNote = ctx.currentTime + 0.04;
        if (!timer) timer = setInterval(schedule, 25);
        schedule();
      } catch (_) { /* 浏览器可能要求再次点击以启用声音 */ }
    }

    function setEnabled(value) {
      enabled = Boolean(value);
      if (enabled) {
        start();
      } else {
        if (timer) clearInterval(timer);
        timer = null;
        if (context) {
          musicGain.gain.cancelScheduledValues(context.currentTime);
          musicGain.gain.setTargetAtTime(0.0001, context.currentTime, 0.04);
        }
      }
    }

    function onVisibilityChange() {
      if (document.hidden) {
        if (timer) clearInterval(timer);
        timer = null;
        if (context) musicGain.gain.setTargetAtTime(0.0001, context.currentTime, 0.04);
      } else if (enabled && unlocked) {
        start();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return {
      start,
      setEnabled,
      setMode(value) { mode = Math.max(0, Math.min(2, value | 0)); },
      getMode() { return mode; },
      isEnabled() { return enabled; },
      isAvailable() { return Boolean(window.AudioContext || window.webkitAudioContext); },
      modeName() { return MODE_NAMES[mode]; }
    };
  }

  const api = { BPM, MODE_NAMES, modeForRound, createPlayer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ShuaiErMusic = api;
})();
