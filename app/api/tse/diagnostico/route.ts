import { NextRequest, NextResponse } from "next/server";

import {
  asNumber,
  asRecord,
  asString,
  extractSectionReference,
  findAllByKey,
  normalizeDocument,
  normalizeEA20,
  type TseRawJson,
} from "@/lib/tse/parser";

type DiagnosticRequest = {
  arquivo?: string;
  dados?: TseRawJson;
  url?: string | null;
  etag?: string | null;
  lastModified?: string | null;
};

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      (await request.json()) as DiagnosticRequest;

    const arquivo =
      asString(
        body.arquivo
      ) ?? "ARQUIVO_TSE";

    /*
     * Aceitamos duas formas:
     *
     * 1. {
     *      arquivo: "EA20",
     *      dados: {...}
     *    }
     *
     * 2. {
     *      arquivo: "EA20",
     *      ...JSON original...
     *    }
     *
     * No segundo caso, usamos o próprio body
     * como documento, retirando apenas campos
     * de transporte conhecidos.
     */

    let dados: TseRawJson | null =
      body.dados ?? null;

    if (!dados) {
      const clone = {
        ...body,
      } as Record<
        string,
        unknown
      >;

      delete clone.arquivo;
      delete clone.url;
      delete clone.etag;
      delete clone.lastModified;
      delete clone.dados;

      dados = clone;
    }

    if (
      !dados ||
      (
        typeof dados !== "object"
      )
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "O campo 'dados' deve conter um objeto ou array JSON.",
        },
        { status: 400 }
      );
    }

    // ==================================================
    // DOCUMENTO NORMALIZADO
    // ==================================================

    const documento =
      normalizeDocument({
        arquivo,
        dados,
        url:
          body.url ?? null,
        etag:
          body.etag ?? null,
        lastModified:
          body.lastModified ??
          null,
      });

    // ==================================================
    // INFORMAÇÕES GERAIS
    // ==================================================

    const raiz =
      asRecord(dados);

    const topLevelKeys =
      raiz
        ? Object.keys(raiz)
        : [];

    // ==================================================
    // LOCALIZAÇÃO
    // ==================================================

    const localizacao =
      raiz
        ? {
            uf:
              asString(
                raiz["uf"] ??
                  raiz["sg_uf"]
              ),

            municipio:
              asString(
                raiz["municipio"] ??
                  raiz[
                    "nm_municipio"
                  ]
              ),

            zona:
              asNumber(
                raiz["zona"] ??
                  raiz["nr_zona"]
              ),

            secao:
              asNumber(
                raiz["secao"] ??
                  raiz["nr_secao"]
              ),
          }
        : {
            uf: null,
            municipio: null,
            zona: null,
            secao: null,
          };

    // ==================================================
    // EA16 / REFERÊNCIA DE SEÇÃO
    // ==================================================

    const referenciasSecao: Array<
      ReturnType<
        typeof extractSectionReference
      >
    > = [];

    const possiveisReferencias =
      findAllByKey(
        dados,
        [
          "secoes",
          "seções",
          "secao",
          "seção",
          "sections",
        ]
      );

    for (
      const item of possiveisReferencias
    ) {
      if (
        Array.isArray(item)
      ) {
        for (
          const subitem of item
        ) {
          const referencia =
            extractSectionReference(
              subitem
            );

          if (referencia) {
            referenciasSecao.push(
              referencia
            );
          }
        }
      } else {
        const referencia =
          extractSectionReference(
            item
          );

        if (referencia) {
          referenciasSecao.push(
            referencia
          );
        }
      }
    }

    // Remove valores nulos e duplicados
    const referenciasUnicas =
      referenciasSecao
        .filter(
          (
            item
          ): item is NonNullable<
            typeof item
          > => Boolean(item)
        )
        .filter(
          (
            item,
            index,
            array
          ) => {
            const chave =
              JSON.stringify(
                item
              );

            return (
              array.findIndex(
                (
                  outro
                ) =>
                  JSON.stringify(
                    outro
                  ) === chave
              ) === index
            );
          }
        );

    // ==================================================
    // EA20
    // ==================================================

    let resultadoEA20: ReturnType<
      typeof normalizeEA20
    > | null = null;

    if (
      arquivo
        .toUpperCase()
        .includes("EA20")
    ) {
      if (raiz) {
        resultadoEA20 =
          normalizeEA20(
            raiz
          );
      }
    }

    // ==================================================
    // CANDIDATOS
    // ==================================================

    const candidatosEncontrados =
      resultadoEA20?.candidatos ??
      [];

    // ==================================================
    // POSSÍVEIS TOTAIS
    // ==================================================

    const possiveisTotais =
      findAllByKey(
        dados,
        [
          "totalVotos",
          "total_votos",
          "vl_votos",
          "qtd_votos",
        ]
      )
        .map(asNumber)
        .filter(
          (
            value
          ): value is number =>
            value !== null
        );

    // ==================================================
    // DATAS EA16
    // ==================================================

    const datasEA16 =
      findAllByKey(
        dados,
        ["da", "ha"]
      ).map(asString);

    // ==================================================
    // RESUMO
    // ==================================================

    return NextResponse.json({
      sucesso: true,

      diagnostico: {
        arquivo,

        sha256:
          documento.metadata
            .sha256,

        tamanhoAproximado:
          JSON.stringify(
            dados
          ).length,

        topLevelKeys,

        totalTopLevelKeys:
          topLevelKeys.length,

        localizacao,

        referenciasSecao:
          referenciasUnicas,

        totalReferenciasSecao:
          referenciasUnicas.length,

        totalizadoresEncontrados:
          possiveisTotais,

        datasEA16:
          datasEA16,

        resultadoEA20:
          resultadoEA20
            ? {
                abrangencia:
                  resultadoEA20
                    .abrangencia,

                uf:
                  resultadoEA20.uf,

                municipio:
                  resultadoEA20
                    .municipio,

                zona:
                  resultadoEA20.zona,

                secao:
                  resultadoEA20.secao,

                totalVotos:
                  resultadoEA20
                    .totalVotos,

                totalCandidatos:
                  candidatosEncontrados.length,

                candidatos:
                  candidatosEncontrados,
              }
            : null,
      },

      metadata:
        documento.metadata,
    });
  } catch (error) {
    console.error(
      "Erro no diagnóstico TSE:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,

        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido no diagnóstico.",
      },
      { status: 400 }
    );
  }
}