import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

export async function GET(
  request: NextRequest
) {
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
          erro:
            "localidade_id é obrigatório.",
        },
        { status: 400 }
      );
    }

    const id = Number(localidadeId);

    if (!Number.isInteger(id)) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "localidade_id inválido.",
        },
        { status: 400 }
      );
    }

    const {
      data,
      error,
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
      .eq(
        "localidade_id",
        id
      )
      .order(
        "criado_em",
        {
          ascending: false,
        }
      )
      .limit(100);

    if (error) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      historico: data ?? [],
    });
  } catch (error) {
    console.error(
      "Erro ao carregar histórico:",
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