import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

type Resultado = {
  votos: number;
  candidato_id: number;
  localidade_id: number;
  candidatos:
    | {
        numero: number;
        nome: string;
        nome_urna: string | null;
        partido: string | null;
      }
    | null;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();

    const searchParams =
      request.nextUrl.searchParams;

    const uf = searchParams.get("uf");
    const municipio =
      searchParams.get("municipio");
    const zona = searchParams.get("zona");
    const secao = searchParams.get("secao");

    // ======================================================
    // LOCALIDADES
    // ======================================================

    let localidadesQuery = supabase
      .from("localidades")
      .select(
        "id, uf, municipio, zona, secao"
      );

    if (uf && uf !== "Brasil") {
      localidadesQuery =
        localidadesQuery.eq("uf", uf);
    }

    if (municipio) {
      localidadesQuery =
        localidadesQuery.eq(
          "municipio",
          municipio
        );
    }

    if (zona) {
      localidadesQuery =
        localidadesQuery.eq(
          "zona",
          Number(zona)
        );
    }

    if (secao) {
      localidadesQuery =
        localidadesQuery.eq(
          "secao",
          Number(secao)
        );
    }

    const {
      data: localidades,
      error: localidadesError,
    } = await localidadesQuery;

    if (localidadesError) {
      console.error(
        "Erro localidades:",
        localidadesError
      );

      return NextResponse.json(
        {
          sucesso: false,
          erro: localidadesError.message,
        },
        { status: 500 }
      );
    }

    const idsLocalidades =
      (localidades ?? []).map(
        (localidade) =>
          localidade.id
      );

    // ======================================================
    // NENHUMA LOCALIDADE
    // ======================================================

    if (idsLocalidades.length === 0) {
      return NextResponse.json({
        sucesso: true,
        eleicao: 2026,
        totalVotos: 0,
        totalSecoes: 0,
        secoesProcessadas: 0,
        percentualTotalizacao: 0,
        candidatos: [],
      });
    }

    // ======================================================
    // RESULTADOS
    // ======================================================

    const {
      data,
      error,
    } = await supabase
      .from("resultados")
      .select(
        `
        votos,
        candidato_id,
        localidade_id,
        candidatos (
          numero,
          nome,
          nome_urna,
          partido
        )
      `
      )
      .in(
        "localidade_id",
        idsLocalidades
      );

    if (error) {
      console.error(
        "Erro resultados:",
        error
      );

      return NextResponse.json(
        {
          sucesso: false,
          erro: error.message,
        },
        { status: 500 }
      );
    }

    const resultados: Resultado[] =
      (data ?? [])
        .filter(
          (item) =>
            Array.isArray(item.candidatos) &&
            item.candidatos.length > 0
        )
        .map((item) => {
          const candidato =
            item.candidatos[0];

          return {
            votos:
              Number(item.votos),

            candidato_id:
              Number(item.candidato_id),

            localidade_id:
              Number(item.localidade_id),

            candidatos: {
              numero:
                Number(candidato?.numero ?? 0),

              nome:
                String(candidato?.nome ?? ""),

              nome_urna:
                candidato?.nome_urna ?? null,

              partido:
                candidato?.partido ?? null,
            },
          };
        });

    // ======================================================
    // AGRUPAR CANDIDATOS
    // ======================================================

    const mapa = new Map<
      number,
      {
        numero: number;
        nome: string;
        nome_urna: string | null;
        partido: string | null;
        votos: number;
      }
    >();

    for (const item of resultados) {
      if (!item.candidatos) {
        continue;
      }

      const candidato =
        item.candidatos;

      const atual =
        mapa.get(
          candidato.numero
        );

      if (atual) {
        atual.votos += Number(
          item.votos
        );
      } else {
        mapa.set(
          candidato.numero,
          {
            numero:
              candidato.numero,

            nome:
              candidato.nome,

            nome_urna:
              candidato.nome_urna,

            partido:
              candidato.partido,

            votos:
              Number(item.votos),
          }
        );
      }
    }

    const candidatos =
      Array.from(
        mapa.values()
      ).sort(
        (a, b) =>
          b.votos - a.votos
      );

    const totalVotos =
      candidatos.reduce(
        (total, candidato) =>
          total +
          candidato.votos,
        0
      );

    const candidatosFormatados =
      candidatos.map(
        (candidato) => ({
          ...candidato,

          percentual:
            totalVotos > 0
              ? Number(
                  (
                    (candidato.votos /
                      totalVotos) *
                    100
                  ).toFixed(2)
                )
              : 0,
        })
      );

    // ======================================================
    // TOTALIZAÃ‡ÃƒO
    // ======================================================

    /*
     * NÃºmero de seÃ§Ãµes existentes
     * no filtro atual.
     */
    const totalSecoes =
      localidades?.length ?? 0;

    /*
     * SeÃ§Ãµes que possuem pelo menos
     * um resultado processado.
     */
    const secoesProcessadas =
      new Set(
        resultados.map(
          (resultado) =>
            resultado.localidade_id
        )
      ).size;

    const percentualTotalizacao =
      totalSecoes > 0
        ? Number(
            (
              (secoesProcessadas /
                totalSecoes) *
              100
            ).toFixed(2)
          )
        : 0;

    // ======================================================
    // RESPOSTA
    // ======================================================

    return NextResponse.json({
      sucesso: true,

      eleicao: 2026,

      totalVotos,

      totalSecoes,

      secoesProcessadas,

      percentualTotalizacao,

      candidatos:
        candidatosFormatados,
    });
  } catch (error) {
    console.error(
      "Erro geral /api/resultados:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido.",
      },
      { status: 500 }
    );
  }
}
