"use client";
import { useEffect, useState } from "react";

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

/** Roue animée. Le résultat est décidé par le serveur ; l'animation s'arrête sur le lot reçu. */
export function Wheel({ labels, targetIndex, onDone }: { labels: string[]; targetIndex: number | null; onDone?: () => void }) {
  const [rotation, setRotation] = useState(0);
  const n = labels.length;
  const seg = 360 / n;

  useEffect(() => {
    if (targetIndex === null) return;
    // Le pointeur est en haut : on amène le milieu du segment cible sous le pointeur
    const target = 360 * 6 + (360 - (targetIndex * seg + seg / 2));
    setRotation(target);
    const t = setTimeout(() => onDone?.(), 4200);
    return () => clearTimeout(t);
  }, [targetIndex, seg, onDone]);

  const r = 150;
  const arc = (i: number) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    const large = seg > 180 ? 1 : 0;
    return `M 160 160 L ${160 + r * Math.cos(a0)} ${160 + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${160 + r * Math.cos(a1)} ${160 + r * Math.sin(a1)} Z`;
  };

  return (
    <div className="relative mx-auto h-80 w-80">
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 text-4xl drop-shadow">▼</div>
      <svg viewBox="0 0 320 320" className="h-full w-full" style={{ transform: `rotate(${rotation}deg)`, transition: "transform 4s cubic-bezier(0.17, 0.67, 0.2, 1)" }}>
        {labels.map((label, i) => {
          const mid = (i + 0.5) * seg - 90;
          const tx = 160 + 95 * Math.cos((mid * Math.PI) / 180);
          const ty = 160 + 95 * Math.sin((mid * Math.PI) / 180);
          return (
            <g key={i}>
              <path d={arc(i)} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth="3" />
              <text x={tx} y={ty} fill="#fff" fontSize="16" fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${mid + 90} ${tx} ${ty})`}>
                {label.length > 12 ? `${label.slice(0, 11)}…` : label}
              </text>
            </g>
          );
        })}
        <circle cx="160" cy="160" r="22" fill="#fff" />
      </svg>
    </div>
  );
}
