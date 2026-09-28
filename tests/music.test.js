const test = require('node:test');
const assert = require('node:assert/strict');
const { BPM, modeForRound } = require('../dist/music.js');

function round(overrides = {}) {
  return {
    phase: 'playing', level: 2, trickNumber: 3, defenderPoints: 0,
    hands: Array.from({ length: 4 }, () => Array(10).fill({ rank: '2' })),
    trick: [], ...overrides
  };
}

test('配乐按牌局压力分为平稳、紧张、决胜三档', () => {
  assert.deepEqual(BPM, [88, 116, 148]);
  assert.equal(modeForRound(round()), 0);
  assert.equal(modeForRound(round({ defenderPoints: 25 })), 1);
  assert.equal(modeForRound(round({ defenderPoints: 40 })), 2);
  assert.equal(modeForRound(round({
    defenderPoints: 30,
    trick: [{ cards: [{ rank: 'K' }] }]
  })), 2);
});

test('末墩与戴帽首墩为决胜节奏，结算后回归平稳', () => {
  const shortHands = Array.from({ length: 4 }, () => [{ rank: 'A' }]);
  assert.equal(modeForRound(round({ hands: shortHands })), 2);
  assert.equal(modeForRound(round({ level: 14, trickNumber: 1 })), 2);
  assert.equal(modeForRound(round({ level: 14, trickNumber: 4 })), 1);
  assert.equal(modeForRound(round({ phase: 'ended', defenderPoints: 45 })), 0);
});
