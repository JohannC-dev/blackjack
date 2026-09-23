"use client";

import { useEffect, useState } from "react";
import {
  bundledVersion,
  type DeploymentVersion,
} from "@/lib/deployment-version";

export function VersionNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking || !active) return;
      checking = true;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const version: DeploymentVersion = await response.json();
        if (
          active &&
          typeof version.code === "string" &&
          typeof version.database === "string" &&
          (version.code !== bundledVersion.code ||
            version.database !== bundledVersion.database)
        )
          setUpdateAvailable(true);
      } catch {
        // A temporary network failure should not interrupt a live game.
      } finally {
        checking = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    const interval = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("deployment:check", check);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("deployment:check", check);
    };
  }, []);

  if (!updateAvailable) return null;
  return (
    <aside className="version-notice" role="status" aria-live="polite">
      <span>
        Une mise à jour est disponible. Actualisez la page pour continuer.
      </span>
      <button type="button" onClick={() => window.location.reload()}>
        Actualiser
      </button>
    </aside>
  );
}
