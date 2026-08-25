import { NextResponse } from "next/server";
import { DuckDBInstance } from "@duckdb/node-api";
import path from "node:path";

export async function GET() {
  try {
    const arquivo = path.join(
      process.cwd(),
      "data",
      "historico",
      "tse-2022-completo.parquet"
    );

    const instance =
      await DuckDBInstance.create();

    const connection =
      await instance.connect();

    try {
      const sql = `
        SELECT DISTINCT
          uf,
          municipio,
          zona,
          secao
        FROM read_parquet(
          '${arquivo.replaceAll("'", "''")}'
        )
        WHERE uf IS NOT NULL
          AND municipio IS NOT NULL
          AND zona IS NOT NULL
          AND secao IS NOT NULL
        ORDER BY
          uf,
          municipio,
          zona,
          secao
      `;

      const reader =
        await connection.runAndReadAll(
          sql
        );

      const rows =
        reader.getRows();

      const localidades =
        rows.map(
          (row: any[], index: number) => ({
            id: index + 1,
            uf: String(
              row[0] ?? ""
            ),
            municipio: String(
              row[1] ?? ""
            ),
            zona: Number(
              row[2] ?? 0
            ),
            secao: Number(
              row[3] ?? 0
            ),
          })
        );

      return NextResponse.json(
        {
          sucesso: true,
          localidades,
        },
        {
          headers: {
            "Cache-Control":
              "public, max-age=3600, stale-while-revalidate=86400",
          },
        }
      );
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  } catch (error) {
    console.error(
      "Erro em /api/historico-tse/localidades:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        localidades: [],
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido.",
      },
      {
        status: 500,
      }
    );
  }
}