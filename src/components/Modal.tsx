"use client";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost px-4 py-2" onClick={onClose}>Fermer</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/** Rendu minimal du Markdown des textes juridiques (titres, gras, listes, paragraphes). */
export function LegalText({ content }: { content: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  return (
    <div className="space-y-3 text-base leading-relaxed text-slate-700">
      {content.split(/\n{2,}/).map((block, i) => {
        if (block.startsWith("# ")) return <h3 key={i} className="text-xl font-bold text-slate-900">{block.slice(2)}</h3>;
        const lines = block.split("\n");
        if (lines.every((l) => /^(- |\d+\. )/.test(l))) {
          return <ul key={i} className="list-disc space-y-1 pl-6">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^(- |\d+\. )/, ""))}</li>)}</ul>;
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l.replace(/^- /, "• "))}{j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </div>
  );
}
