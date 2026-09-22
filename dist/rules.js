(function (root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  if (root) root.ShuaiErRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_LEVEL = 2;
  const MAX_LEVEL = 14;
  const LEVEL_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  function rankValue(rank) {
    if (rank === 'J') return 11;
    if (rank === 'Q') return 12;
    if (rank === 'K') return 13;
    if (rank === 'A') return 14;
    const value = Number(rank);
    return Number.isInteger(value) && value >= 2 && value <= 10 ? value : 0;
  }

  function levelRank(level) {
    return LEVEL_RANKS[Math.max(0, Math.min(MAX_LEVEL, level) - MIN_LEVEL)];
  }

  function isTrump(card, level, trumpSuit) {
    if (card.joker) return true;
    if (level === 14) return card.rank === 'A';
    return card.rank === levelRank(level) || card.rank === '7' || card.suit === trumpSuit;
  }

  function isTong(cards) {
    return cards.length === 4 && cards.every(card => !card.joker && card.rank === cards[0].rank);
  }

  function canLeadTong(cards, trickNumber, isFirst) {
    return Boolean(isFirst && trickNumber <= 3 && isTong(cards));
  }

  function tongGroups(hand) {
    const byRank = new Map();
    for (const card of hand) {
      if (card.joker) continue;
      if (!byRank.has(card.rank)) byRank.set(card.rank, []);
      byRank.get(card.rank).push(card);
    }
    return [...byRank.values()].filter(cards => cards.length === 4)
      .sort((a, b) => rankValue(a[0].rank) - rankValue(b[0].rank));
  }

  function strongestTongFallback(hand, isTrumpCard, power) {
    const descending = (a, b) => power(b) - power(a);
    const trumps = hand.filter(isTrumpCard).sort(descending);
    const others = hand.filter(card => !isTrumpCard(card)).sort(descending);
    return [...trumps, ...others].slice(0, 4);
  }

  function winningTongPlay(plays) {
    const playedTong = plays.filter(play => play.type === 'tong');
    if (!playedTong.length) return null;
    return playedTong.reduce((winner, play) =>
      rankValue(play.cards[0].rank) > rankValue(winner.cards[0].rank) ? play : winner);
  }

  function resolveRound(levels, dealer, defenderPoints) {
    const dealerTeam = dealer % 2;
    const defenderTeam = 1 - dealerTeam;
    const nextLevels = [...levels];
    if (defenderPoints >= 45) {
      return {
        levels: nextLevels,
        nextDealer: (dealer + 1) % 4,
        winningTeam: defenderTeam,
        changedDealerSide: true,
        steps: 0,
        champion: null
      };
    }
    const escapedPoints = Math.max(0, 100 - defenderPoints);
    const steps = Math.max(0, Math.floor((escapedPoints - 45) / 10));
    nextLevels[dealerTeam] = Math.min(MAX_LEVEL, nextLevels[dealerTeam] + steps);
    return {
      levels: nextLevels,
      nextDealer: (dealer + 2) % 4,
      winningTeam: dealerTeam,
      changedDealerSide: false,
      steps,
      escapedPoints,
      champion: nextLevels[dealerTeam] === MAX_LEVEL ? dealerTeam : null
    };
  }

  return { MIN_LEVEL, MAX_LEVEL, LEVEL_RANKS, rankValue, levelRank, isTrump, isTong, canLeadTong, tongGroups, strongestTongFallback, winningTongPlay, resolveRound };
});
