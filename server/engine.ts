import { randomInt, randomUUID } from "node:crypto";
import {
  betTotal,
  canSplitCards,
  evaluate21Plus3,
  evaluateSuperPairs,
  isRed,
  isBlackjack,
  score,
} from "../src/lib/rules";
import type {
  Card,
  Command,
  Hand,
  HistoryBet,
  HistoryGamble,
  PublicPlayer,
  Seat,
  Suit,
  TableState,
} from "../src/lib/types";

export type Player = PublicPlayer & {
  token: string;
  lastSeen: number;
  roomId: string;
};
const emptyBet = () => ({ main: 0, three: 0, pairs: 0 });
const emptySides = () => ({ three: null, pairs: null });
const BETTING_COUNTDOWN_MS = 12_000;
const ALL_READY_COUNTDOWN_MS = 3_000;
const SETTLED_COUNTDOWN_MS = 7_000;
const IDLE_SEAT_ROUNDS = 2;
export const BLACKJACK_SHUFFLE_MS = 2_200;
export function makeShoe(): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < 8; deck++)
    for (const suit of ["hearts", "diamonds", "clubs", "spades"] as Suit[]) {
      for (let rank = 1; rank <= 13; rank++)
        cards.push({ id: randomUUID(), rank, suit });
    }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export class Table {
  state: Omit<TableState, "players" | "shoeRemaining">;
  players = new Map<string, Player>();
  shoe: Card[];
  private dealQueue: (number | "dealer")[] = [];
  private nextStep = 0;
  private startRoundAfterShuffle = false;
  private turnOrder: string[] = [];
  private idleSeatRounds = new Map<number, number>();
  lastUsed = Date.now();
  constructor(
    id: string,
    private publish: () => void = () => {},
    shoe?: Card[],
  ) {
    this.shoe = shoe ?? makeShoe();
    this.state = {
      id,
      phase: "betting",
      round: 0,
      seats: Array.from({ length: 5 }, (_, index) => ({
        index,
        playerId: null,
        bet: emptyBet(),
        previousBet: null,
        hands: [],
        sides: emptySides(),
        committed: 0,
      })),
      dealer: [],
      activeHandId: null,
      deadline: null,
      history: [],
      gambles: [],
      message: "La soirée commence. Faites vos jeux.",
    };
  }
  snapshot(): TableState {
    const concealDoubleCards = this.state.phase !== "settled";
    const seats = this.state.seats.map((seat) => ({
      ...seat,
      bet: { ...seat.bet },
      previousBet: seat.previousBet ? { ...seat.previousBet } : null,
      sides: { ...seat.sides },
      hands: seat.hands.map((hand) => {
        const concealed =
          concealDoubleCards &&
          hand.doubleCardHidden &&
          hand.cards.length === 3;
        return {
          ...hand,
          // A bust must not reveal the value of a face-down double card.
          status: concealed ? ("stood" as const) : hand.status,
          cards: hand.cards.map((card, index) =>
            concealed && index === hand.cards.length - 1
              ? {
                  id: card.id,
                  rank: 0,
                  suit: "spades" as const,
                  hidden: true,
                }
              : { ...card },
          ),
        };
      }),
    }));
    return {
      ...this.state,
      seats,
      dealer: this.state.dealer.map((card) => ({ ...card })),
      history: this.state.history.map((item) => ({
        ...item,
        bets: item.bets.map((bet) => ({ ...bet })),
        ...(item.gambles
          ? {
              gambles: item.gambles.map((gamble) => ({
                ...gamble,
                card: { ...gamble.card },
              })),
            }
          : {}),
      })),
      gambles: this.state.gambles.map((gamble) => ({
        ...gamble,
        card: gamble.card ? { ...gamble.card } : null,
      })),
      players: [...this.players.values()].map(
        ({ id, name, balance, connected, ready }) => ({
          id,
          name,
          balance,
          connected,
          ready,
        }),
      ),
      shoeRemaining: this.shoe.length,
    };
  }
  private emit() {
    this.lastUsed = Date.now();
    this.publish();
  }
  private draw() {
    // A large reserve is kept at the start of each round; never reshuffle during a hand.
    const card = this.shoe.pop();
    if (!card) throw new Error("Le sabot est vide.");
    return card;
  }
  private drawGambleCard() {
    // Gamble draws use the same cards as the table, but an exhausted shoe is
    // refreshed here as well so a long winning streak can never hit a hard cap.
    if (!this.shoe.length) this.shoe = makeShoe();
    return this.draw();
  }
  private startShuffle(now = Date.now(), startRoundAfter = false) {
    this.shoe = makeShoe();
    this.state.phase = "shuffling";
    this.state.activeHandId = null;
    this.state.deadline = null;
    this.nextStep = now + BLACKJACK_SHUFFLE_MS;
    this.startRoundAfterShuffle = startRoundAfter;
    this.state.message = "Le croupier mélange le sabot…";
    this.emit();
  }
  observe(player: Player) {
    this.players.set(player.id, player);
    this.emit();
  }
  add(player: Player) {
    this.players.set(player.id, player);
    if (
      this.state.phase === "betting" &&
      !this.state.seats.some((s) => s.playerId === player.id)
    ) {
      const seat = [2, 1, 3, 0, 4]
        .map((i) => this.state.seats[i])
        .find((s) => !s.playerId);
      if (seat) {
        seat.playerId = player.id;
        seat.bet = emptyBet();
        seat.previousBet = null;
        this.idleSeatRounds.set(seat.index, 0);
      }
    }
    this.emit();
  }
  private clearSeat(seat: Seat) {
    seat.playerId = null;
    seat.bet = emptyBet();
    seat.previousBet = null;
    seat.hands = [];
    seat.sides = emptySides();
    seat.committed = 0;
    this.idleSeatRounds.delete(seat.index);
  }
  remove(playerId: string) {
    if (
      this.state.phase !== "betting" &&
      this.state.seats.some((s) => s.playerId === playerId)
    )
      throw new Error("Terminez la manche avant de changer de table.");
    for (const seat of this.state.seats)
      if (seat.playerId === playerId) this.clearSeat(seat);
    this.state.gambles = this.state.gambles.filter(
      (entry) => entry.playerId !== playerId,
    );
    this.players.delete(playerId);
    this.updateCountdown(true);
    this.emit();
  }
  command(playerId: string, command: Command) {
    const player = this.players.get(playerId);
    if (!player) throw new Error("Rejoignez une table pour jouer.");
    if (!command || typeof command !== "object")
      throw new Error("Action invalide.");
    if (
      this.state.phase === "shuffling" &&
      (command.type === "gamble" || command.type === "cashout")
    )
      throw new Error("Le sabot est en cours de mélange.");
    if (command.type === "gamble" || command.type === "cashout") {
      const gamble = this.state.gambles.find(
        (entry) => entry.playerId === playerId && entry.status === "available",
      );
      if (!gamble) throw new Error("Aucun gain disponible à tenter.");
      if (command.type === "cashout") {
        gamble.status = "cashed";
      } else {
        if (command.color !== "red" && command.color !== "black")
          throw new Error("Choisissez rouge ou noir.");
        if (player.balance < gamble.stake)
          throw new Error(
            "Ces gains ont déjà été engagés dans la partie. Encaissez cette option.",
          );
        const stake = gamble.stake;
        const card = this.drawGambleCard();
        const won = (isRed(card) ? "red" : "black") === command.color;
        const history = this.state.history.find(
          (item) => item.round === gamble.round && item.playerId === playerId,
        );
        if (!history)
          throw new Error("Le résultat de la manche est introuvable.");
        const historyGamble: HistoryGamble = {
          stake,
          choice: command.color,
          card: { ...card },
          result: won ? "win" : "lose",
          net: won ? stake : -stake,
        };
        history.gambles = [...(history.gambles ?? []), historyGamble];
        history.net += historyGamble.net;
        gamble.choice = command.color;
        gamble.card = card;
        gamble.result = won ? "win" : "lose";
        if (won) {
          player.balance += stake;
          gamble.stake *= 2;
          gamble.streak += 1;
        } else {
          player.balance -= stake;
          gamble.status = "lost";
        }
      }
    } else if (
      ["claim", "release", "bet", "repeat", "ready", "refill"].includes(
        command.type,
      )
    ) {
      if (this.state.phase !== "betting")
        throw new Error("Attendez la prochaine manche.");
      if (command.type === "refill") {
        if (player.balance >= 5)
          throw new Error("La recharge est disponible sous 5 crédits.");
        player.balance = 2000;
      } else if (command.type === "ready") {
        if (typeof command.ready !== "boolean")
          throw new Error("Action invalide.");
        const own = this.state.seats.filter((s) => s.playerId === playerId);
        const total = own.reduce((sum, s) => sum + betTotal(s.bet), 0);
        if (
          command.ready &&
          (!own.some((s) => s.bet.main >= 5) || total > player.balance)
        )
          throw new Error("Vérifiez vos mises et votre solde.");
        player.ready = command.ready;
      } else if (command.type === "repeat") {
        const own = this.state.seats.filter(
          (seat) => seat.playerId === playerId && seat.previousBet,
        );
        const total = own.reduce(
          (sum, seat) => sum + betTotal(seat.previousBet!),
          0,
        );
        if (!total) throw new Error("Aucune mise précédente à répéter.");
        if (total > player.balance)
          throw new Error("Vous n’avez pas assez de crédits.");
        for (const seat of own) seat.bet = { ...seat.previousBet! };
        player.ready = false;
      } else if (
        command.type === "claim" ||
        command.type === "release" ||
        command.type === "bet"
      ) {
        const seat = Number.isInteger(command.seat)
          ? this.state.seats[command.seat]
          : undefined;
        if (!seat) throw new Error("Cette place n’existe pas.");
        if (command.type === "claim") {
          if (seat.playerId) throw new Error("Cette place est déjà occupée.");
          seat.playerId = playerId;
          seat.bet = emptyBet();
          seat.previousBet = null;
          this.idleSeatRounds.set(seat.index, 0);
        } else {
          if (seat.playerId !== playerId)
            throw new Error("Cette place ne vous appartient pas.");
          if (command.type === "release") {
            // A released seat must not retain any round-local presentation or
            // accounting state. In normal play these fields are empty during
            // betting, but clearing them here keeps release idempotent and
            // prevents stale chips/results if a table is recovered mid-cycle.
            this.clearSeat(seat);
          } else {
            const b = command.bet;
            if (
              !b ||
              ![b.main, b.three, b.pairs].every(
                (v) => Number.isInteger(v) && v >= 0 && v % 5 === 0,
              ) ||
              b.main > 500 ||
              b.three > 100 ||
              b.pairs > 100 ||
              (b.main === 0 && (b.three > 0 || b.pairs > 0))
            )
              throw new Error(
                "Mises par pas de 5 : blackjack 5–500, bonus 0–100.",
              );
            const reserved = this.state.seats
              .filter((s) => s.playerId === playerId && s !== seat)
              .reduce((sum, s) => sum + betTotal(s.bet), 0);
            if (reserved + betTotal(b) > player.balance)
              throw new Error("Vous n’avez pas assez de crédits.");
            seat.bet = { main: b.main, three: b.three, pairs: b.pairs };
          }
        }
        player.ready = false;
      }
      this.updateCountdown(true);
    } else if (
      ["hit", "stand", "double", "split"].includes(command.type) &&
      "handId" in command
    ) {
      if (
        this.state.phase !== "playing" ||
        this.state.activeHandId !== command.handId
      )
        throw new Error("Ce n’est pas le tour de cette main.");
      const seat = this.state.seats.find((s) =>
        s.hands.some((h) => h.id === command.handId),
      );
      if (!seat || seat.playerId !== playerId)
        throw new Error("Cette main ne vous appartient pas.");
      const hand = seat.hands.find((h) => h.id === command.handId)!;
      if (command.type === "stand") hand.status = "stood";
      if (command.type === "hit") {
        hand.cards.push(this.draw());
        this.updateHand(hand);
      }
      if (command.type === "double") {
        const reveal = command.reveal ?? "now";
        if (reveal !== "now" && reveal !== "dealer")
          throw new Error("Mode de révélation invalide.");
        if (
          hand.cards.length !== 2 ||
          hand.splitAces ||
          player.balance < hand.bet
        )
          throw new Error("Impossible de doubler cette main.");
        player.balance -= hand.bet;
        seat.committed += hand.bet;
        hand.bet *= 2;
        hand.cards.push(this.draw());
        hand.doubleCardHidden = reveal === "dealer";
        hand.status = score(hand.cards).total > 21 ? "bust" : "stood";
      }
      if (command.type === "split") {
        if (
          hand.cards.length !== 2 ||
          !canSplitCards(hand.cards) ||
          hand.splitAces ||
          seat.hands.length >= 4 ||
          player.balance < hand.bet
        )
          throw new Error("Impossible de séparer cette main.");
        player.balance -= hand.bet;
        seat.committed += hand.bet;
        const card = hand.cards.pop()!;
        hand.split = true;
        hand.splitAces = card.rank === 1;
        hand.cards.push(this.draw());
        const next: Hand = {
          id: randomUUID(),
          cards: [card, this.draw()],
          bet: hand.bet,
          split: true,
          splitAces: hand.splitAces,
          status: "playing",
        };
        this.updateHand(hand);
        this.updateHand(next);
        if (hand.splitAces) {
          hand.status = "stood";
          next.status = "stood";
        }
        seat.hands.splice(seat.hands.indexOf(hand) + 1, 0, next);
        this.turnOrder.splice(this.turnOrder.indexOf(hand.id) + 1, 0, next.id);
      }
      if (hand.status !== "playing") this.advance();
      else this.state.deadline = Date.now() + 25000;
    } else throw new Error("Action inconnue.");
    this.emit();
  }
  private updateHand(hand: Hand) {
    const total = score(hand.cards).total;
    hand.status =
      total > 21
        ? "bust"
        : !hand.split && isBlackjack(hand.cards)
          ? "blackjack"
          : total === 21
            ? "stood"
            : "playing";
  }
  private updateCountdown(reset = false) {
    if (this.state.phase !== "betting") return;
    const seated = [...this.players.values()].filter(
      (p) =>
        p.connected &&
        this.state.seats.some((s) => s.playerId === p.id && s.bet.main > 0),
    );
    const ready = seated.filter((p) => p.ready);
    if (!ready.length) this.state.deadline = null;
    else if (seated.every((p) => p.ready))
      this.state.deadline = Math.min(
        reset ? Infinity : (this.state.deadline ?? Infinity),
        Date.now() + ALL_READY_COUNTDOWN_MS,
      );
    else if (reset || this.state.deadline === null)
      this.state.deadline = Date.now() + BETTING_COUNTDOWN_MS;
  }
  private expireIdleSeats(dealtSeatIndexes: Set<number>) {
    const releasedPlayerIds = new Set<string>();
    for (const seat of this.state.seats) {
      if (!seat.playerId) {
        this.idleSeatRounds.delete(seat.index);
        continue;
      }
      if (dealtSeatIndexes.has(seat.index)) {
        this.idleSeatRounds.set(seat.index, 0);
        continue;
      }
      const idleRounds = (this.idleSeatRounds.get(seat.index) ?? 0) + 1;
      if (idleRounds >= IDLE_SEAT_ROUNDS) {
        releasedPlayerIds.add(seat.playerId);
        this.clearSeat(seat);
      } else this.idleSeatRounds.set(seat.index, idleRounds);
    }
    // `ready` belongs to the player rather than the seat. If an automatic
    // release removed the player's last seat, do not leave a stale readiness
    // flag in the table snapshot.
    for (const playerId of releasedPlayerIds)
      if (!this.state.seats.some((seat) => seat.playerId === playerId))
        this.players.get(playerId)!.ready = false;
  }
  startRound() {
    if (this.state.phase !== "betting") return;
    // Bets are only reserved until the deal, and the wallet is shared with
    // Poker and the Tower: a player who spent it elsewhere since confirming
    // sits this round out instead of going negative.
    const reserved = new Map<string, number>();
    for (const seat of this.state.seats)
      if (seat.playerId)
        reserved.set(
          seat.playerId,
          (reserved.get(seat.playerId) ?? 0) + betTotal(seat.bet),
        );
    for (const [playerId, total] of reserved) {
      const player = this.players.get(playerId);
      if (player?.ready && total > player.balance) player.ready = false;
    }
    const seats = this.state.seats.filter(
      (s) =>
        s.playerId &&
        this.players.get(s.playerId)?.ready &&
        this.players.get(s.playerId)?.connected &&
        s.bet.main > 0,
    );
    if (!seats.length) {
      this.state.deadline = null;
      this.emit();
      return;
    }
    if (this.shoe.length < 160) {
      this.startShuffle(Date.now(), true);
      return;
    }
    this.expireIdleSeats(new Set(seats.map((seat) => seat.index)));
    this.state.gambles = this.state.gambles.filter(
      (entry) => entry.status === "available",
    );
    // Bets are only reserved when a round starts. Clear the bets belonging to
    // players who did not confirm in time so their unplayed chips do not
    // remain displayed on the table while the round is in progress.
    const dealtSeatIndexes = new Set(seats.map((seat) => seat.index));
    for (const seat of this.state.seats)
      if (!dealtSeatIndexes.has(seat.index)) seat.bet = emptyBet();
    this.state.round++;
    this.state.phase = "dealing";
    this.state.deadline = null;
    this.state.dealer = [];
    this.state.message = "Les jeux sont faits.";
    for (const seat of seats) {
      const player = this.players.get(seat.playerId!)!;
      seat.previousBet = { ...seat.bet };
      seat.committed = betTotal(seat.bet);
      player.balance -= seat.committed;
      seat.hands = [
        {
          id: randomUUID(),
          cards: [],
          bet: seat.bet.main,
          status: "playing",
          split: false,
          splitAces: false,
        },
      ];
    }
    this.dealQueue = [
      ...seats.map((s) => s.index),
      "dealer",
      ...seats.map((s) => s.index),
    ];
    this.nextStep = Date.now() + 350;
    this.emit();
  }
  private finishDeal() {
    this.turnOrder = [];
    let hasSideBets = false;
    for (const seat of this.state.seats) {
      if (!seat.hands.length) continue;
      const hand = seat.hands[0];
      const cards = [...hand.cards, this.state.dealer[0]];
      seat.sides = {
        three: evaluate21Plus3(cards, seat.bet.three),
        pairs: evaluateSuperPairs(cards, seat.bet.pairs),
      };
      this.players.get(seat.playerId!)!.balance +=
        (seat.sides.three?.payout ?? 0) + (seat.sides.pairs?.payout ?? 0);
      hasSideBets ||= seat.bet.three > 0 || seat.bet.pairs > 0;
      this.updateHand(hand);
      this.turnOrder.push(hand.id);
    }
    if (hasSideBets) {
      this.state.phase = "bonuses";
      this.state.message =
        "Les paris annexes sont réglés. Les gains sont versés.";
      this.nextStep = Date.now() + 3200;
    } else this.advance();
  }
  private advance() {
    const hands = this.state.seats.flatMap((s) => s.hands);
    const next = this.turnOrder
      .map((id) => hands.find((h) => h.id === id)!)
      .find((h) => h.status === "playing");
    this.state.activeHandId = next?.id ?? null;
    if (next) {
      this.state.phase = "playing";
      this.state.deadline = Date.now() + 25000;
      const owner = this.state.seats.find((s) => s.hands.includes(next))!;
      this.state.message = `À ${this.players.get(owner.playerId!)!.name} de jouer.`;
    } else {
      this.state.phase = "dealer";
      this.state.deadline = null;
      this.nextStep = Date.now() + 850;
      this.state.message = "Le croupier joue sa main.";
    }
  }
  private settle() {
    const dealerTotal = score(this.state.dealer).total;
    const dealerBJ = isBlackjack(this.state.dealer);
    const nets = new Map<string, number>();
    const historyBets = new Map<string, HistoryBet[]>();
    for (const seat of this.state.seats) {
      if (!seat.hands.length) continue;
      const bets = historyBets.get(seat.playerId!) ?? [];
      const seatBetsStart = bets.length;
      let mainPayout = 0;
      for (const hand of seat.hands) {
        const total = score(hand.cards).total;
        if (hand.status === "bust") {
          hand.result = "lose";
          hand.payout = 0;
        } else if (dealerBJ) {
          hand.result = hand.status === "blackjack" ? "push" : "lose";
          hand.payout = hand.result === "push" ? hand.bet : 0;
        } else if (hand.status === "blackjack") {
          hand.result = "blackjack";
          hand.payout = hand.bet * 2.5;
        } else if (dealerTotal > 21 || total > dealerTotal) {
          hand.result = "win";
          hand.payout = hand.bet * 2;
        } else if (total === dealerTotal) {
          hand.result = "push";
          hand.payout = hand.bet;
        } else {
          hand.result = "lose";
          hand.payout = 0;
        }
        const payout = hand.payout ?? 0;
        mainPayout += payout;
        bets.push({
          type: "main",
          seat: seat.index,
          bet: hand.bet,
          payout,
          net: payout - hand.bet,
          result: hand.result,
        });
      }
      for (const [type, side] of [
        ["three", seat.sides.three] as const,
        ["pairs", seat.sides.pairs] as const,
      ]) {
        const bet = seat.bet[type];
        const payout = side?.payout ?? 0;
        bets.push({
          type,
          seat: seat.index,
          bet,
          payout,
          net: payout - bet,
          result: bet === 0 ? "none" : side ? "win" : "lose",
          ...(side?.label ? { label: side.label } : {}),
        });
      }
      historyBets.set(seat.playerId!, bets);
      this.players.get(seat.playerId!)!.balance += mainPayout;
      nets.set(
        seat.playerId!,
        (nets.get(seat.playerId!) ?? 0) +
          bets.slice(seatBetsStart).reduce((sum, bet) => sum + bet.net, 0),
      );
    }
    for (const [playerId, net] of nets)
      this.state.history.unshift({
        round: this.state.round,
        playerId,
        net,
        timestamp: Date.now(),
        bets: historyBets.get(playerId) ?? [],
      });
    this.state.gambles = [
      ...this.state.gambles.filter((entry) => entry.status === "available"),
      ...[...nets.entries()]
        .filter(([, net]) => net > 0)
        .map(([playerId, net]) => ({
          playerId,
          round: this.state.round,
          stake: net,
          choice: null,
          card: null,
          result: null,
          status: "available" as const,
          streak: 0,
        })),
    ];
    const pendingHistory = new Set(
      this.state.gambles.map((entry) => `${entry.round}:${entry.playerId}`),
    );
    this.state.history = this.state.history.filter(
      (item, index) =>
        index < 100 || pendingHistory.has(`${item.round}:${item.playerId}`),
    );
    this.state.phase = "settled";
    this.state.deadline = Date.now() + SETTLED_COUNTDOWN_MS;
    this.state.message = dealerBJ
      ? "Blackjack du croupier."
      : dealerTotal > 21
        ? "Le croupier dépasse 21."
        : `Le croupier reste à ${dealerTotal}.`;
  }
  tick(now = Date.now()) {
    let changed = false;
    if (this.state.phase === "shuffling" && now >= this.nextStep) {
      const shouldStartRound = this.startRoundAfterShuffle;
      this.startRoundAfterShuffle = false;
      this.nextStep = 0;
      this.state.phase = "betting";
      this.state.message = "À vous de jouer. Placez vos mises.";
      if (shouldStartRound) {
        this.startRound();
        return;
      }
      changed = true;
    } else if (this.state.phase === "betting") {
      for (const player of this.players.values())
        if (!player.connected && now - player.lastSeen > 60000) {
          this.remove(player.id);
          changed = true;
        }
      this.updateCountdown();
      if (this.state.deadline && now >= this.state.deadline) {
        this.startRound();
        return;
      }
    } else if (this.state.phase === "dealing" && now >= this.nextStep) {
      const target = this.dealQueue.shift();
      if (target === "dealer") this.state.dealer.push(this.draw());
      else if (target !== undefined)
        this.state.seats[target].hands[0].cards.push(this.draw());
      if (!this.dealQueue.length) this.finishDeal();
      else this.nextStep = now + 320;
      changed = true;
    } else if (this.state.phase === "bonuses" && now >= this.nextStep) {
      this.advance();
      changed = true;
    } else if (
      this.state.phase === "playing" &&
      this.state.deadline &&
      now >= this.state.deadline
    ) {
      const hand = this.state.seats
        .flatMap((s) => s.hands)
        .find((h) => h.id === this.state.activeHandId);
      if (hand) hand.status = "stood";
      this.advance();
      changed = true;
    } else if (this.state.phase === "dealer" && now >= this.nextStep) {
      if (this.state.dealer.length < 2 || score(this.state.dealer).total < 17)
        this.state.dealer.push(this.draw());
      else this.settle();
      this.nextStep = now + 850;
      changed = true;
    } else if (
      this.state.phase === "settled" &&
      this.state.deadline &&
      now >= this.state.deadline
    ) {
      this.state.deadline = null;
      this.state.dealer = [];
      for (const player of this.players.values()) player.ready = false;
      for (const seat of this.state.seats) {
        seat.bet = emptyBet();
        seat.hands = [];
        seat.sides = emptySides();
        seat.committed = 0;
      }
      if (this.shoe.length < 160) {
        this.startShuffle(now);
        return;
      }
      this.state.phase = "betting";
      this.state.message = "À vous de jouer. Placez vos mises.";
      changed = true;
    }
    if (changed) this.emit();
  }
}
