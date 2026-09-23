import { Spade } from "lucide-react";
import styles from "./poker-lobby.module.css";

export function RoomArt({
  theme,
  poster = false,
}: {
  theme: string;
  poster?: boolean;
}) {
  return (
    <div
      className={`${styles.roomArt} ${styles[theme]} ${poster ? styles.posterArt : ""}`}
      aria-hidden="true"
    >
      <div className={styles.lightBeam} />
      <div className={styles.miniTable}>
        <span className={styles.tableInscription}>
          MINUIT <Spade size={12} fill="currentColor" /> CLUB
        </span>
        <span className={styles.miniCards}>
          <i>
            A<span>♠</span>
          </i>
          <i>
            K<span>♠</span>
          </i>
        </span>
        <span className={`${styles.chipPile} ${styles.pileOne}`}>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className={`${styles.chipPile} ${styles.pileTwo}`}>
          <i />
          <i />
          <i />
        </span>
        <span className={styles.miniDealer}>D</span>
      </div>
      <span className={`${styles.tableSeat} ${styles.seatOne}`} />
      <span className={`${styles.tableSeat} ${styles.seatTwo}`} />
      <span className={`${styles.tableSeat} ${styles.seatThree}`} />
    </div>
  );
}
