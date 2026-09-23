import type { SVGProps } from "react";

/** Our own little midnight road runner, shared by the game and the club poster. */
export function ChickenArt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 110 110" fill="none" aria-hidden="true" {...props}>
      <ellipse cx="54" cy="99" rx="33" ry="7" fill="#07070D" opacity=".36" />
      <path d="M28 75c-9-6-15-15-12-24 4-10 16-5 21 0" fill="#D7CEEA" />
      <path
        d="M30 60c-4-13 0-33 17-39 13-5 27 1 34 13 5 8 8 21 7 35-2 15-15 23-31 23-17 0-29-10-27-32Z"
        fill="#F8F2E9"
      />
      <path
        d="M42 63c6-6 18-8 27-2 4 7 0 16-9 20-10 3-21-5-18-18Z"
        fill="#E9DCE4"
      />
      <path
        d="M40 24c-3-7 0-12 4-12 3 0 5 4 6 8 1-8 5-12 9-11 4 1 5 6 3 11 6-5 11-3 12 1 1 5-4 8-8 10"
        fill="#F27B89"
      />
      <circle cx="70" cy="45" r="3.5" fill="#242033" />
      <path d="M81 50c13-4 20 1 16 6-4 5-11 7-17 4" fill="#F5B464" />
      <path d="M78 61c-1 10 2 15 6 13 4-3 2-9 0-13" fill="#E8707D" />
      <path
        d="M46 87v8m22-8v8m-27 0h11m11 0h11"
        stroke="#F5B464"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M29 73c-7-3-12-10-14-16"
        stroke="#BDAFD0"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChickenCarArt({
  color = "#e3a747",
  ...props
}: SVGProps<SVGSVGElement> & { color?: string }) {
  return (
    <svg viewBox="0 0 90 116" fill="none" aria-hidden="true" {...props}>
      <ellipse cx="45" cy="111" rx="33" ry="5" fill="#222225" opacity=".28" />
      <path
        d="M15 31H7v16h8m60-16h8v16h-8"
        fill="#65696b"
        stroke="#35383a"
        strokeWidth="3"
      />
      <path d="M17 7h56l5 14v67l-7 15H19l-7-15V21L17 7Z" fill="#373a3d" />
      <path d="M20 10h50l5 14v60l-6 15H21l-6-15V24l5-14Z" fill={color} />
      <path d="M24 4h42v8H24z" fill="#f1cc73" />
      <path d="M19 24h52v39H19z" fill="#2f5660" />
      <path d="M22 27h22v32H22zm25 0h21v32H47z" fill="#88bec4" />
      <path d="M22 28h21v7H22zm25 0h21v7H47z" fill="#b9d9d6" opacity=".62" />
      <path d="M18 63h54v4H18z" fill="#394149" />
      <path
        d="M24 73h42v11H24z"
        fill="#5b6668"
        stroke="#34383b"
        strokeWidth="2"
      />
      <path d="M29 76h32m-32 4h32" stroke="#a8aeaa" strokeWidth="2" />
      <path d="M18 74h8v10h-8zm46 0h8v10h-8z" fill="#ffeed1" />
      <path
        d="M19 90h52v8H19z"
        fill="#d6d9d3"
        stroke="#5d6161"
        strokeWidth="2"
      />
      <path
        d="M26 101h10m18 0h10"
        stroke="#34383b"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChickenBarrierArt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 80 48" fill="none" aria-hidden="true" {...props}>
      <ellipse cx="40" cy="43" rx="35" ry="4" fill="#232323" opacity=".26" />
      <path d="M14 26v16m52-16v16" stroke="#454442" strokeWidth="5" />
      <path d="M4 7h72v22H4z" fill="#3e4242" />
      <path d="M7 9h66v17H7z" fill="#ffe8a1" />
      <path
        d="m7 23 17-14h13L18 26H7v-3Zm27 3L54 9h13L47 26H34Zm28 0 11-10v10H62Z"
        fill="#d69236"
      />
      <path d="M4 7h72v22H4z" stroke="#4a4b48" strokeWidth="3" />
      <path
        d="M11 30h11m36 0h11"
        stroke="#f5d17b"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
