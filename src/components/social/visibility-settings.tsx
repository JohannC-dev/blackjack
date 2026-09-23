"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { socialApi } from "@/lib/social-api";
import {
  AUDIENCES,
  AUDIENCE_LABELS,
  type Audience,
  type ProfileVisibility,
} from "@/lib/social";
import { cn } from "@/lib/utils";

/**
 * A segmented radio group. Native inputs, so arrow keys, labels and the
 * focus ring all come for free.
 */
function AudienceChoice({
  legend,
  hint,
  value,
  disabled,
  onChange,
}: {
  legend: string;
  hint: string;
  value: Audience;
  disabled: boolean;
  onChange: (next: Audience) => void;
}) {
  const name = useId();
  const hintId = `${name}-hint`;
  return (
    <fieldset className="min-w-0" disabled={disabled} aria-describedby={hintId}>
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      <p id={hintId} className="mt-0.5 text-xs text-muted-foreground">
        {hint}
      </p>
      <div className="mt-2 flex gap-1 rounded-lg bg-white/[0.04] p-1">
        {AUDIENCES.map((audience) => (
          <label
            key={audience}
            className={cn(
              "flex-1 cursor-pointer rounded-md px-2 py-1.5 text-center text-xs font-medium transition-colors",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              audience === value
                ? "bg-minuit-purple/20 text-foreground"
                : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name={name}
              value={audience}
              checked={audience === value}
              onChange={() => onChange(audience)}
              className="sr-only"
            />
            {AUDIENCE_LABELS[audience]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The two dials of a player's own profile. Parrainage is deliberately absent:
 * filleuls and parrain are never shown to anyone else.
 */
export function VisibilitySettings({
  visibility,
}: {
  visibility: ProfileVisibility;
}) {
  const [current, setCurrent] = useState(visibility);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const save = async (next: ProfileVisibility) => {
    const previous = current;
    setCurrent(next);
    setSaving(true);
    try {
      const saved = await socialApi.setVisibility(next);
      setCurrent(saved);
      setAnnouncement(
        `Profil visible par ${AUDIENCE_LABELS[saved.profile].toLowerCase()}, gains visibles par ${AUDIENCE_LABELS[saved.earnings].toLowerCase()}.`,
      );
    } catch (failure) {
      setCurrent(previous);
      setAnnouncement("Le réglage n’a pas pu être enregistré.");
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Le réglage n’a pas pu être enregistré.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="visibility-heading">
      <div>
        <h3 id="visibility-heading" className="text-sm font-semibold">
          Confidentialité
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Votre parrainage reste privé quoi qu’il arrive : personne d’autre ne
          voit votre parrain ni vos filleuls.
        </p>
      </div>
      <AudienceChoice
        legend="Mon profil"
        hint="Qui peut ouvrir votre profil et voir vos statistiques de jeu."
        value={current.profile}
        disabled={saving}
        onChange={(profile) => void save({ ...current, profile })}
      />
      <AudienceChoice
        legend="Mes gains"
        hint="Résultat net, total misé et pire perte."
        value={current.earnings}
        disabled={saving || current.profile === "private"}
        onChange={(earnings) => void save({ ...current, earnings })}
      />
      {current.profile === "private" && (
        <p className="text-xs text-muted-foreground">
          Profil privé : vos gains sont masqués pour tout le monde.
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
