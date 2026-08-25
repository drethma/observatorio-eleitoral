import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("eleicoes")
      .select("*")
      .order("ano", { ascending: false });

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
      dados: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}