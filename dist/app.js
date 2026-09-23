(() => {
  'use strict';

  const SUITS = [
    { key: 'spades', symbol: '♠', name: '黑桃', red: false },
    { key: 'hearts', symbol: '♥', name: '红桃', red: true },
    { key: 'clubs', symbol: '♣', name: '梅花', red: false },
    { key: 'diamonds', symbol: '♦', name: '方块', red: true }
  ];
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const NAMES = ['你', '川叔', '竹影', '蓉姐'];
  const TEAM_NAMES = ['我方', '对方'];
  const RULES = window.ShuaiErRules;
  const el = id => document.getElementById(id);

  const storage = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch (_) { /* 本地文件模式下，浏览器可能禁用存储 */ }
    }
  };

  let state = null;
  let selected = new Set();
  let soundOn = true;
  let toastTimer = null;
  let roundToken = 0;
  let match = storage.get('shuaiErMatchV2', { levels: [2, 2], nextDealer: 0, champion: null, rounds: 0 });
  if (!Array.isArray(match.levels) || match.levels.length !== 2) {
    match = { levels: [2, 2], nextDealer: 0, champion: null, rounds: 0 };
  }
  let nextDealer = match.nextDealer;
  let record = storage.get('shuaiErRecordV2', { wins: 0, losses: 0 });

  function buildDeck() {
    let id = 0;
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) deck.push({ id: `c${id++}`, suit: suit.key, rank, joker: null });
    }
    deck.push({ id: `c${id++}`, suit: null, rank: '小王', joker: 'small' });
    deck.push({ id: `c${id++}`, suit: null, rank: '大王', joker: 'big' });
    return deck;
  }

  function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function dealDeck() {
    const deck = shuffle(buildDeck());
    const hands = [[], [], [], []];
    for (let i = 0; i < 48; i++) hands[i % 4].push(deck[i]);
    const bottom = deck.slice(48);

    const levelRank = RULES.levelRank(match.levels[nextDealer % 2]);
    // 确保庄家可以亮出当前级牌；第一局由玩家完整体验拿底与埋底。
    if (!hands[nextDealer].some(card => card.rank === levelRank)) {
      let source = bottom;
      let idx = source.findIndex(card => card.rank === levelRank);
      if (idx < 0) {
        const owner = [0, 1, 2, 3].find(p => p !== nextDealer && hands[p].some(card => card.rank === levelRank));
        source = hands[owner];
        idx = source.findIndex(card => card.rank === levelRank);
      }
      [hands[nextDealer][0], source[idx]] = [source[idx], hands[nextDealer][0]];
    }
    return { hands, bottom };
  }

  function suitInfo(key) { return SUITS.find(suit => suit.key === key); }
  function teamOf(player) { return player % 2; }
  function isTrump(card) {
    return RULES.isTrump(card, state.level, state.trumpSuit);
  }
  function category(card) { return isTrump(card) ? 'trump' : card.suit; }

  function power(card) {
    return RULES.cardPower(card, state.level, state.trumpSuit);
  }

  function points(card) {
    return RULES.cardPoints(card);
  }

  function cardLabel(card) {
    if (card.joker) return card.rank;
    const nativeLevel = state && state.level !== 14 && card.rank === state.levelRank && card.suit === state.trumpSuit;
    return `${suitInfo(card.suit).name}${card.rank}${nativeLevel ? `，本${card.rank}` : ''}`;
  }

  function sortHand(hand) {
    const suitOrder = ['spades', 'hearts', 'clubs', 'diamonds'];
    hand.sort((a, b) => {
      const ta = isTrump(a), tb = isTrump(b);
      if (ta !== tb) return ta ? 1 : -1;
      if (!ta && a.suit !== b.suit) return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
      return power(a) - power(b);
    });
  }

  function cardMarkup(card, compact = false) {
    const info = card.suit ? suitInfo(card.suit) : null;
    const red = card.joker === 'big' || info?.red;
    const courtRank = !card.joker && ['J', 'Q', 'K'].includes(card.rank);
    const nativeLevel = !card.joker && state.level !== 14 && card.rank === state.levelRank && card.suit === state.trumpSuit;
    const cannotBury = !compact && state.phase === 'bury' && !RULES.canBuryCard(card);
    const classes = [compact ? 'played-card' : 'card', red ? 'red' : '', card.joker ? 'joker' : '', courtRank ? 'is-court' : '', !compact && isTrump(card) ? 'is-trump' : '', nativeLevel ? 'is-native-level' : '', cannotBury ? 'cannot-bury' : ''].filter(Boolean).join(' ');
    const corner = card.joker ? (card.joker === 'big' ? '大王' : '小王') : `${card.rank}<span>${info.symbol}</span>`;
    const center = card.joker ? (card.joker === 'big' ? '大王' : '小王') : info.symbol;
    const portrait = courtRank ? `<img class="card-portrait" src="assets/court-${card.rank.toLowerCase()}.webp" alt="" draggable="false">` : '';
    const suitClass = courtRank ? 'card-suit court-suit' : 'card-suit';
    const nativeMark = nativeLevel ? `<span class="card-native-level">本${card.rank}</span>` : '';
    if (compact) return `<div class="${classes}" title="${cardLabel(card)}">${portrait}<span class="card-corner">${corner}</span><span class="${suitClass}">${center}</span>${nativeMark}</div>`;
    return `<button type="button" class="${classes}" data-id="${card.id}" aria-label="${cardLabel(card)}${cannotBury ? '，分牌不可埋' : ''}" ${cannotBury ? 'disabled title="分牌不可埋"' : ''}>${portrait}<span class="card-corner">${corner}</span><span class="${suitClass}">${center}</span>${nativeMark}</button>`;
  }

  function beginRound() {
    if (match.champion !== null) resetMatch();
    roundToken++;
    const token = roundToken;
    selected.clear();
    const dealt = dealDeck();
    const dealer = nextDealer;
    const level = match.levels[teamOf(dealer)];
    const levelRank = RULES.levelRank(level);
    const levelCards = dealt.hands[dealer].filter(card => card.rank === levelRank);
    const trumpSuit = level === 14 ? null : (levelCards[0]?.suit || SUITS[Math.floor(Math.random() * 4)].key);
    state = {
      token, hands: dealt.hands, bottom: dealt.bottom, dealer, trumpSuit, level, levelRank,
      phase: 'dealing', current: dealer, leader: dealer, trick: [], defenderPoints: 0,
      lastWinner: dealer, locked: true, trickNumber: 1, playedCards: [],
      firstTrickAce: false, lastTrickAce: false
    };
    for (const hand of state.hands) sortHand(hand);
    el('start-panel').hidden = true;
    el('result-dialog').open && el('result-dialog').close();
    el('bury-bar').hidden = true;
    el('turn-actions').hidden = true;
    clearTable();
    renderAll();
    setStatus('洗牌发牌中… 单副 54 张');
    sound('shuffle');
    setTimeout(() => setupDealer(token), 650);
  }

  function setupDealer(token) {
    if (!state || state.token !== token) return;
    const levelCard = state.hands[state.dealer].find(card => card.rank === state.levelRank && card.suit === state.trumpSuit);
    if (state.level === 14) {
      setStatus('打 A：只有四张 A 和大小王是主牌');
      toast(`${NAMES[state.dealer]}打 A · 无花色主`);
    } else {
      setStatus(`${NAMES[state.dealer]}亮出${levelCard ? cardLabel(levelCard) : suitInfo(state.trumpSuit).name + state.levelRank}，定${suitInfo(state.trumpSuit).name}为主`);
      toast(`${NAMES[state.dealer]}叫主：${suitInfo(state.trumpSuit).symbol} ${state.levelRank}`);
    }
    sound('trump');
    state.hands[state.dealer].push(...state.bottom);
    state.bottom = [];
    sortHand(state.hands[state.dealer]);
    if (state.dealer === 0) {
      state.phase = 'bury';
      state.locked = false;
      el('bury-bar').hidden = false;
      setStatus('你是庄家：拿起 6 张底牌，请选 6 张埋下');
      renderAll();
    } else {
      const buried = chooseBuried(state.dealer);
      state.bottom = buried;
      state.phase = 'playing';
      state.locked = false;
      renderAll();
      setStatus(`${NAMES[state.dealer]}已埋底，准备出牌`);
      setTimeout(() => { if (state?.token === token) runTurn(); }, 550);
    }
  }

  function chooseBuried(player) {
    const hand = state.hands[player];
    const candidates = hand.filter(RULES.canBuryCard).sort((a, b) => {
      const scoreA = (isTrump(a) ? 70 : 0) + power(a) / 20;
      const scoreB = (isTrump(b) ? 70 : 0) + power(b) / 20;
      return scoreA - scoreB;
    }).slice(0, 6);
    const ids = new Set(candidates.map(card => card.id));
    state.hands[player] = hand.filter(card => !ids.has(card.id));
    return candidates;
  }

  function burySelected() {
    if (selected.size !== 6 || state.phase !== 'bury') return;
    const ids = new Set(selected);
    const buried = state.hands[0].filter(card => ids.has(card.id));
    if (buried.length !== 6 || !buried.every(RULES.canBuryCard)) {
      toast('5、10、K 是分牌，不能埋底');
      return;
    }
    state.bottom = buried;
    state.hands[0] = state.hands[0].filter(card => !ids.has(card.id));
    selected.clear();
    state.phase = 'playing';
    state.locked = false;
    el('bury-bar').hidden = true;
    renderAll();
    setStatus('底牌已埋好，你先出牌');
    toast('已埋 6 张非分牌 · 底牌持续明示');
    runTurn();
  }

  function clearTable() {
    for (let p = 0; p < 4; p++) el(`play-${p}`).innerHTML = '';
    el('center-seal').style.opacity = '1';
  }

  function renderAll() {
    if (!state) return;
    renderHand();
    for (let p = 1; p < 4; p++) el(`count-${p}`).textContent = state.hands[p].length;
    el('defender-score').textContent = state.defenderPoints;
    el('defender-side').textContent = `${TEAM_NAMES[1 - teamOf(state.dealer)]}闲家`;
    el('home-level').textContent = RULES.levelRank(match.levels[0]);
    el('away-level').textContent = RULES.levelRank(match.levels[1]);
    const suit = state.trumpSuit ? suitInfo(state.trumpSuit) : null;
    el('trump-suit').textContent = suit ? `${suit.symbol} ${suit.name}` : '无';
    el('trump-suit').classList.toggle('red', Boolean(suit?.red));
    el('trump-display').textContent = state.levelRank;
    el('kitty-display').textContent = `底 ${state.bottom.length || (state.phase === 'bury' ? 6 : 0)}`;
    el('center-seal').querySelector('span').textContent = state.level === 14 ? '戴帽' : '甩';
    el('center-seal').classList.toggle('is-ace', state.level === 14);
    const showKitty = ['playing', 'ended'].includes(state.phase) && state.bottom.length === 6;
    el('kitty-reveal').hidden = !showKitty;
    if (showKitty) el('kitty-cards').innerHTML = state.bottom.map(card => cardMarkup(card, true)).join('');
    for (let p = 1; p < 4; p++) {
      el(`seat-${p}`).classList.toggle('is-dealer', state.dealer === p);
      el(`seat-${p}`).classList.toggle('is-turn', state.phase === 'playing' && state.current === p);
    }
    el('local-dealer-chip').classList.toggle('active', state.dealer === 0);
    el('turn-actions').hidden = state.phase !== 'playing' || state.current !== 0 || state.locked || state.trick.length === 4;
    updateButtons();
  }

  function renderHand() {
    if (!state) return;
    el('hand').innerHTML = state.hands[0].map(card => cardMarkup(card)).join('');
    for (const button of el('hand').querySelectorAll('.card')) {
      const id = button.dataset.id;
      button.classList.toggle('selected', selected.has(id));
      button.addEventListener('click', () => toggleCard(id));
    }
    updateLegalityShade();
  }

  function toggleCard(id) {
    if (!state || state.locked) return;
    if (state.phase === 'bury') {
      const card = state.hands[0].find(candidate => candidate.id === id);
      if (!card || !RULES.canBuryCard(card)) { toast('5、10、K 是分牌，不能埋底'); return; }
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < 6) selected.add(id);
      else toast('底牌只能选 6 张');
    } else if (state.phase === 'playing' && state.current === 0) {
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
    }
    renderHand();
    updateButtons();
  }

  function updateButtons() {
    if (!state) return;
    el('bury-selected').textContent = selected.size;
    el('bury-button').disabled = selected.size !== 6;
    const validation = validateSelection();
    el('play-button').disabled = !validation.ok;
    el('selection-feedback').textContent = selected.size ? (validation.message || '') : '';
    const chosen = state.hands[0].filter(card => selected.has(card.id));
    el('play-button').textContent = RULES.canLeadTong(chosen, state.trickNumber, !state.trick.length) ? '出同' : selected.size > 1 ? `甩 ${selected.size} 张` : '出牌';
  }

  function updateLegalityShade() {
    if (!state || state.phase !== 'playing' || state.current !== 0 || state.trick.length === 0) return;
    if (state.trick[0].type === 'tong') return;
    const leadCat = category(state.trick[0].cards[0]);
    const available = state.hands[0].filter(card => category(card) === leadCat);
    if (!available.length) return;
    for (const button of el('hand').querySelectorAll('.card')) {
      const card = state.hands[0].find(c => c.id === button.dataset.id);
      button.classList.toggle('illegal', category(card) !== leadCat);
    }
  }

  function validateSelection() {
    if (!state || state.phase !== 'playing' || state.current !== 0 || state.locked || state.trick.length === 4 || selected.size === 0) return { ok: false };
    const cards = state.hands[0].filter(card => selected.has(card.id));
    if (state.trick.length === 0) {
      if (RULES.isTong(cards)) {
        if (!RULES.canLeadTong(cards, state.trickNumber, true)) return { ok: false, message: '“同”只能在前三轮首出' };
        return { ok: true };
      }
      const cat = category(cards[0]);
      if (!cards.every(card => category(card) === cat)) return { ok: false, message: '甩牌必须是同一类别' };
      if (cards.length > 1 && !RULES.canLeadThrow(cards, state.playedCards, state.level, state.trumpSuit)) {
        return { ok: false, message: '甩牌必须是该类别尚未出过的最高几张' };
      }
      return { ok: true };
    }
    const required = state.trick[0].cards.length;
    if (cards.length !== required) return { ok: false, message: `请跟 ${required} 张` };
    if (state.trick[0].type === 'tong') {
      const ownTong = RULES.tongGroups(state.hands[0]);
      if (ownTong.length) return RULES.isTong(cards)
        ? { ok: true } : { ok: false, message: '手里有“同”，必须打出四张同点数牌' };
      const requiredCards = strongestTongFallback(state.hands[0]);
      const requiredIds = new Set(requiredCards.map(card => card.id));
      return cards.every(card => requiredIds.has(card.id))
        ? { ok: true } : { ok: false, message: '没有“同”：必须出最大的四张主牌，主牌不足再补最大的副牌' };
    }
    const leadCat = category(state.trick[0].cards[0]);
    const available = state.hands[0].filter(card => category(card) === leadCat).length;
    const followed = cards.filter(card => category(card) === leadCat).length;
    if (followed !== Math.min(available, required)) return { ok: false, message: '有首出类别时必须先跟足' };
    return { ok: true };
  }

  function playSelected() {
    const validation = validateSelection();
    if (!validation.ok) {
      if (validation.message) toast(validation.message);
      return;
    }
    const cards = state.hands[0].filter(card => selected.has(card.id));
    selected.clear();
    makePlay(0, cards);
  }

  function makePlay(player, cards) {
    const type = RULES.canLeadTong(cards, state.trickNumber, state.trick.length === 0)
      ? 'tong' : state.trick[0]?.type === 'tong' && RULES.isTong(cards) ? 'tong' : 'normal';
    const ids = new Set(cards.map(card => card.id));
    state.hands[player] = state.hands[player].filter(card => !ids.has(card.id));
    state.trick.push({ player, cards, type });
    if (state.level === 14 && player === state.dealer && state.trickNumber === 1 && cards.some(card => card.rank === 'A')) {
      state.firstTrickAce = true;
    }
    const trickComplete = state.trick.length === 4;
    state.locked = true;
    if (!trickComplete) state.current = (player + 1) % 4;
    el(`play-${player}`).innerHTML = cards.map(card => cardMarkup(card, true)).join('');
    el('center-seal').style.opacity = state.level === 14 ? '1' : '.16';
    sound(cards.length > 1 ? 'throw' : 'play');
    renderAll();
    if (type === 'tong') toast(`${NAMES[player]}打出“同” · 四张${cards[0].rank}`);
    else if (cards.length > 1) toast(`${NAMES[player]}甩了 ${cards.length} 张`);
    if (trickComplete) {
      setStatus('比牌中…');
      const token = state.token;
      setTimeout(() => { if (state?.token === token) resolveTrick(); }, 850);
    } else {
      runTurn();
    }
  }

  function runTurn() {
    if (!state || state.phase !== 'playing') return;
    renderAll();
    const leadCount = state.trick[0]?.cards.length || 1;
    const aceLead = state.level === 14 && state.dealer === 0 && state.trickNumber === 1 && !state.trick.length;
    setStatus(state.current === 0 ? (state.trick.length ? state.trick[0].type === 'tong' ? '轮到你：有“同”必须跟同，否则出最大的四张主牌' : `轮到你：请跟 ${leadCount} 张` : aceLead ? '戴帽首墩：庄家须出至少一张 A' : state.trickNumber <= 3 ? '轮到你先出：前三轮可打“同”，也可单出或甩牌' : '轮到你先出，可单出或选择同类牌甩出') : `${NAMES[state.current]}正在想…`);
    if (state.current === 0) {
      state.locked = false;
      renderAll();
      return;
    }
    state.locked = true;
    const token = state.token;
    setTimeout(() => {
      if (!state || state.token !== token || state.phase !== 'playing') return;
      const cards = chooseAIPlay(state.current);
      makePlay(state.current, cards);
    }, 500 + Math.random() * 1000);
  }

  function strongestTongFallback(hand) {
    return RULES.strongestTongFallback(hand, isTrump, power);
  }

  function leastCost(cards) {
    return [...cards].sort((a, b) => points(a) - points(b) || power(a) - power(b))[0];
  }

  function mostPoints(cards) {
    return [...cards].sort((a, b) => points(b) - points(a) || power(a) - power(b))[0];
  }

  function keepAceForLastTrick(cards, hand, player) {
    if (state.level !== 14 || player !== state.dealer || state.trickNumber === 1 || hand.length <= 1) return cards;
    const alternatives = cards.filter(card => card.rank !== 'A');
    return alternatives.length ? alternatives : cards;
  }

  function chooseAIPlay(player) {
    const hand = state.hands[player];
    const defending = teamOf(player) !== teamOf(state.dealer);
    if (!state.trick.length) {
      if (state.level === 14 && player === state.dealer && state.trickNumber === 1) {
        const aces = hand.filter(card => card.rank === 'A');
        if (aces.length) return [aces.sort((a, b) => power(a) - power(b))[0]];
      }
      const tong = state.trickNumber <= 3 ? RULES.tongGroups(hand) : [];
      if (tong.length && !(state.level === 14 && player === state.dealer)) return tong.at(-1);
      const eligible = keepAceForLastTrick(hand, hand, player);
      // 闲家主动找分；庄家先用强牌建立跑分控制，避免无保护地送分。
      if (defending) {
        const scoringTrump = eligible.filter(card => isTrump(card) && points(card) > 0);
        if (scoringTrump.length) return [scoringTrump.sort((a, b) => power(b) - power(a))[0]];
      }
      const safe = eligible.filter(card => points(card) === 0).sort((a, b) => power(b) - power(a));
      return [safe[0] || [...eligible].sort((a, b) => power(b) - power(a))[0]];
    }

    if (state.trick[0].type === 'tong') {
      const ownTong = RULES.tongGroups(hand);
      if (ownTong.length) {
        const current = currentWinningCard();
        const winningRank = current.type === 'tong' ? RULES.rankValue(current.card.rank) : 0;
        return ownTong.find(group => RULES.rankValue(group[0].rank) > winningRank) || ownTong[0];
      }
      return strongestTongFallback(hand);
    }

    const required = state.trick[0].cards.length;
    const leadCat = category(state.trick[0].cards[0]);
    if (required > 1) return RULES.chooseMultiFollow(hand, state.trick, player, state.level, state.trumpSuit);
    const matching = hand.filter(card => category(card) === leadCat).sort((a, b) => power(a) - power(b));
    const current = currentWinningCard();
    const partnerWinning = teamOf(current.player) === teamOf(player);
    const legal = keepAceForLastTrick(matching.length ? matching : hand, hand, player);
    const winners = legal.filter(card => beats(card, current.card, leadCat));
    if (partnerWinning) {
      const losers = legal.filter(card => !beats(card, current.card, leadCat));
      const safeToFeed = state.trick.length === 3;
      return [losers.length ? (safeToFeed ? mostPoints(losers) : leastCost(losers)) : leastCost(legal)];
    }
    if (winners.length) {
      // 能抢到分墩时只用够赢的牌；抢不到就不主动送分。
      return [winners.sort((a, b) => power(a) - power(b) || points(b) - points(a))[0]];
    }
    return [leastCost(legal)];
  }

  function beats(challenger, incumbent, leadCat) {
    const cTrump = isTrump(challenger), iTrump = isTrump(incumbent);
    if (cTrump !== iTrump) return cTrump && leadCat !== 'trump';
    const cEligible = category(challenger) === leadCat || (leadCat !== 'trump' && cTrump);
    const iEligible = category(incumbent) === leadCat || (leadCat !== 'trump' && iTrump);
    if (cEligible !== iEligible) return cEligible;
    if (!cEligible) return false;
    return power(challenger) > power(incumbent);
  }

  function currentWinningCard() {
    if (state.trick[0].type === 'tong') {
      const best = RULES.winningTongPlay(state.trick);
      return { player: best.player, card: best.cards[0], type: 'tong' };
    }
    const winner = RULES.winningNormalPlay(state.trick, state.level, state.trumpSuit);
    return { player: winner.player, card: winner.cards[0], type: 'normal' };
  }

  function resolveTrick() {
    if (!state || state.trick.length !== 4) return;
    const winner = currentWinningCard().player;
    const trickPoints = state.trick.flatMap(play => play.cards).reduce((sum, card) => sum + points(card), 0);
    if (teamOf(winner) !== teamOf(state.dealer)) state.defenderPoints += trickPoints;
    state.lastWinner = winner;
    state.leader = winner;
    state.current = winner;
    toast(teamOf(winner) === teamOf(state.dealer)
      ? `${NAMES[winner]}跑出此墩${trickPoints ? ` · 跑掉 ${trickPoints} 分` : ''}`
      : `${NAMES[winner]}抓下此墩${trickPoints ? ` · ${trickPoints} 分` : ''}`);
    sound(teamOf(winner) === 0 ? 'winTrick' : 'loseTrick');
    renderAll();
    const finished = state.hands.every(hand => hand.length === 0);
    if (finished && state.level === 14) {
      state.lastTrickAce = state.trick.some(play => play.player === state.dealer && play.cards.some(card => card.rank === 'A'));
    }
    state.playedCards.push(...state.trick.flatMap(play => play.cards));
    const token = state.token;
    setTimeout(() => {
      if (!state || state.token !== token) return;
      if (finished) finishRound();
      else {
        state.trick = [];
        state.trickNumber++;
        state.locked = false;
        clearTable();
        runTurn();
      }
    }, 850);
  }

  function finishRound() {
    const bottomPoints = state.bottom.reduce((sum, card) => sum + points(card), 0) * 2;
    if (teamOf(state.lastWinner) !== teamOf(state.dealer)) state.defenderPoints += bottomPoints;
    const dealerTeam = teamOf(state.dealer);
    const previousLevels = [...match.levels];
    const outcome = RULES.resolveRound(previousLevels, state.dealer, state.defenderPoints, {
      firstTrickAce: state.firstTrickAce,
      lastTrickAce: state.lastTrickAce
    });
    const defendersWon = outcome.changedDealerSide;
    const homeWon = outcome.winningTeam === 0;
    if (homeWon) record.wins++; else record.losses++;
    storage.set('shuaiErRecordV2', record);
    nextDealer = outcome.nextDealer;
    match = { levels: outcome.levels, nextDealer, champion: outcome.champion, rounds: match.rounds + 1 };
    storage.set('shuaiErMatchV2', match);
    state.phase = 'ended';
    state.locked = true;
    renderAll();
    const dealerSide = dealerTeam === 0 ? '我方' : '对方';
    const winningSide = TEAM_NAMES[outcome.winningTeam];
    el('result-icon').textContent = homeWon ? '胜' : '负';
    el('result-round-info').textContent = `第 ${match.rounds} 局结算 · ${NAMES[state.dealer]}坐庄 · ${state.trumpSuit ? suitInfo(state.trumpSuit).name : '无花色'} ${state.levelRank}`;
    el('result-title').textContent = outcome.champion !== null
      ? `${TEAM_NAMES[outcome.champion]}戴帽成功，赢得整场！`
      : state.level === 14 && outcome.aceRetry ? '戴帽未成，继续打 A'
        : state.level === 14 && defendersWon ? '戴帽未成，庄家失守'
          : homeWon ? (dealerTeam === 0 && !defendersWon ? '守庄成功' : '夺庄成功')
            : (dealerTeam === 1 && !defendersWon ? '对方守庄' : '对方夺庄');
    const scoreNote = state.level === 14
      ? outcome.champion !== null ? `庄家首墩、末墩都出 A，闲家只抓 ${state.defenderPoints} 分：戴帽成功。`
        : outcome.aceRetry ? `闲家抓 ${state.defenderPoints} 分，庄家仍守庄；首末墩出 A 条件未齐，下一局继续打 A。`
          : `闲家抓 ${state.defenderPoints} 分，达到 45 分，庄家失守。`
      : defendersWon
      ? `闲家抓得 ${state.defenderPoints} 分，夺庄成功；${outcome.steps ? `升 ${outcome.steps} 级` : '本局不升级'}。`
      : `${dealerSide}守庄成功，跑掉 ${outcome.escapedPoints} 分；升 ${outcome.steps} 级。`;
    const bottomNote = '六张底牌均非分牌，已全局明示；抠底不加分。';
    el('result-summary').textContent = scoreNote;
    el('result-defender').textContent = state.defenderPoints;
    el('result-escaped').textContent = outcome.escapedPoints;
    el('result-upgrade').textContent = outcome.champion !== null ? '戴帽获胜' : outcome.aceRetry ? '继续打 A' : outcome.steps ? `${winningSide} +${outcome.steps}` : '不升级';
    el('result-bottom').textContent = bottomNote;
    el('result-ace').hidden = state.level !== 14;
    if (state.level === 14) el('result-ace').textContent = `戴帽条件：首墩庄家出 A ${state.firstTrickAce ? '✓' : '✗'} · 末墩庄家出 A ${state.lastTrickAce ? '✓' : '✗'} · 闲家不足 45 分 ${state.defenderPoints < 45 ? '✓' : '✗'}`;
    el('result-levels').textContent = `我方 ${RULES.levelRank(previousLevels[0])} → ${RULES.levelRank(match.levels[0])} · 对方 ${RULES.levelRank(previousLevels[1])} → ${RULES.levelRank(match.levels[1])}`;
    el('result-next-dealer').textContent = outcome.champion !== null ? '整场已结束' : `${NAMES[nextDealer]}（${TEAM_NAMES[teamOf(nextDealer)]}）`;
    el('match-record').textContent = `${record.wins}胜 ${record.losses}负`;
    el('again-button').textContent = outcome.champion !== null ? '重新开赛' : outcome.aceRetry ? '继续打 A' : '下一局';
    sound(homeWon ? 'roundWin' : 'roundLose');
    const token = state.token;
    setTimeout(() => { if (state?.token === token) el('result-dialog').showModal(); }, 350);
  }

  function resetMatch() {
    match = { levels: [2, 2], nextDealer: 0, champion: null, rounds: 0 };
    nextDealer = 0;
    storage.set('shuaiErMatchV2', match);
  }

  function hint() {
    if (!state || state.current !== 0 || state.phase !== 'playing' || state.locked || state.trick.length === 4) return;
    selected.clear();
    const cards = chooseAIPlay(0);
    cards.forEach(card => selected.add(card.id));
    renderHand();
    updateButtons();
    toast(RULES.isTong(cards) ? '建议出“同”' : cards.length > 1 ? '已选出建议跟牌' : `建议出 ${cardLabel(cards[0])}`);
  }

  function setStatus(text) { el('status-text').textContent = text; }

  function toast(message) {
    clearTimeout(toastTimer);
    el('toast').textContent = message;
    el('toast').classList.add('show');
    toastTimer = setTimeout(() => el('toast').classList.remove('show'), 1800);
  }

  function sound(type) {
    if (!soundOn) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const frequencies = { shuffle: 160, trump: 520, play: 250, throw: 180, winTrick: 420, loseTrick: 210, roundWin: 620, roundLose: 160 };
      osc.frequency.value = frequencies[type] || 240;
      osc.type = type.includes('Win') || type === 'trump' ? 'sine' : 'triangle';
      gain.gain.setValueAtTime(.045, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + .13);
      osc.onended = () => ctx.close();
    } catch (_) { /* 静音环境不影响游戏 */ }
  }

  el('start-button').addEventListener('click', beginRound);
  el('new-game-button').addEventListener('click', () => { resetMatch(); beginRound(); });
  el('again-button').addEventListener('click', beginRound);
  el('bury-button').addEventListener('click', burySelected);
  el('play-button').addEventListener('click', playSelected);
  el('hint-button').addEventListener('click', hint);
  el('rules-button').addEventListener('click', () => el('rules-dialog').showModal());
  el('sound-button').addEventListener('click', () => {
    soundOn = !soundOn;
    el('sound-button').classList.toggle('is-on', soundOn);
    toast(soundOn ? '音效已开启' : '音效已关闭');
    if (soundOn) sound('play');
  });
})();
