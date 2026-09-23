(function (root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  if (root) root.ShuaiErRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_LEVEL = 2;
  const MAX_LEVEL = 14;
  const LEVEL_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUIT_ORDER = ['spades', 'hearts', 'clubs', 'diamonds'];

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
    return card.rank === levelRank(level) || card.suit === trumpSuit;
  }

  function cardPower(card, level, trumpSuit) {
    if (!isTrump(card, level, trumpSuit)) return rankValue(card.rank);
    if (card.joker === 'big') return 1000;
    if (card.joker === 'small') return 990;
    if (level === MAX_LEVEL) return 980 + SUIT_ORDER.indexOf(card.suit);
    if (card.rank === levelRank(level) && card.suit === trumpSuit) return 980;
    if (card.rank === levelRank(level)) return 960 + SUIT_ORDER.indexOf(card.suit);
    return 800 + rankValue(card.rank);
  }

  function cardPoints(card) {
    if (card.rank === '5') return 5;
    if (card.rank === '10' || card.rank === 'K') return 10;
    return 0;
  }

  function canBuryCard(card) { return cardPoints(card) === 0; }

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

  function resolveRound(levels, dealer, defenderPoints, aceCondition = {}) {
    const dealerTeam = dealer % 2;
    const defenderTeam = 1 - dealerTeam;
    const nextLevels = [...levels];
    const playingAce = levels[dealerTeam] === MAX_LEVEL;
    if (defenderPoints >= 45) {
      const steps = Math.min(3, Math.floor((defenderPoints - 45) / 10));
      nextLevels[defenderTeam] = Math.min(MAX_LEVEL, nextLevels[defenderTeam] + steps);
      return {
        levels: nextLevels,
        nextDealer: (dealer + 1) % 4,
        winningTeam: defenderTeam,
        changedDealerSide: true,
        steps,
        escapedPoints: Math.max(0, 100 - defenderPoints),
        champion: null,
        aceRetry: false
      };
    }
    const escapedPoints = Math.max(0, 100 - defenderPoints);
    const aceWon = playingAce && aceCondition.firstTrickAce === true && aceCondition.lastTrickAce === true;
    const steps = playingAce ? 0 : escapedPoints === 100 ? 3 : 1;
    nextLevels[dealerTeam] = Math.min(MAX_LEVEL, nextLevels[dealerTeam] + steps);
    return {
      levels: nextLevels,
      nextDealer: (dealer + 2) % 4,
      winningTeam: dealerTeam,
      changedDealerSide: false,
      steps,
      escapedPoints,
      champion: aceWon ? dealerTeam : null,
      aceRetry: playingAce && !aceWon
    };
  }

  return { MIN_LEVEL, MAX_LEVEL, LEVEL_RANKS, rankValue, levelRank, isTrump, cardPower, cardPoints, canBuryCard, isTong, canLeadTong, tongGroups, strongestTongFallback, winningTongPlay, resolveRound };
});
