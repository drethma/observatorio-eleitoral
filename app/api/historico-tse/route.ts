import { NextResponse } from "next/server";
import { DuckDBInstance } from "@duckdb/node-api";
import path from "node:path";

type RespostaHistorico = {
  sucesso: boolean;
  fonte: "historico-tse";
  ano: number;
  turno: number;
  totalVotos: number;
  totalRegistros: number;
  totalSecoes: number;
  secoesProcessadas: number;
  percentualTotalizacao: number;
  candidatos: Array<{
    numero: number;
    nome: string;
    tipo_votavel: string;
    votos: number;
    percentual: number;
  }>;
  filtros: {
    uf: string | null;
    municipio: string | null;
    zona: number | null;
    secao: number | null;
  };
  erro?: string;
};

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function optionalNumber(value: string | null) {
  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const ano = Number(
      url.searchParams.get("ano") || "2022"
    );

    const turno = Number(
      url.searchParams.get("turno") || "1"
    );

    const uf = url.searchParams.get("uf")?.trim() || null;

    const municipio =
      url.searchParams.get("municipio")?.trim() ||
      null;

    const zona = optionalNumber(
      url.searchParams.get("zona")
    );

    const secao = optionalNumber(
      url.searchParams.get("secao")
    );

    if (ano !== 2022) {
      return NextResponse.json(
        {
          sucesso: false,
          fonte: "historico-tse",
          ano,
          turno,
          totalVotos: 0,
          totalRegistros: 0,
          totalSecoes: 0,
          secoesProcessadas: 0,
          percentualTotalizacao: 0,
          candidatos: [],
          filtros: {
            uf,
            municipio,
            zona,
            secao,
          },
          erro:
            "Neste momento, o histórico TSE disponível é 2022.",
        } satisfies RespostaHistorico,
        {
          status: 400,
        }
      );
    }

    if (turno !== 1 && turno !== 2) {
      return NextResponse.json(
        {
          sucesso: false,
          fonte: "historico-tse",
          ano,
          turno,
          totalVotos: 0,
          totalRegistros: 0,
          totalSecoes: 0,
          secoesProcessadas: 0,
          percentualTotalizacao: 0,
          candidatos: [],
          filtros: {
            uf,
            municipio,
            zona,
            secao,
          },
          erro: "Turno inválido. Use 1 ou 2.",
        } satisfies RespostaHistorico,
        {
          status: 400,
        }
      );
    }

    if (
      url.searchParams.has("zona") &&
      url.searchParams.get("zona")?.trim() &&
      zona === null
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          fonte: "historico-tse",
          ano,
          turno,
          totalVotos: 0,
          totalRegistros: 0,
          totalSecoes: 0,
          secoesProcessadas: 0,
          percentualTotalizacao: 0,
          candidatos: [],
          filtros: {
            uf,
            municipio,
            zona,
            secao,
          },
          erro: "Zona inválida.",
        } satisfies RespostaHistorico,
        {
          status: 400,
        }
      );
    }

    if (
      url.searchParams.has("secao") &&
      url.searchParams.get("secao")?.trim() &&
      secao === null
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          fonte: "historico-tse",
          ano,
          turno,
          totalVotos: 0,
          totalRegistros: 0,
          totalSecoes: 0,
          secoesProcessadas: 0,
          percentualTotalizacao: 0,
          candidatos: [],
          filtros: {
            uf,
            municipio,
            zona,
            secao,
          },
          erro: "Seção inválida.",
        } satisfies RespostaHistorico,
        {
          status: 400,
        }
      );
    }

    const arquivo = path.join(
      process.cwd(),
      "data",
      "historico",
      "tse-2022-completo.parquet"
    );

    const where: string[] = [
      `ano = ${ano}`,
      `turno = ${turno}`,
    ];

    if (uf) {
      where.push(
        `uf = ${sqlString(uf)}`
      );
    }

    if (municipio) {
      where.push(
        `municipio = ${sqlString(municipio)}`
      );
    }

    if (zona !== null) {
      where.push(
        `zona = ${zona}`
      );
    }

    if (secao !== null) {
      where.push(
        `secao = ${secao}`
      );
    }

    const whereClause =
      where.join(" AND ");

    const instance =
      await DuckDBInstance.create();

    const connection =
      await instance.connect();

    try {
      const arquivoEscapado =
        arquivo.replaceAll("'", "''");

      const sql = `
        SELECT
          numero_candidato AS numero,
          candidato AS nome,
          tipo_votavel,
          SUM(votos)::BIGINT AS votos
        FROM read_parquet('${arquivoEscapado}')
        WHERE ${whereClause}
        GROUP BY
          numero_candidato,
          candidato,
          tipo_votavel
        ORDER BY
          votos DESC,
          numero_candidato ASC
      `;

      const reader =
        await connection.runAndReadAll(
          sql
        );

      const rows =
        reader.getRows();

      const candidatos =
        rows.map(
          (row: any[]) => ({
            numero: Number(
              row[0]
            ),

            nome:
              String(
                row[1] ?? ""
              ),

            tipo_votavel:
              String(
                row[2] ?? ""
              ),

            votos:
              Number(
                row[3] ?? 0
              ),

            percentual: 0,
          })
        );

      const totalVotos =
        candidatos.reduce(
          (total, candidato) =>
            total + candidato.votos,
          0
        );

      for (
        const candidato of candidatos
      ) {
        candidato.percentual =
          totalVotos > 0
            ? (
                candidato.votos /
                totalVotos
              ) *
              100
            : 0;
      }

      const secoesReader =
        await connection.runAndReadAll(
          `
            SELECT
              COUNT(DISTINCT
                uf || '|' ||
                municipio || '|' ||
                CAST(zona AS VARCHAR) || '|' ||
                CAST(secao AS VARCHAR)
              )::BIGINT AS total_secoes
            FROM read_parquet('${arquivoEscapado}')
            WHERE ${whereClause}
          `
        );

      const secoesRows =
        secoesReader.getRows();

      const totalSecoes =
        Number(
          secoesRows[0]?.[0] ?? 0
        );

      const resposta:
        RespostaHistorico = {
        sucesso: true,
        fonte: "historico-tse",
        ano,
        turno,
        totalVotos,
        totalRegistros:
          candidatos.length,
        totalSecoes,
        secoesProcessadas:
          totalSecoes,
        percentualTotalizacao:
          totalSecoes > 0
            ? 100
            : 0,
        candidatos,
        filtros: {
          uf,
          municipio,
          zona,
          secao,
        },
      };

      return NextResponse.json(
        resposta,
        {
          headers: {
            "Cache-Control":
              "public, max-age=60, stale-while-revalidate=300",
          },
        }
      );
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  } catch (error) {
    console.error(
      "Erro em /api/historico-tse:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        fonte: "historico-tse",
        ano: 2022,
        turno: 1,
        totalVotos: 0,
        totalRegistros: 0,
        totalSecoes: 0,
        secoesProcessadas: 0,
        percentualTotalizacao: 0,
        candidatos: [],
        filtros: {
          uf: null,
          municipio: null,
          zona: null,
          secao: null,
        },
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido.",
      } satisfies RespostaHistorico,
      {
        status: 500,
      }
    );
  }
}
