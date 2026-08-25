import { NextResponse } from "next/server";
import {
  fetchElectionConfig,
  extractElectionEntries,
  summarizeElection2026,
} from "@/lib/tse/config";

export async function GET() {
  try {
    const result =
      await fetchElectionConfig();

    const config =
      result.data;

    if (!config) {
      return NextResponse.json({
        sucesso: true,

        tse: {
          ambiente: "oficial",

          configuracao:
            process.env
              .TSE_ELECTION_CONFIG_PATH ??
            "/comum/config/ele-c.json",

          baseUrl:
            process.env.TSE_BASE_URL ??
            "https://resultados.tse.jus.br/oficial",

          status:
            "nao_modificado",

          httpStatus:
            result.meta.status,

          url:
            result.meta.url,

          etag:
            result.meta.etag,

          lastModified:
            result.meta.lastModified,

          changed:
            result.changed,

          notModified:
            result.notModified,
        },

        eleicoes: {
          total: null,
        },

        eleicao2026: {
          encontrada: false,
          status:
            "configuracao_nao_disponivel",
        },
      });
    }

    const eleicoes =
      extractElectionEntries(
        config
      );

    const eleicao2026 =
      summarizeElection2026(
        config
      );

    return NextResponse.json({
      sucesso: true,

      tse: {
        ambiente: "oficial",

        configuracao:
          process.env
            .TSE_ELECTION_CONFIG_PATH ??
          "/comum/config/ele-c.json",

        baseUrl:
          process.env.TSE_BASE_URL ??
          "https://resultados.tse.jus.br/oficial",

        status:
          "acessivel",

        httpStatus:
          result.meta.status,

        url:
          result.meta.url,

        etag:
          result.meta.etag,

        lastModified:
          result.meta.lastModified,

        changed:
          result.changed,

        notModified:
          result.notModified,
      },

      eleicoes: {
        total:
          eleicoes.length,
      },

      eleicao2026: {
        ...eleicao2026,

        status:
          eleicao2026.encontrada
            ? "disponivel"
            : "aguardando_configuracao_2026",
      },
    });
  } catch (error) {
    console.error(
      "Erro ao consultar TSE:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,

        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao consultar o TSE.",
      },
      { status: 502 }
    );
  }
}