import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import parquet from "parquetjs-lite";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL nao esta configurada."
  );
}

if (!SUPABASE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY nao esta configurada."
  );
}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

/*
 * Configuracao
 */

const ELEICOES =
  [3, 4];

const PAGINA =
  1000;

const DIRETORIO_SAIDA =
  "./data/historico";

const ARQUIVO_SAIDA =
  path.join(
    DIRETORIO_SAIDA,
    "tse-2022-resultados.parquet"
  );

/*
 * Schema analitico.
 *
 * Os IDs internos do Supabase sao preservados
 * para rastreabilidade, mas o BI recebe tambem
 * os campos de negocio.
 */
const schema =
  new parquet.ParquetSchema({
    resultado_id: {
      type: "INT64",
    },

    eleicao_id: {
      type: "INT64",
    },

    ano: {
      type: "INT32",
    },

    turno: {
      type: "INT32",
    },

    codigo_eleicao_tse: {
      type: "UTF8",
    },

    eleicao: {
      type: "UTF8",
    },

    candidato_id: {
      type: "INT64",
    },

    numero_candidato: {
      type: "INT32",
    },

    candidato: {
      type: "UTF8",
    },

    tipo_votavel: {
      type: "UTF8",
    },

    cargo_id: {
      type: "INT64",
    },

    cargo: {
      type: "UTF8",
    },

    localidade_id: {
      type: "INT64",
    },

    uf: {
      type: "UTF8",
    },

    municipio: {
      type: "UTF8",
    },

    codigo_municipio_tse: {
      type: "UTF8",
    },

    zona: {
      type: "INT32",
    },

    secao: {
      type: "INT32",
    },

    codigo_zona_tse: {
      type: "UTF8",
    },

    codigo_secao_tse: {
      type: "UTF8",
    },

    votos: {
      type: "INT64",
    },

    atualizado_em: {
      type: "TIMESTAMP_MILLIS",
      optional: true,
    },

    coleta_id: {
      type: "INT64",
      optional: true,
    },
  });

/*
 * Utilitarios
 */

function inteiro(
  value,
  padrao = 0
) {
  const numero =
    Number(value);

  return Number.isFinite(
    numero
  )
    ? Math.trunc(numero)
    : padrao;
}

function texto(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return "";
  }

  return String(value);
}

async function buscarPagina(
  ultimoId
) {
  const { data, error } =
    await supabase
      .from("resultados")
      .select(`
        id,
        eleicao_id,
        candidato_id,
        localidade_id,
        votos,
        atualizado_em,
        coleta_id,
        eleicoes!inner(
          ano,
          turno,
          codigo_tse,
          descricao
        ),
        candidatos!inner(
          cargo_id,
          numero,
          nome,
          tipo_votavel
        ),
        localidades!inner(
          uf,
          municipio,
          codigo_municipio_tse,
          zona,
          secao,
          codigo_zona_tse,
          codigo_secao_tse
        ),
        cargos:candidatos!inner(
          cargo_id,
          cargos(
            id,
            nome
          )
        )
      `)
      .in(
        "eleicao_id",
        ELEICOES
      )
      .gt(
        "id",
        ultimoId
      )
      .order(
        "id",
        {
          ascending: true,
        }
      )
      .limit(PAGINA);

  if (error) {
    throw new Error(
      "Erro ao ler resultados: " +
        error.message
    );
  }

  return data || [];
}

/*
 * A consulta acima pode ficar excessivamente
 * complexa dependendo do relacionamento gerado
 * pelo PostgREST.
 *
 * Por isso usamos uma estrategia mais robusta:
 * buscar resultados e resolver as dimensoes
 * com caches locais.
 */

async function buscarResultados(
  ultimoId
) {
  const { data, error } =
    await supabase
      .from("resultados")
      .select(
        `
        id,
        eleicao_id,
        candidato_id,
        localidade_id,
        votos,
        atualizado_em,
        coleta_id
        `
      )
      .in(
        "eleicao_id",
        ELEICOES
      )
      .gt(
        "id",
        ultimoId
      )
      .order(
        "id",
        {
          ascending: true,
        }
      )
      .limit(PAGINA);

  if (error) {
    throw new Error(
      "Erro em resultados: " +
        error.message
    );
  }

  return data || [];
}

async function carregarEleicoes() {
  const { data, error } =
    await supabase
      .from("eleicoes")
      .select(
        "id, ano, turno, codigo_tse, descricao"
      )
      .in(
        "id",
        ELEICOES
      );

  if (error) {
    throw new Error(
      "Erro em eleicoes: " +
        error.message
    );
  }

  const mapa =
    new Map();

  for (
    const row of data || []
  ) {
    mapa.set(
      row.id,
      row
    );
  }

  return mapa;
}

async function carregarCandidatos(
  ids
) {
  const mapa =
    new Map();

  if (
    ids.length === 0
  ) {
    return mapa;
  }

  for (
    let inicio = 0;
    inicio < ids.length;
    inicio += 500
  ) {
    const bloco =
      ids.slice(
        inicio,
        inicio + 500
      );

    const { data, error } =
      await supabase
        .from("candidatos")
        .select(
          `
          id,
          cargo_id,
          numero,
          nome,
          tipo_votavel
          `
        )
        .in(
          "id",
          bloco
        );

    if (error) {
      throw new Error(
        "Erro em candidatos: " +
          error.message
      );
    }

    for (
      const row of data ||
        []
    ) {
      mapa.set(
        row.id,
        row
      );
    }
  }

  return mapa;
}

async function carregarLocalidades(
  ids
) {
  const mapa =
    new Map();

  if (
    ids.length === 0
  ) {
    return mapa;
  }

  for (
    let inicio = 0;
    inicio < ids.length;
    inicio += 500
  ) {
    const bloco =
      ids.slice(
        inicio,
        inicio + 500
      );

    const { data, error } =
      await supabase
        .from("localidades")
        .select(
          `
          id,
          uf,
          municipio,
          codigo_municipio_tse,
          zona,
          secao,
          codigo_zona_tse,
          codigo_secao_tse
          `
        )
        .in(
          "id",
          bloco
        );

    if (error) {
      throw new Error(
        "Erro em localidades: " +
          error.message
      );
    }

    for (
      const row of data ||
        []
    ) {
      mapa.set(
        row.id,
        row
      );
    }
  }

  return mapa;
}

async function carregarCargos(
  ids
) {
  const mapa =
    new Map();

  const unicos =
    [
      ...new Set(
        ids
      ),
    ];

  if (
    unicos.length === 0
  ) {
    return mapa;
  }

  const { data, error } =
    await supabase
      .from("cargos")
      .select(
        "id, nome"
      )
      .in(
        "id",
        unicos
      );

  if (error) {
    throw new Error(
      "Erro em cargos: " +
        error.message
    );
  }

  for (
    const row of data ||
      []
  ) {
    mapa.set(
      row.id,
      row
    );
  }

  return mapa;
}

/*
 * Descobre o nome do cargo a partir
 * dos cargo_ids dos candidatos.
 */

async function main() {
  console.log(
    "\n=== EXPORTADOR HISTORICO TSE 2022 ===\n"
  );

  console.log(
    "Eleicoes:",
    ELEICOES.join(", ")
  );

  console.log(
    "Pagina:",
    PAGINA
  );

  console.log(
    "Saida:",
    ARQUIVO_SAIDA
  );

  fs.mkdirSync(
    DIRETORIO_SAIDA,
    {
      recursive: true,
    }
  );

  /*
   * Comeca um arquivo novo.
   * O script nunca altera o Supabase.
   */
  if (
    fs.existsSync(
      ARQUIVO_SAIDA
    )
  ) {
    fs.unlinkSync(
      ARQUIVO_SAIDA
    );
  }

  const writer =
    await parquet.ParquetWriter.openFile(
      schema,
      ARQUIVO_SAIDA,
      {
        rowGroupSize:
          50000,
      }
    );

  const eleicoes =
    await carregarEleicoes();

  console.log(
    "Eleicoes carregadas:",
    eleicoes.size
  );

  let ultimoId = 0;

  let total =
    0;

  let totalVotos =
    0;

  let paginas =
    0;

  while (true) {
    const resultados =
      await buscarResultados(
        ultimoId
      );

    if (
      resultados.length ===
      0
    ) {
      break;
    }

    paginas++;

    const candidatoIds =
      [
        ...new Set(
          resultados.map(
            (row) =>
              row.candidato_id
          )
        ),
      ];

    const localidadeIds =
      [
        ...new Set(
          resultados.map(
            (row) =>
              row.localidade_id
          )
        ),
      ];

    const candidatos =
      await carregarCandidatos(
        candidatoIds
      );

    const localidades =
      await carregarLocalidades(
        localidadeIds
      );

    const cargoIds =
      [
        ...new Set(
          [
            ...candidatos.values(),
          ].map(
            (row) =>
              row.cargo_id
          )
        ),
      ];

    const cargos =
      await carregarCargos(
        cargoIds
      );

    for (
      const resultado of
        resultados
    ) {
      const eleicao =
        eleicoes.get(
          resultado.eleicao_id
        );

      const candidato =
        candidatos.get(
          resultado.candidato_id
        );

      const localidade =
        localidades.get(
          resultado.localidade_id
        );

      if (
        !eleicao ||
        !candidato ||
        !localidade
      ) {
        throw new Error(
          "Relacionamento ausente para resultado " +
            resultado.id
        );
      }

      const cargo =
        cargos.get(
          candidato.cargo_id
        );

      if (!cargo) {
        throw new Error(
          "Cargo ausente para candidato " +
            candidato.id
        );
      }

      const row = {
        resultado_id:
          inteiro(
            resultado.id
          ),

        eleicao_id:
          inteiro(
            resultado.eleicao_id
          ),

        ano:
          inteiro(
            eleicao.ano
          ),

        turno:
          inteiro(
            eleicao.turno
          ),

        codigo_eleicao_tse:
          texto(
            eleicao.codigo_tse
          ),

        eleicao:
          texto(
            eleicao.descricao
          ),

        candidato_id:
          inteiro(
            resultado.candidato_id
          ),

        numero_candidato:
          inteiro(
            candidato.numero
          ),

        candidato:
          texto(
            candidato.nome
          ),

        tipo_votavel:
          texto(
            candidato.tipo_votavel
          ),

        cargo_id:
          inteiro(
            candidato.cargo_id
          ),

        cargo:
          texto(
            cargo.nome
          ),

        localidade_id:
          inteiro(
            resultado.localidade_id
          ),

        uf:
          texto(
            localidade.uf
          ),

        municipio:
          texto(
            localidade.municipio
          ),

        codigo_municipio_tse:
          texto(
            localidade.codigo_municipio_tse
          ),

        zona:
          inteiro(
            localidade.zona
          ),

        secao:
          inteiro(
            localidade.secao
          ),

        codigo_zona_tse:
          texto(
            localidade.codigo_zona_tse
          ),

        codigo_secao_tse:
          texto(
            localidade.codigo_secao_tse
          ),

        votos:
          inteiro(
            resultado.votos
          ),

        atualizado_em:
          resultado.atualizado_em
            ? new Date(
                resultado.atualizado_em
              )
            : null,

        coleta_id:
          resultado.coleta_id
            ? inteiro(
                resultado.coleta_id
              )
            : null,
      };

      await writer.appendRow(
        row
      );

      total++;

      totalVotos +=
        inteiro(
          resultado.votos
        );

      ultimoId =
        Math.max(
          ultimoId,
          inteiro(
            resultado.id
          )
        );
    }

    console.log(
      "Pagina " +
        paginas +
        ": " +
        resultados.length +
        " registros | total=" +
        total.toLocaleString(
          "pt-BR"
        ) +
        " | votos=" +
        totalVotos.toLocaleString(
          "pt-BR"
        ) +
        " | ultimo_id=" +
        ultimoId
    );
  }

  await writer.close();

  const stat =
    fs.statSync(
      ARQUIVO_SAIDA
    );

  console.log(
    "\n=== EXPORTACAO CONCLUIDA ==="
  );

  console.log(
    "Registros:",
    total.toLocaleString(
      "pt-BR"
    )
  );

  console.log(
    "Votos:",
    totalVotos.toLocaleString(
      "pt-BR"
    )
  );

  console.log(
    "Arquivo:",
    ARQUIVO_SAIDA
  );

  console.log(
    "Tamanho:",
    (
      stat.size /
      1024 /
      1024
    ).toFixed(2) +
      " MB"
  );
}

main().catch(
  (error) => {
    console.error(
      "\nERRO NA EXPORTACAO:"
    );

    console.error(
      error
    );

    process.exit(
      1
    );
  }
);