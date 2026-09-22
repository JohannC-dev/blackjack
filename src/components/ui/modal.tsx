"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motionDuration } from "./motion";

export function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
      ref.current?.close();
    };
  }, []);

  const requestClose = () => {
    if (!onClose || closing || closeTimer.current !== null) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(
      () => {
        closeTimer.current = null;
        onClose();
      },
      motionDuration(250, 160),
    );
  };

  return (
    <dialog
      ref={ref}
      className={"modal " + className + " " + (closing ? "is-closing" : "")}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current && onClose) {
          const r = ref.current.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            requestClose();
        }
      }}
    >
      {onClose && (
        <button
          className="icon-button modal-close"
          onClick={requestClose}
          aria-label="Fermer"
        >
          <X size={19} />
        </button>
      )}
      {children}
    </dialog>
  );
}
