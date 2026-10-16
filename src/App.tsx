import { useState } from "react";
import { BoardSection } from "./features/board/BoardSection";
import { useBoard } from "./features/board/useBoard";
import { ClaimDialog } from "./features/claim/ClaimDialog";
import { ShareBar } from "./features/share/ShareBar";
import type { NumberId } from "./lib/types";
import { usePublicConfig } from "./lib/usePublicConfig";
import { Footer } from "./sections/Footer";
import { Header } from "./sections/Header";
import { Hero } from "./sections/Hero";
import { Prize } from "./sections/Prize";
import { Purpose } from "./sections/Purpose";
import { Rules } from "./sections/Rules";

export function App() {
  // Un solo useBoard para toda la página: el encabezado, el boleto del hero y
  // el tablero muestran exactamente los mismos datos.
  const boardState = useBoard();
  const config = usePublicConfig();
  const [selected, setSelected] = useState<NumberId | null>(null);

  const selectedNumber = selected && boardState.board ? boardState.board.get(selected) ?? null : null;

  return (
    <>
      <Header />
      <main>
        <Hero boardState={boardState} config={config} />
        <Prize />
        <Purpose />
        <BoardSection boardState={boardState} selected={selected} onSelect={setSelected} />
        <Rules config={config} />
        <ShareBar />
      </main>
      <Footer />
      <ClaimDialog
        number={selectedNumber}
        config={config}
        onClose={() => setSelected(null)}
        onSettled={() => void boardState.refresh()}
      />
    </>
  );
}
