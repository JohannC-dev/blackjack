import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";
const game = (process.argv[2] ?? "blackjack") as "blackjack" | "poker";
const socket = io("http://localhost:3000", { transports: ["websocket"] });
let me = "";
let state: any = null;
let poker: any = null;
socket.on("state", (s) => (state = s));
socket.on("poker:state", (s) => (poker = s));
socket.on("emote", (e) => console.log("received", e.emote, e.fromName, "->", e.targetId?.slice(0, 6)));
socket.on("connect", () => {
  socket.emit("join", { profile: { token: randomUUID(), name: "Bot Jojo", balance: 5000 }, tableId: "MINUIT" }, (ack: any) => {
    me = ack.playerId;
    console.log("joined", ack);
    if (game === "blackjack") socket.emit("blackjack:join", (a: any) => console.log("bj", a));
    else socket.emit("poker:command", { type: "match", mode: "cash", stake: 20 }, (a: any) => console.log("poker", a));
  });
});
const list = ["snowball", "tomato", "fuck", "kiss", "lol", "egg", "rose", "clown"];
let i = 0;
setInterval(() => {
  const ids: string[] = game === "blackjack"
    ? (state?.seats ?? []).map((s: any) => s.playerId).filter(Boolean)
    : (poker?.table?.seats ?? []).map((s: any) => s.id);
  const target = ids.find((id) => id !== me);
  const emote = list[i++ % list.length];
  socket.emit("emote", { game, emote, targetId: target });
  console.log("sent", emote, "->", target?.slice(0, 6));
}, 2500);
setTimeout(() => process.exit(0), Number(process.argv[3] ?? 60) * 1000);
