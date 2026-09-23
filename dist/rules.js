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

  function cardCategory(card, level, trumpSuit) {
    return isTrump(card, level, trumpSuit) ? 'trump' : card.suit;
  }

  function cardKey(card) {
    return card.joker ? `joker:${card.joker}` : `${card.suit}:${card.rank}`;
  }

  function fullDeck() {
    const deck = SUIT_ORDER.flatMap(suit => LEVEL_RANKS.map(rank => ({ suit, rank, joker: null })));
    return [...deck, { suit: null, rank: '小王', joker: 'small' }, { suit: null, rank: '大王', joker: 'big' }];
  }

  function canLeadThrow(cards, playedCards, level, trumpSuit) {
    if (cards.length < 2) return false;
    const leadCategory = cardCategory(cards[0], level, trumpSuit);
    if (!cards.every(card => cardCategory(card, level, trumpSuit) === leadCategory)) return false;
    const played = new Set(playedCards.map(cardKey));
    const highest = fullDeck()
      .filter(card => cardCategory(card, level, trumpSuit) === leadCategory && !played.has(cardKey(card)))
      .sort((a, b) => cardPower(b, level, trumpSuit) - cardPower(a, level, trumpSuit))
      .slice(0, cards.length);
    const chosen = new Set(cards.map(cardKey));
    return highest.length === cards.length && highest.every(card => chosen.has(cardKey(card)));
  }

  function normalPlayKind(cards, leadCategory, level, trumpSuit) {
    if (cards.every(card => cardCategory(card, level, trumpSuit) === leadCategory)) return 'follow';
    if (leadCategory !== 'trump' && cards.every(card => isTrump(card, level, trumpSuit))) return 'cut';
    return null;
  }

  function beatsNormalPlay(challenger, incumbent, leadCards, level, trumpSuit) {
    if (challenger.length !== leadCards.length || incumbent.length !== leadCards.length) return false;
    const leadCategory = cardCategory(leadCards[0], level, trumpSuit);
    const challengerKind = normalPlayKind(challenger, leadCategory, level, trumpSuit);
    const incumbentKind = normalPlayKind(incumbent, leadCategory, level, trumpSuit);
    if (!challengerKind) return false;
    if (!incumbentKind) return true;
    if (challengerKind !== incumbentKind) return challengerKind === 'cut';
    const challengerPowers = challenger.map(card => cardPower(card, level, trumpSuit)).sort((a, b) => b - a);
    const incumbentPowers = incumbent.map(card => cardPower(card, level, trumpSuit)).sort((a, b) => b - a);
    for (let index = 0; index < challengerPowers.length; index++) {
      if (challengerPowers[index] !== incumbentPowers[index]) return challengerPowers[index] > incumbentPowers[index];
    }
    return false;
  }

  function winningNormalPlay(plays, level, trumpSuit) {
    const leadCards = plays[0].cards;
    return plays.slice(1).reduce((winner, play) =>
      beatsNormalPlay(play.cards, winner.cards, leadCards, level, trumpSuit) ? play : winner, plays[0]);
  }

  function chooseMultiFollow(hand, plays, player, level, trumpSuit) {
    const leadCards = plays[0].cards;
    const required = leadCards.length;
    const leadCategory = cardCategory(leadCards[0], level, trumpSuit);
    const matching = hand.filter(card => cardCategory(card, level, trumpSuit) === leadCategory);
    const winner = winningNormalPlay(plays, level, trumpSuit);
    const partnerWinning = winner.player % 2 === player % 2;
    const cheap = (a, b) => cardPoints(a) - cardPoints(b) || cardPower(a, level, trumpSuit) - cardPower(b, level, trumpSuit);
    const strong = (a, b) => cardPower(b, level, trumpSuit) - cardPower(a, level, trumpSuit);
    const mustFollow = Math.min(required, matching.length);
    const selected = matching.length >= required
      ? [...matching].sort(cheap).slice(0, required)
      : [...matching];
    if (selected.length < required) {
      const used = new Set(selected.map(cardKey));
      const rest = hand.filter(card => !used.has(cardKey(card)));
      selected.push(...rest.sort(cheap).slice(0, required - selected.length));
    }
    if (!partnerWinning) {
      const strongest = matching.length >= required
        ? [...matching].sort(strong).slice(0, required)
        : matching.length === 0
          ? hand.filter(card => isTrump(card, level, trumpSuit)).sort(strong).slice(0, required)
          : [];
      if (strongest.length === required && beatsNormalPlay(strongest, winner.cards, leadCards, level, trumpSuit)) return strongest;
    }
    if (partnerWinning && plays.length === 3) {
      const feed = matching.length >= required
        ? [...matching].sort((a, b) => cardPoints(b) - cardPoints(a) || cardPower(a, level, trumpSuit) - cardPower(b, level, trumpSuit)).slice(0, required)
        : null;
      if (feed && !beatsNormalPlay(feed, winner.cards, leadCards, level, trumpSuit)) return feed;
    }
    return selected;
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

  return { MIN_LEVEL, MAX_LEVEL, LEVEL_RANKS, rankValue, levelRank, isTrump, cardPower, cardPoints, canBuryCard, cardCategory, canLeadThrow, beatsNormalPlay, winningNormalPlay, chooseMultiFollow, isTong, canLeadTong, tongGroups, strongestTongFallback, winningTongPlay, resolveRound };
});
