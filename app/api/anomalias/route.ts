import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

type HistoricoRow = {
  id: number;
  boletim_id: number | null;
  status:
    | "ok"
    | "divergente"
    | "aguardando_bu"
    | "hash_divergente";
  total_bu: number | null;
  total_resultado: number | null;
  divergencias: Array<{
    numero: number;
    nome: string;
    bu: number;
    resultado: number;
    diferenca: number;
  }> | null;
  hash_calculado: string | null;
  hash_armazenado: string | null;
  criado_em: string;
};

type Anomalia = {
  tipo:
    | "divergencia_votos"
    | "hash_divergente"
    | "total_divergente"
    | "status_divergente";

  severidade: "media" | "alta";

  titulo: string;
  descricao: string;

  criado_em: string;

  historico_id: number;
};

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

    const id = Number(localidadeId);

    if (!Number.isInteger(id)) {
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
      .eq("id", id)
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
    // HISTÓRICO
    // =====================================================

    const {
      data: historico,
      error: historicoError,
    } = await supabase
      .from("auditorias_historico")
      .select(
        `
        id,
        boletim_id,
        status,
        total_bu,
        total_resultado,
        divergencias,
        hash_calculado,
        hash_armazenado,
        criado_em
      `
      )
      .eq("localidade_id", id)
      .order("criado_em", {
        ascending: false,
      })
      .limit(100);

    if (historicoError) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: historicoError.message,
        },
        { status: 500 }
      );
    }

    const registros =
      (historico ?? []) as HistoricoRow[];

    const anomalias: Anomalia[] = [];

    // =====================================================
    // ANALISAR CADA REGISTRO
    // =====================================================

    for (const registro of registros) {
      // ---------------------------------------------------
      // STATUS DIVERGENTE
      // ---------------------------------------------------

      if (
        registro.status ===
        "divergente"
      ) {
        anomalias.push({
          tipo: "status_divergente",
          severidade: "alta",

          titulo:
            "Divergência detectada",

          descricao:
            "A auditoria registrou uma divergência entre os dados do Boletim de Urna e o resultado armazenado.",

          criado_em:
            registro.criado_em,

          historico_id:
            registro.id,
        });
      }

      // ---------------------------------------------------
      // HASH
      // ---------------------------------------------------

      if (
        registro.status ===
        "hash_divergente"
      ) {
        anomalias.push({
          tipo: "hash_divergente",
          severidade: "alta",

          titulo:
            "Hash SHA-256 divergente",

          descricao:
            "O hash calculado do conteúdo do Boletim de Urna não corresponde ao hash armazenado.",

          criado_em:
            registro.criado_em,

          historico_id:
            registro.id,
        });
      }

      // ---------------------------------------------------
      // DIVERGÊNCIAS INDIVIDUAIS
      // ---------------------------------------------------

      if (
        registro.divergencias &&
        registro.divergencias.length >
          0
      ) {
        for (const divergencia of registro.divergencias) {
          anomalias.push({
            tipo:
              "divergencia_votos",

            severidade: "alta",

            titulo:
              `Diferença no candidato ${divergencia.numero}`,

            descricao:
              `${divergencia.nome}: BU ${divergencia.bu}, resultado ${divergencia.resultado}, diferença ${divergencia.diferenca > 0 ? "+" : ""}${divergencia.diferenca}.`,

            criado_em:
              registro.criado_em,

            historico_id:
              registro.id,
          });
        }
      }

      // ---------------------------------------------------
      // TOTAL
      // ---------------------------------------------------

      if (
        registro.total_bu !==
          null &&
        registro.total_resultado !==
          null &&
        registro.total_bu !==
          registro.total_resultado
      ) {
        anomalias.push({
          tipo:
            "total_divergente",

          severidade: "alta",

          titulo:
            "Total de votos divergente",

          descricao:
            `BU: ${registro.total_bu} votos. Resultado: ${registro.total_resultado} votos.`,

          criado_em:
            registro.criado_em,

          historico_id:
            registro.id,
        });
      }
    }

    // =====================================================
    // ORDENAR EVENTOS
    // =====================================================

    anomalias.sort(
      (a, b) =>
        new Date(
          b.criado_em
        ).getTime() -
        new Date(
          a.criado_em
        ).getTime()
    );

    // =====================================================
    // RESUMO
    // =====================================================

    const ultimaAuditoria =
      registros[0] ?? null;

    const statusAtual =
      !ultimaAuditoria
        ? "sem_dados"
        : ultimaAuditoria.status ===
            "ok"
          ? "ok"
          : "anomalia";

    return NextResponse.json({
      sucesso: true,

      localidade,

      resumo: {
        statusAtual,

        totalRegistros:
          registros.length,

        totalAnomalias:
          anomalias.length,

        ultimaAuditoria:
          ultimaAuditoria?.criado_em ??
          null,
      },

      anomalias,
    });
  } catch (error) {
    console.error(
      "Erro na análise de anomalias:",
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