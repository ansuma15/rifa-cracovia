import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

// La premisa se fija aquí y no depende de si existe un .env.local en la máquina:
// sin cliente de Supabase, la app debe decirlo y NO inventar estados.
vi.mock("./lib/supabase", () => ({ supabase: null, isConfigured: false }));
describe("App sin Supabase configurado", () => {
  it("muestra el tablero en preparación, con 100 butacas sin estado", () => {
    render(<App />);
    expect(screen.getByText("Tablero en preparación")).toBeInTheDocument();

    const grid = screen.getByRole("grid", { name: /tablero de números/i });
    const seats = within(grid).getAllByRole("button");
    expect(seats).toHaveLength(100);
    expect(seats[0]).toHaveTextContent("00");
    expect(seats[99]).toHaveTextContent("99");
    // Ninguna butaca afirma estar disponible, reservada u ocupada.
    for (const s of seats) expect(s).toHaveAccessibleName(/sin datos$/);
  });

  it("presenta los dos premios como un solo paquete", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /un solo premio/i })).toBeInTheDocument();
    expect(screen.getByText("Televisión Samsung de 75 pulgadas")).toBeInTheDocument();
    expect(screen.getByText("Equipo de sonido Samsung con subwoofer")).toBeInTheDocument();
  });

  it("solo una butaca es alcanzable con Tab (navegación con flechas)", () => {
    render(<App />);
    const seats = within(screen.getByRole("grid")).getAllByRole("button");
    expect(seats.filter((s) => s.tabIndex === 0)).toHaveLength(1);
  });
});
