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
          erro: "localidade_id é obrigatório.",
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
          erro: "localidade_id inválido.",
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
          erro: "Localidade não encontrada.",
        },
        { status: 404 }
      );
    }

    // =====================================================
    // RESULTADOS DA SEÇÃO
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
          (item) => item.candidatos
        )
        .map((item) => ({
          numero:
            item.candidatos!.numero,

          nome:
            item.candidatos!.nome,

          nome_urna:
            item.candidatos!.nome_urna,

          partido:
            item.candidatos!.partido,

          votos:
            Number(item.votos),
        }))
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
    // HASH DO JSON DE DEMONSTRAÇÃO
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
    // COMPARAÇÃO DOS CANDIDATOS
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
    // STATUS DA COMPARAÇÃO
    // =====================================================

    const statusComparacao =
      divergencias.length === 0 &&
      !totalDivergente
        ? "ok"
        : "divergente";

    // =====================================================
    // STATUS DO HISTÓRICO
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
     * iguais, não criamos outro registro.
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
    // ÚLTIMO SNAPSHOT
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
        "Erro ao consultar último histórico:",
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
          "Erro ao gravar histórico:",
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