import { describe, expect, it } from "vitest";
import {
  monthLabel,
  toMonthlyChartData,
  toRoomTypeChartData,
  toTopResoldRows,
  totalSalesOfSeries,
  weiLabel,
  weiToPol,
} from "./dashboard-data";

const ETH = 1_000_000_000_000_000_000n;

describe("dashboard-data · conversión de importes", () => {
  it("wei → POL para la geometría de la gráfica", () => {
    expect(weiToPol((3n * ETH).toString())).toBe(3);
    expect(weiToPol("1500000000000000000")).toBe(1.5);
    expect(weiToPol("0")).toBe(0);
  });

  it("la etiqueta exacta conserva el valor en wei (no pasa por coma flotante)", () => {
    expect(weiLabel("1000000000000000001")).toBe("1.000000000000000001 ETH");
  });
});

describe("dashboard-data · etiqueta de mes", () => {
  it("traduce `YYYY-MM` a «Mes de AAAA» en el locale del dashboard", () => {
    expect(monthLabel("2026-08")).toBe("Agosto de 2026");
    expect(monthLabel("2026-01")).toBe("Enero de 2026");
  });

  it("respeta el locale pedido", () => {
    expect(monthLabel("2026-08", "en-GB")).toBe("August 2026");
  });

  it("un mes con formato inesperado se muestra tal cual (no se inventa una fecha)", () => {
    expect(monthLabel("2026-13")).toBe("2026-13");
    expect(monthLabel("basura")).toBe("basura");
  });
});

describe("dashboard-data · serie mensual", () => {
  it("mantiene el orden del worker y conserva los conteos", () => {
    const points = toMonthlyChartData([
      {
        month: "2026-07",
        primaryVolumeWei: (2n * ETH).toString(),
        secondaryVolumeWei: "0",
        primarySales: 2,
        secondarySales: 0,
      },
      {
        month: "2026-08",
        primaryVolumeWei: ETH.toString(),
        secondaryVolumeWei: (ETH / 2n).toString(),
        primarySales: 1,
        secondarySales: 1,
      },
    ]);

    expect(points.map((point) => point.month)).toEqual(["2026-07", "2026-08"]);
    expect(points[1]).toMatchObject({
      label: "Agosto de 2026",
      primaryPol: 1,
      secondaryPol: 0.5,
      primaryLabel: "1 ETH",
      secondaryLabel: "0.5 ETH",
      primarySales: 1,
      secondarySales: 1,
    });
    expect(totalSalesOfSeries(points)).toBe(4);
  });

  it("sin meses: serie vacía (la vista muestra su propio estado vacío)", () => {
    expect(toMonthlyChartData([])).toEqual([]);
    expect(totalSalesOfSeries([])).toBe(0);
  });
});

describe("dashboard-data · desglose por tipo", () => {
  it("conserva el orden canónico y deriva el total", () => {
    const points = toRoomTypeChartData([
      {
        roomType: "simple",
        primarySales: 1,
        secondarySales: 1,
        primaryVolumeWei: ETH.toString(),
        secondaryVolumeWei: (ETH / 2n).toString(),
        totalVolumeWei: (ETH + ETH / 2n).toString(),
      },
      {
        roomType: "desconocido",
        primarySales: 1,
        secondarySales: 0,
        primaryVolumeWei: "1",
        secondaryVolumeWei: "0",
        totalVolumeWei: "1",
      },
    ]);

    expect(points.map((point) => point.roomType)).toEqual(["simple", "desconocido"]);
    expect(points[0]?.totalPol).toBe(1.5);
    expect(points[0]?.totalLabel).toBe("1.5 ETH");
    expect(points[1]?.totalLabel).toBe("0.000000000000000001 ETH");
  });
});

describe("dashboard-data · ranking de más revendidas", () => {
  it("numera el ranking desde 1 y formatea el volumen", () => {
    const rows = toTopResoldRows([
      {
        tokenId: "10120260815",
        room: 101,
        dateYYYYMMDD: 20_260_815,
        roomType: "simple",
        resaleCount: 3,
        resaleVolumeWei: (2n * ETH).toString(),
      },
      {
        tokenId: "20120260901",
        room: 201,
        dateYYYYMMDD: 20_260_901,
        roomType: "suite",
        resaleCount: 1,
        resaleVolumeWei: ETH.toString(),
      },
    ]);

    expect(rows.map((row) => row.rank)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({
      tokenId: "10120260815",
      volumeWei: (2n * ETH).toString(),
      volumeLabel: "2 ETH",
      resaleCount: 3,
    });
  });

  it("sin reventas: ranking vacío", () => {
    expect(toTopResoldRows([])).toEqual([]);
  });
});
