import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

type ResultadoCandidato = {
  numero: number;
  nome: string;
  nome_urna: string | null;
  partido: string | null;
  votos: number;
};

type Divergencia = {
  numero: number;
  nome: string;
  bu: number;
  resultado: number;
  diferenca: number;
};

function calcularSha256Json(dados: unknown) {
  const json = JSON.stringify(dados);

  return createHash("sha256")
    .update(json, "utf8")
    .digest("hex");
}

function calcularSha256Texto(texto: string) {
  return createHash("sha256")
    .update(texto, "utf8")
    .digest("hex");
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();

    const localidadeId =
      request.nextUrl.searchParams.get(
        "localidade_id"
      );

    if (!localidadeId) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "localidade_id Ã© obrigatÃ³rio.",
        },
        { status: 400 }
      );
    }

    const localidadeIdNumber = Number(
      localidadeId
    );

    if (!Number.isInteger(localidadeIdNumber)) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "localidade_id invÃ¡lido.",
        },
        { status: 400 }
      );
    }

    // =====================================================
    // LOCALIDADE
    // =====================================================

    const {
      data: localidade,
      error: localidadeError,
    } = await supabase
      .from("localidades")
      .select(
        "id, uf, municipio, zona, secao"
      )
      .eq(
        "id",
        localidadeIdNumber
      )
      .maybeSingle();

    if (localidadeError) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: localidadeError.message,
        },
        { status: 500 }
      );
    }

    if (!localidade) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Localidade nÃ£o encontrada.",
        },
        { status: 404 }
      );
    }

    // =====================================================
    // RESULTADOS DA SEÃ‡ÃƒO
    // =====================================================

    const {
      data: resultados,
      error: resultadosError,
    } = await supabase
      .from("resultados")
      .select(
        `
        votos,
        candidatos (
          numero,
          nome,
          nome_urna,
          partido
        )
      `
      )
      .eq(
        "localidade_id",
        localidadeIdNumber
      );

    if (resultadosError) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: resultadosError.message,
        },
        { status: 500 }
      );
    }

    const candidatos: ResultadoCandidato[] =
      (resultados ?? [])
        .filter(
          (item) =>
            Array.isArray(item.candidatos) &&
            item.candidatos.length > 0
        )
        .map((item) => {
          const candidato = item.candidatos[0];

          return {
            numero: Number(candidato?.numero ?? 0),
            nome: String(candidato?.nome ?? ""),
            nome_urna: candidato?.nome_urna ?? null,
            partido: candidato?.partido ?? null,
            votos: Number(item.votos),
          };
        })
        .sort(
          (a, b) =>
            b.votos - a.votos
        );

    const totalResultado =
      candidatos.reduce(
        (total, candidato) =>
          total + candidato.votos,
        0
      );

    // =====================================================
    // BOLETIM DE URNA
    // =====================================================

    const {
      data: boletim,
      error: boletimError,
    } = await supabase
      .from("boletins_urna")
      .select(
        `
        id,
        eleicao_id,
        arquivo,
        sha256,
        status,
        recebido_em,
        dados_json
      `
      )
      .eq(
        "localidade_id",
        localidadeIdNumber
      )
      .order(
        "recebido_em",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (boletimError) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: boletimError.message,
        },
        { status: 500 }
      );
    }

    // =====================================================
    // SEM BOLETIM
    // =====================================================

    if (!boletim) {
      return NextResponse.json({
        sucesso: true,

        localidade,

        resultado: {
          candidatos,
          totalVotos:
            totalResultado,
        },

        boletim: null,

        auditoria: {
          arquivoRecebido: false,
          hashConferido: false,
          processado: false,
          divergencias: 0,
        },

        comparacao: {
          status: "aguardando_bu",
          totalBu: null,
          totalResultado,
          divergencias: [],
        },

        integridadeHash: {
          status: "aguardando_bu",
          calculado: null,
          armazenado: null,
        },
      });
    }

    // =====================================================
    // HASH DO JSON DE DEMONSTRAÃ‡ÃƒO
    // =====================================================

    const hashCalculado =
      calcularSha256Json(
        boletim.dados_json
      );

    const hashArmazenado =
      boletim.sha256;

    const hashConferido =
      Boolean(
        hashArmazenado &&
          hashCalculado ===
            hashArmazenado
      );

    // =====================================================
    // VOTOS DO BU
    // =====================================================

    const dadosBu =
      boletim.dados_json;

    const votosBuRaw =
      dadosBu &&
      typeof dadosBu === "object" &&
      "votos" in dadosBu &&
      typeof (
        dadosBu as {
          votos?: unknown;
        }
      ).votos === "object"
        ? (
            dadosBu as {
              votos: Record<
                string,
                unknown
              >;
            }
          ).votos
        : {};

    const votosBu: Record<
      string,
      number
    > = {};

    for (const [numero, votos] of Object.entries(
      votosBuRaw
    )) {
      votosBu[numero] =
        Number(votos) || 0;
    }

    // =====================================================
    // MAPA DOS RESULTADOS
    // =====================================================

    const mapaResultados =
      new Map<
        number,
        ResultadoCandidato
      >();

    for (const candidato of candidatos) {
      mapaResultados.set(
        candidato.numero,
        candidato
      );
    }

    // =====================================================
    // COMPARAÃ‡ÃƒO DOS CANDIDATOS
    // =====================================================

    const numeros =
      new Set<number>();

    for (const candidato of candidatos) {
      numeros.add(
        candidato.numero
      );
    }

    for (const numero of Object.keys(
      votosBu
    )) {
      const numeroNumerico =
        Number(numero);

      if (
        Number.isInteger(
          numeroNumerico
        )
      ) {
        numeros.add(
          numeroNumerico
        );
      }
    }

    const divergencias: Divergencia[] =
      [];

    for (const numero of numeros) {
      const candidato =
        mapaResultados.get(
          numero
        );

      const valorBu =
        votosBu[
          String(numero)
        ] ?? 0;

      const valorResultado =
        candidato?.votos ?? 0;

      const diferenca =
        valorBu -
        valorResultado;

      if (diferenca !== 0) {
        divergencias.push({
          numero,

          nome:
            candidato?.nome ??
            `Candidato ${numero}`,

          bu: valorBu,

          resultado:
            valorResultado,

          diferenca,
        });
      }
    }

    // =====================================================
    // TOTAIS
    // =====================================================

    const totalBu =
      Object.values(
        votosBu
      ).reduce(
        (total, votos) =>
          total + votos,
        0
      );

    const totalDivergente =
      totalBu !==
      totalResultado;

    // =====================================================
    // STATUS DA COMPARAÃ‡ÃƒO
    // =====================================================

    const statusComparacao =
      divergencias.length === 0 &&
      !totalDivergente
        ? "ok"
        : "divergente";

    // =====================================================
    // STATUS DO HISTÃ“RICO
    // =====================================================

    const statusHistorico =
      statusComparacao ===
      "divergente"
        ? !hashConferido
          ? "hash_divergente"
          : "divergente"
        : "ok";

    // =====================================================
    // SNAPSHOT
    // =====================================================

    /*
     * O snapshot representa exatamente
     * o estado da auditoria neste instante.
     *
     * Se todos esses valores permanecerem
     * iguais, nÃ£o criamos outro registro.
     */

    const snapshotPayload =
      JSON.stringify({
        localidade_id:
          localidadeIdNumber,

        boletim_id:
          boletim.id,

        status:
          statusHistorico,

        total_bu:
          totalBu,

        total_resultado:
          totalResultado,

        divergencias,

        hash_calculado:
          hashCalculado,

        hash_armazenado:
          hashArmazenado,
      });

    const snapshotHash =
      calcularSha256Texto(
        snapshotPayload
      );

    // =====================================================
    // ÃšLTIMO SNAPSHOT
    // =====================================================

    const {
      data: ultimoHistorico,
      error: ultimoHistoricoError,
    } = await supabase
      .from("auditorias_historico")
      .select(
        "id, snapshot_hash, criado_em"
      )
      .eq(
        "localidade_id",
        localidadeIdNumber
      )
      .order(
        "criado_em",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (ultimoHistoricoError) {
      console.error(
        "Erro ao consultar Ãºltimo histÃ³rico:",
        ultimoHistoricoError
      );
    }

    const estadoMudou =
      !ultimoHistorico ||
      ultimoHistorico.snapshot_hash !==
        snapshotHash;

    // =====================================================
    // GRAVAR SOMENTE SE O ESTADO MUDOU
    // =====================================================

    if (estadoMudou) {
      const {
        error: historicoError,
      } = await supabase
        .from(
          "auditorias_historico"
        )
        .insert({
          eleicao_id:
            boletim.eleicao_id ??
            1,

          localidade_id:
            localidadeIdNumber,

          boletim_id:
            boletim.id,

          status:
            statusHistorico,

          total_bu:
            totalBu,

          total_resultado:
            totalResultado,

          divergencias,

          hash_calculado:
            hashCalculado,

          hash_armazenado:
            hashArmazenado,

          snapshot_hash:
            snapshotHash,
        });

      if (historicoError) {
        console.error(
          "Erro ao gravar histÃ³rico:",
          historicoError
        );
      }
    }

    // =====================================================
    // RESPOSTA
    // =====================================================

    return NextResponse.json({
      sucesso: true,

      localidade,

      resultado: {
        candidatos,

        totalVotos:
          totalResultado,
      },

      boletim: {
        id: boletim.id,

        arquivo:
          boletim.arquivo,

        sha256:
          boletim.sha256,

        status:
          boletim.status,

        recebido_em:
          boletim.recebido_em,

        dados_json:
          boletim.dados_json,
      },

      auditoria: {
        arquivoRecebido: true,

        hashConferido,

        processado: true,

        divergencias:
          divergencias.length +
          (totalDivergente
            ? 1
            : 0),
      },

      comparacao: {
        status:
          statusComparacao,

        totalBu,

        totalResultado,

        divergencias,
      },

      integridadeHash: {
        status:
          hashConferido
            ? "ok"
            : "divergente",

        calculado:
          hashCalculado,

        armazenado:
          hashArmazenado,
      },

      historico: {
        snapshotHash,

        novoRegistro:
          estadoMudou,
      },
    });
  } catch (error) {
    console.error(
      "Erro na auditoria:",
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
