import { createClient } from "./supabase";

export async function buscarResultados() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("resultados")
    .select(`
      votos,
      atualizado_em,
      candidatos (
        numero,
        nome,
        nome_urna,
        partido
      ),
      localidades (
        uf,
        municipio,
        zona,
        secao
      )
    `);

  if (error) {
    console.error("Erro ao consultar resultados:", error);
    throw new Error(error.message);
  }

  return data;
}