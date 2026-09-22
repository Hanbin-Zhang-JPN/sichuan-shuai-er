const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../dist/rules.js');

test('一副牌等级从 2 连续升到 A，J/Q/K/A 分别为 11/12/13/14', () => {
  assert.deepEqual(rules.LEVEL_RANKS, ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']);
  for (const [rank, value] of [['J', 11], ['Q', 12], ['K', 13], ['A', 14]]) {
    assert.equal(rules.rankValue(rank), value);
    assert.equal(rules.levelRank(value), rank);
  }
});

test('庄家跑掉 75 分时，从 2 升到 5 并由对家继续坐庄', () => {
  const result = rules.resolveRound([2, 2], 0, 25);
  assert.deepEqual(result.levels, [5, 2]);
  assert.equal(result.steps, 3);
  assert.equal(result.nextDealer, 2);
  assert.equal(result.champion, null);
});

test('闲家抓满 45 分及以上只换庄，不增加级牌', () => {
  for (const points of [45, 55, 75, 110]) {
    const result = rules.resolveRound([7, 9], 0, points);
    assert.deepEqual(result.levels, [7, 9]);
    assert.equal(result.nextDealer, 1);
    assert.equal(result.steps, 0);
  }
});

test('任何一队先升级到 A 时赢得整场', () => {
  const result = rules.resolveRound([8, 13], 1, 40);
  assert.deepEqual(result.levels, [8, 14]);
  assert.equal(result.champion, 1);
});

test('打 A 时，54 张牌里仅四张 A 和两张大小王为主牌', () => {
  const suits = ['spades', 'hearts', 'clubs', 'diamonds'];
  const deck = suits.flatMap(suit => rules.LEVEL_RANKS.map(rank => ({ suit, rank, joker: null })));
  deck.push({ suit: null, rank: '小王', joker: 'small' }, { suit: null, rank: '大王', joker: 'big' });
  assert.equal(deck.length, 54);
  const trumps = deck.filter(card => rules.isTrump(card, 14, null));
  assert.equal(trumps.length, 6);
  assert.deepEqual(trumps.map(card => card.rank).sort(), ['A', 'A', 'A', 'A', '大王', '小王'].sort());
  assert.equal(rules.isTrump({ suit: 'hearts', rank: '7', joker: null }, 14, null), false);
});

test('“同”需要四张同点数且只能前三轮由首家打出', () => {
  const fours = ['spades', 'hearts', 'clubs', 'diamonds'].map(suit => ({ rank: '5', suit }));
  assert.equal(rules.isTong(fours), true);
  assert.equal(rules.canLeadTong(fours, 3, true), true);
  assert.equal(rules.canLeadTong(fours, 4, true), false);
  assert.equal(rules.canLeadTong(fours, 2, false), false);
  assert.equal(rules.isTong([...fours.slice(0, 3), { rank: '6', suit: 'diamonds' }]), false);
});

test('有“同”时点数大的赢；非“同”的双王加主牌也压不过', () => {
  const four = rank => ['spades', 'hearts', 'clubs', 'diamonds'].map(suit => ({ rank, suit }));
  const plays = [
    { player: 0, type: 'tong', cards: four('5') },
    { player: 1, type: 'normal', cards: [{ rank: '大王' }, { rank: '小王' }, { rank: 'A' }, { rank: 'K' }] },
    { player: 2, type: 'tong', cards: four('J') }
  ];
  assert.equal(rules.winningTongPlay(plays).player, 2);
});

test('没有“同”时先交最大的四张主牌，主牌不足再补最大的副牌', () => {
  const hand = [
    { id: 'a', trump: true, strength: 7 }, { id: 'b', trump: true, strength: 10 },
    { id: 'c', trump: false, strength: 14 }, { id: 'd', trump: false, strength: 6 },
    { id: 'e', trump: false, strength: 12 }
  ];
  const selected = rules.strongestTongFallback(hand, card => card.trump, card => card.strength);
  assert.deepEqual(selected.map(card => card.id), ['b', 'a', 'c', 'e']);
});
