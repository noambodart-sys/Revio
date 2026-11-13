import Link from "next/link";
import { PRODUCT_NAME } from "@/config/product";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 p-6">
      <h1 className="text-4xl font-bold">{PRODUCT_NAME}</h1>
      <p className="text-slate-600">Programme de fidélité pour les commerces de proximité.</p>
      <div className="grid gap-3">
        <Link href="/kiosque" className="btn-dark py-5 text-lg">Tablette client</Link>
        <Link href="/caisse" className="btn-ghost py-5 text-lg">Caisse / vendeur</Link>
        <Link href="/admin" className="btn-ghost py-5 text-lg">Admin {PRODUCT_NAME}</Link>
      </div>
    </main>
  );
}
