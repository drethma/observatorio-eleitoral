import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("localidades")
      .select("id, uf, municipio, zona, secao")
      .order("uf", { ascending: true })
      .order("municipio", { ascending: true })
      .order("zona", { ascending: true })
      .order("secao", { ascending: true });

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
      localidades: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}