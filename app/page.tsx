import { Chat } from "./chat";

export default function Home() {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
        <header className="flex items-baseline justify-between gap-4 border-b border-zinc-100 px-6 py-4">
          <h1 className="text-sm font-semibold uppercase tracking-[0.2em]">
            Assistente CLT
          </h1>
          <p className="text-right text-xs text-zinc-400">
            Valores brutos · não substitui advogado ou contador
          </p>
        </header>

        <Chat />
      </div>
    </main>
  );
}
