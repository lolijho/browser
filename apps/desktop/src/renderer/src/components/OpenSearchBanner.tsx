import { useShellStore } from "../store";

/** Proposta OpenSearch: mai installazione automatica, sempre conferma esplicita. */
export function OpenSearchBanner() {
  const proposal = useShellStore((s) => s.openSearchProposal);
  const setProposal = useShellStore((s) => s.setOpenSearchProposal);

  if (!proposal) {
    return null;
  }

  const decide = (accept: boolean) => {
    void window.businessbox.decideOpenSearch(proposal.proposalId, accept);
    setProposal(null);
  };

  return (
    <div className="absolute top-2 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2 shadow-lg">
      <span className="text-sm text-zinc-700">
        Questo sito offre un motore di ricerca: <strong>{proposal.name}</strong>{" "}
        <span className="text-xs text-zinc-400">(keyword: {proposal.keyword})</span>
      </span>
      <button
        type="button"
        className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
        onClick={() => decide(true)}
      >
        Aggiungi
      </button>
      <button
        type="button"
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
        onClick={() => decide(false)}
      >
        Ignora
      </button>
    </div>
  );
}
