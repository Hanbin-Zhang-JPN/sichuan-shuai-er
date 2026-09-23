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

test('庄家跑掉 75 或 95 分，都只升一级并守庄', () => {
  const result = rules.resolveRound([2, 2], 0, 25);
  assert.deepEqual(result.levels, [3, 2]);
  assert.equal(result.steps, 1);
  assert.equal(result.nextDealer, 2);
  const high = rules.resolveRound([2, 2], 0, 5);
  assert.deepEqual(high.levels, [3, 2]);
  assert.equal(high.steps, 1);
});

test('庄家跑满 100 分升三级，单局最多升三级', () => {
  const result = rules.resolveRound([2, 2], 0, 0);
  assert.deepEqual(result.levels, [5, 2]);
  assert.equal(result.steps, 3);
});

test('闲家达到 45 分后换庄，并按 0、1、2、3 级封顶升级', () => {
  for (const [points, steps] of [[45, 0], [54, 0], [55, 1], [64, 1], [65, 2], [74, 2], [75, 3], [100, 3], [110, 3]]) {
    const result = rules.resolveRound([7, 9], 0, points);
    assert.deepEqual(result.levels, [7, 9 + steps]);
    assert.equal(result.nextDealer, 1);
    assert.equal(result.steps, steps);
  }
});

test('升到 A 后还需另打一局，不能立刻赢得整场', () => {
  const result = rules.resolveRound([8, 13], 1, 40);
  assert.deepEqual(result.levels, [8, 14]);
  assert.equal(result.champion, null);
  const defender = rules.resolveRound([13, 9], 1, 55);
  assert.deepEqual(defender.levels, [14, 9]);
  assert.equal(defender.champion, null);
});

test('打 A 戴帽要求庄家首墩和末墩都出 A，且闲家不足 45 分', () => {
  for (const flags of [{}, { firstTrickAce: true }, { lastTrickAce: true }]) {
    const retry = rules.resolveRound([14, 8], 0, 20, flags);
    assert.equal(retry.champion, null);
    assert.equal(retry.aceRetry, true);
    assert.equal(retry.nextDealer, 2);
    assert.deepEqual(retry.levels, [14, 8]);
  }
  const win = rules.resolveRound([14, 8], 0, 44, { firstTrickAce: true, lastTrickAce: true });
  assert.equal(win.champion, 0);
  const loseBanker = rules.resolveRound([14, 8], 0, 45, { firstTrickAce: true, lastTrickAce: true });
  assert.equal(loseBanker.champion, null);
  assert.equal(loseBanker.nextDealer, 1);
  assert.equal(loseBanker.aceRetry, false);
});

test('分牌 5、10、K 都不能埋，其他点数可以埋', () => {
  for (const rank of ['5', '10', 'K']) assert.equal(rules.canBuryCard({ rank }), false);
  for (const rank of ['2', '7', 'A', '大王']) assert.equal(rules.canBuryCard({ rank }), true);
});

test('7 只在打 7 或属于主花色时为主牌', () => {
  const seven = { rank: '7', suit: 'hearts', joker: null };
  assert.equal(rules.isTrump(seven, 5, 'clubs'), false);
  assert.equal(rules.isTrump(seven, 5, 'hearts'), true);
  assert.equal(rules.isTrump(seven, 7, 'clubs'), true);
});

test('单张本主仅小于大小王，高于其他级牌和主花色牌', () => {
  const card = (rank, suit) => ({ rank, suit, joker: null });
  const big = { rank: '大王', suit: null, joker: 'big' };
  const small = { rank: '小王', suit: null, joker: 'small' };
  const native = card('5', 'clubs');
  const vice = card('5', 'hearts');
  const suitCard = card('A', 'clubs');
  assert.ok(rules.cardPower(big, 5, 'clubs') > rules.cardPower(small, 5, 'clubs'));
  assert.ok(rules.cardPower(small, 5, 'clubs') > rules.cardPower(native, 5, 'clubs'));
  assert.ok(rules.cardPower(native, 5, 'clubs') > rules.cardPower(vice, 5, 'clubs'));
  assert.ok(rules.cardPower(vice, 5, 'clubs') > rules.cardPower(suitCard, 5, 'clubs'));
  assert.equal(rules.cardPower(card('7', 'hearts'), 5, 'clubs'), 7);
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
