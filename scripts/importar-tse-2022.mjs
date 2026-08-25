import fs from "node:fs";
import readline from "node:readline";
import crypto from "node:crypto";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const ARQUIVO =
  process.argv[2] ||
  "./votacao_secao_2022_BR.csv";

const LIMITE =
  Number(
    process.argv[3] ||
      Number.MAX_SAFE_INTEGER
  );

const TAMANHO_LOTE =
  Number(
    process.argv[4] || 500
  );

const MAX_RETRIES = 6;
const RETRY_BASE_MS = 1500;
const TIMEOUT_MS = 45000;

const CHECKPOINT_FILE =
  "./.tse-2022-checkpoint.json";

const CHECKPOINT_VERSION = 4;

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

const BASE_URL =
  String(SUPABASE_URL) +
  "/rest/v1";

const HEADERS = {
  apikey: SUPABASE_KEY,

  Authorization:
    "Bearer " +
    SUPABASE_KEY,

  "Content-Type":
    "application/json",
};

/* =========================================================
   UTILITARIOS
========================================================= */

function dormir(ms) {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        ms
      );
    }
  );
}

function limparValor(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .replace(
      /^"|"$/g,
      ""
    )
    .trim();
}

/*
 * Parser de CSV separado por ;
 * com suporte a campos entre aspas.
 */
function parseCsvLine(line) {
  const values = [];

  let current = "";

  let quoted = false;

  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    const char =
      line[i];

    if (
      char === '"'
    ) {
      if (
        quoted &&
        line[i + 1] === '"'
      ) {
        current += '"';

        i++;

        continue;
      }

      quoted =
        !quoted;

      continue;
    }

    if (
      char === ";" &&
      !quoted
    ) {
      values.push(
        limparValor(
          current
        )
      );

      current = "";

      continue;
    }

    current += char;
  }

  values.push(
    limparValor(
      current
    )
  );

  return values;
}

/* =========================================================
   CHECKPOINT
========================================================= */

function carregarCheckpoint(
  sha256
) {
  if (
    !fs.existsSync(
      CHECKPOINT_FILE
    )
  ) {
    return {
      lastLine: 0,
    };
  }

  try {
    const raw =
      fs.readFileSync(
        CHECKPOINT_FILE,
        "utf8"
      );

    const data =
      JSON.parse(raw);

    if (
      data.version !==
      CHECKPOINT_VERSION
    ) {
      return {
        lastLine: 0,
      };
    }

    if (
      data.sha256 !==
      sha256
    ) {
      console.log(
        "Checkpoint pertence a outro arquivo. Iniciando do começo."
      );

      return {
        lastLine: 0,
      };
    }

    return {
      lastLine:
        Number(
          data.lastLine ||
            0
        ),
    };
  } catch {
    return {
      lastLine: 0,
    };
  }
}

function salvarCheckpoint(
  lineNumber,
  sha256
) {
  fs.writeFileSync(
    CHECKPOINT_FILE,

    JSON.stringify(
      {
        version:
          CHECKPOINT_VERSION,

        arquivo:
          ARQUIVO,

        sha256,

        lastLine:
          lineNumber,

        updatedAt:
          new Date().toISOString(),
      },

      null,

      2
    ),

    "utf8"
  );
}

function removerCheckpoint() {
  if (
    fs.existsSync(
      CHECKPOINT_FILE
    )
  ) {
    fs.unlinkSync(
      CHECKPOINT_FILE
    );
  }
}

/* =========================================================
   SUPABASE COM RETRY
========================================================= */

async function supabase(
  table,
  options = {}
) {
  const method =
    options.method ||
    "GET";

  const params =
    options.params ||
    "";

  const body =
    options.body;

  const prefer =
    options.prefer;

  let ultimoErro =
    null;

  for (
    let tentativa = 1;
    tentativa <=
      MAX_RETRIES;
    tentativa++
  ) {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        TIMEOUT_MS
      );

    try {
      const response =
        await fetch(
          BASE_URL +
            "/" +
            table +
            params,

          {
            method,

            headers: {
              ...HEADERS,

              ...(prefer
                ? {
                    Prefer:
                      prefer,
                  }
                : {}),
            },

            body:
              body ===
              undefined
                ? undefined
                : JSON.stringify(
                    body
                  ),

            signal:
              controller.signal,
          }
        );

      clearTimeout(
        timeout
      );

      const text =
        await response.text();

      let data =
        null;

      if (text) {
        try {
          data =
            JSON.parse(
              text
            );
        } catch {
          data =
            text;
        }
      }

      if (
        response.ok
      ) {
        return data;
      }

      const retryable =
        response.status ===
          408 ||
        response.status ===
          429 ||
        response.status >=
          500;

      if (
        !retryable
      ) {
        throw new Error(
          "Supabase " +
            response.status +
            " em " +
            table +
            ": " +
            JSON.stringify(
              data
            )
        );
      }

      ultimoErro =
        new Error(
          "Supabase " +
            response.status +
            " em " +
            table +
            ": " +
            JSON.stringify(
              data
            )
        );
    } catch (error) {
      clearTimeout(
        timeout
      );

      ultimoErro =
        error instanceof Error
          ? error
          : new Error(
              String(error)
            );
    }

    if (
      tentativa <
      MAX_RETRIES
    ) {
      const espera =
        RETRY_BASE_MS *
        Math.pow(
          2,
          tentativa - 1
        );

      console.log(
        "Falha de comunicacao com Supabase. " +
          "Tentativa " +
          tentativa +
          "/" +
          MAX_RETRIES +
          ". Nova tentativa em " +
          espera +
          " ms."
      );

      await dormir(
        espera
      );
    }
  }

  throw new Error(
    "Falha apos " +
      MAX_RETRIES +
      " tentativas em " +
      table +
      ": " +
      (
        ultimoErro
          ? ultimoErro.message
          : "erro desconhecido"
      )
  );
}

/* =========================================================
   SHA-256
========================================================= */

function calcularHashArquivo(
  arquivo
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const hash =
        crypto.createHash(
          "sha256"
        );

      const stream =
        fs.createReadStream(
          arquivo
        );

      stream.on(
        "data",
        (chunk) => {
          hash.update(
            chunk
          );
        }
      );

      stream.on(
        "end",
        () => {
          resolve(
            hash.digest(
              "hex"
            )
          );
        }
      );

      stream.on(
        "error",
        reject
      );
    }
  );
}

/* =========================================================
   ELEICOES
========================================================= */

const ELECTIONS = {
  "544": {
    codigo:
      "544",

    turno: 1,

    descricao:
      "Eleições Gerais 2022 - 1º Turno",
  },

  "545": {
    codigo:
      "545",

    turno: 2,

    descricao:
      "Eleições Gerais 2022 - 2º Turno",
  },
};

async function buscarOuCriarEleicao(
  definition
) {
  const params =
    "?ano=eq.2022" +
    "&turno=eq." +
    definition.turno +
    "&codigo_tse=eq." +
    encodeURIComponent(
      definition.codigo
    ) +
    "&limit=1";

  const existentes =
    await supabase(
      "eleicoes",
      {
        params,
      }
    );

  if (
    existentes.length >
    0
  ) {
    const existente =
      existentes[0];

    await supabase(
      "eleicoes",
      {
        method:
          "PATCH",

        params:
          "?id=eq." +
          existente.id,

        body: {
          descricao:
            definition.descricao,

          status:
            "encerrada",

          codigo_tse:
            definition.codigo,

          tipo:
            "ELEIÇÃO ORDINÁRIA",

          fonte:
            "TSE",

          ambiente:
            "oficial",
        },

        prefer:
          "return=minimal",
      }
    );

    return {
      ...existente,

      descricao:
        definition.descricao,

      codigo_tse:
        definition.codigo,

      turno:
        definition.turno,
    };
  }

  const criada =
    await supabase(
      "eleicoes",
      {
        method:
          "POST",

        body: {
          ano: 2022,

          turno:
            definition.turno,

          descricao:
            definition.descricao,

          status:
            "encerrada",

          codigo_tse:
            definition.codigo,

          tipo:
            "ELEIÇÃO ORDINÁRIA",

          fonte:
            "TSE",

          ambiente:
            "oficial",
        },

        prefer:
          "return=representation",
      }
    );

  return criada[0];
}

/* =========================================================
   CARGO
========================================================= */

async function buscarOuCriarCargo() {
  const existentes =
    await supabase(
      "cargos",
      {
        params:
          "?nome=eq.PRESIDENTE&limit=1",
      }
    );

  if (
    existentes.length >
    0
  ) {
    return existentes[0];
  }

  const criado =
    await supabase(
      "cargos",
      {
        method:
          "POST",

        body: {
          nome:
            "PRESIDENTE",
        },

        prefer:
          "return=representation",
      }
    );

  return criado[0];
}

/* =========================================================
   TIPO VOTAVEL
========================================================= */

function detectarTipoVotavel(
  numero
) {
  if (
    numero === "95"
  ) {
    return "branco";
  }

  if (
    numero === "96"
  ) {
    return "nulo";
  }

  return "candidato";
}

/* =========================================================
   CANDIDATOS
========================================================= */

async function prepararCandidatos(
  cargoId,
  eleicao,
  itens,
  cache
) {
  const unicos =
    new Map();

  for (
    const item of
      itens
  ) {
    const chave =
      [
        eleicao.id,
        cargoId,
        item.numero,
      ].join("|");

    if (
      !unicos.has(
        chave
      )
    ) {
      unicos.set(
        chave,
        item
      );
    }
  }

  for (
    const [
      chave,
      item,
    ] of unicos
  ) {
    if (
      cache.has(chave)
    ) {
      continue;
    }

    const existentes =
      await supabase(
        "candidatos",
        {
          params:
            "?cargo_id=eq." +
            cargoId +
            "&eleicao_id=eq." +
            eleicao.id +
            "&numero=eq." +
            item.numero +
            "&limit=1",
        }
      );

    if (
      existentes.length >
      0
    ) {
      cache.set(
        chave,
        existentes[0]
      );

      continue;
    }

    /*
     * IMPORTANTE:
     * o nome vem do próprio CSV.
     * Nunca enviamos null para candidatos.nome.
     */
    const nome =
      item.nome &&
      item.nome.trim()
        ? item.nome.trim()
        : null;

    if (!nome) {
      throw new Error(
        "Nome do candidato ausente para " +
          "eleicao=" +
          eleicao.id +
          ", cargo=" +
          cargoId +
          ", numero=" +
          item.numero +
          "."
      );
    }

    const criado =
      await supabase(
        "candidatos",
        {
          method:
            "POST",

          body: {
            cargo_id:
              cargoId,

            eleicao_id:
              eleicao.id,

            numero:
              item.numero,

            nome,

            nome_urna:
              nome,

            partido:
              null,

            tipo_votavel:
              item.tipoVotavel,

            sq_candidato_tse:
              item.sqCandidato ||
              null,
          },

          prefer:
            "return=representation",
        }
      );

    cache.set(
      chave,
      criado[0]
    );
  }
}

/* =========================================================
   LOCALIDADES
========================================================= */

function montarChaveLocalidade(
  item
) {
  return [
    item.uf,
    item.codigoMunicipio,
    item.municipio,
    item.zona,
    item.secao,
  ].join("|");
}

async function carregarLocalidades(
  cache
) {
  let offset = 0;

  const pageSize =
    1000;

  while (true) {
    const params =
      "?select=id,uf,municipio,zona,secao,codigo_municipio_tse,codigo_zona_tse,codigo_secao_tse" +
      "&order=id.asc" +
      "&offset=" +
      offset +
      "&limit=" +
      pageSize;

    const rows =
      await supabase(
        "localidades",
        {
          params,
        }
      );

    if (
      !Array.isArray(
        rows
      ) ||
      rows.length ===
        0
    ) {
      break;
    }

    for (
      const row of
        rows
    ) {
      const fullKey =
        [
          row.uf,
          row.codigo_municipio_tse ||
            "",
          row.municipio,
          row.zona,
          row.secao,
        ].join("|");

      const shortKey =
        [
          row.uf,
          row.municipio,
          row.zona,
          row.secao,
        ].join("|");

      cache.set(
        fullKey,
        row
      );

      if (
        !cache.has(
          shortKey
        )
      ) {
        cache.set(
          shortKey,
          row
        );
      }
    }

    offset +=
      rows.length;

    if (
      rows.length <
      pageSize
    ) {
      break;
    }
  }

  console.log(
    "Localidades carregadas do Supabase: " +
      cache.size.toLocaleString(
        "pt-BR"
      )
  );
}

async function prepararLocalidades(
  itens,
  cache
) {
  const faltantes =
    new Map();

  for (
    const item of
      itens
  ) {
    const fullKey =
      montarChaveLocalidade(
        item
      );

    const shortKey =
      [
        item.uf,
        item.municipio,
        item.zona,
        item.secao,
      ].join("|");

    if (
      cache.has(
        fullKey
      )
    ) {
      continue;
    }

    if (
      cache.has(
        shortKey
      )
    ) {
      const existente =
        cache.get(
          shortKey
        );

      cache.set(
        fullKey,
        existente
      );

      continue;
    }

    faltantes.set(
      fullKey,
      item
    );
  }

  if (
    faltantes.size ===
    0
  ) {
    return;
  }

  /*
   * Criamos em sublotes de até 100.
   * Isso reduz o risco de payload muito grande.
   */
  const items =
    Array.from(
      faltantes.values()
    );

  const CHUNK =
    100;

  for (
    let inicio = 0;
    inicio < items.length;
    inicio += CHUNK
  ) {
    const bloco =
      items.slice(
        inicio,
        inicio +
          CHUNK
      );

    const payload =
      bloco.map(
        (item) => ({
          uf:
            item.uf,

          municipio:
            item.municipio,

          zona:
            item.zona,

          secao:
            item.secao,

          codigo_municipio_tse:
            item.codigoMunicipio,

          codigo_municipio_ibge:
            null,

          codigo_zona_tse:
            String(
              item.zona
            ),

          codigo_secao_tse:
            String(
              item.secao
            ),

          fonte:
            "TSE",
        })
      );

    const criadas =
      await supabase(
        "localidades",
        {
          method:
            "POST",

          body:
            payload,

          prefer:
            "return=representation",
        }
      );

    for (
      const row of
        criadas
    ) {
      const fullKey =
        [
          row.uf,
          row.codigo_municipio_tse ||
            "",
          row.municipio,
          row.zona,
          row.secao,
        ].join("|");

      const shortKey =
        [
          row.uf,
          row.municipio,
          row.zona,
          row.secao,
        ].join("|");

      cache.set(
        fullKey,
        row
      );

      cache.set(
        shortKey,
        row
      );
    }
  }
}

/* =========================================================
   COLETA
========================================================= */

async function criarOuReutilizarColeta(
  arquivo,
  sha256,
  eleicaoTurno1
) {
  const nome =
    arquivo
      .split(
        /[\\/]/
      )
      .pop();

  const existentes =
    await supabase(
      "coletas",
      {
        params:
          "?sha256=eq." +
          encodeURIComponent(
            sha256
          ) +
          "&limit=1",
      }
    );

  if (
    existentes.length >
    0
  ) {
    const coleta =
      existentes[0];

    console.log(
      "Coleta existente encontrada: " +
        coleta.id
    );

    await supabase(
      "coletas",
      {
        method:
          "PATCH",

        params:
          "?id=eq." +
          coleta.id,

        body: {
          eleicao_id:
            eleicaoTurno1.id,

          status:
            "recebido",

          mensagem:
            "Arquivo TSE 2022 contendo 1º e 2º turnos.",

          processado_em:
            null,
        },

        prefer:
          "return=minimal",
      }
    );

    return coleta;
  }

  const criada =
    await supabase(
      "coletas",
      {
        method:
          "POST",

        body: {
          eleicao_id:
            eleicaoTurno1.id,

          origem:
            "TSE",

          arquivo:
            nome,

          tipo_arquivo:
            "votacao_secao",

          url_origem:
            null,

          idg:
            null,

          etag:
            null,

          last_modified:
            null,

          sha256,

          status:
            "recebido",

          mensagem:
            "Arquivo TSE 2022 contendo 1º e 2º turnos.",
        },

        prefer:
          "return=representation",
      }
    );

  return criada[0];
}

/* =========================================================
   RESULTADOS EM LOTE
========================================================= */

async function inserirResultadosEmLote(
  registros
) {
  if (
    registros.length ===
    0
  ) {
    return;
  }

  const params =
    "?on_conflict=" +
    [
      "eleicao_id",
      "candidato_id",
      "localidade_id",
    ].join(",");

  await supabase(
    "resultados",
    {
      method:
        "POST",

      params,

      body:
        registros,

      prefer:
        "resolution=ignore-duplicates,return=minimal",
    }
  );
}

/* =========================================================
   ATUALIZAR COLETA
========================================================= */

async function atualizarColeta(
  coletaId,
  status,
  mensagem
) {
  await supabase(
    "coletas",
    {
      method:
        "PATCH",

      params:
        "?id=eq." +
        coletaId,

      body: {
        status,

        mensagem,

        processado_em:
          status ===
          "processado"
            ? new Date().toISOString()
            : null,
      },

      prefer:
        "return=minimal",
    }
  );

  console.log(
    "Coleta " +
      coletaId +
      ": " +
      status
  );
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  console.log(
    "\n=== IMPORTADOR TSE 2022 - 2 TURNOS ===\n"
  );

  console.log(
    "Arquivo:",
    ARQUIVO
  );

  console.log(
    "Limite desta execucao:",
    LIMITE ===
    Number.MAX_SAFE_INTEGER
      ? "arquivo completo"
      : LIMITE.toLocaleString(
          "pt-BR"
        )
  );

  console.log(
    "Tamanho do lote:",
    TAMANHO_LOTE.toLocaleString(
      "pt-BR"
    )
  );

  console.log(
    "Retries:",
    MAX_RETRIES
  );

  console.log(
    "\nCalculando SHA-256..."
  );

  const sha256 =
    await calcularHashArquivo(
      ARQUIVO
    );

  console.log(
    "SHA-256:",
    sha256
  );

  const checkpoint =
    carregarCheckpoint(
      sha256
    );

  const linhaInicial =
    checkpoint.lastLine;

  console.log(
    "Checkpoint:",
    linhaInicial
  );

  const elections =
    new Map();

  const election1 =
    await buscarOuCriarEleicao(
      ELECTIONS["544"]
    );

  const election2 =
    await buscarOuCriarEleicao(
      ELECTIONS["545"]
    );

  elections.set(
    "544",
    election1
  );

  elections.set(
    "545",
    election2
  );

  console.log(
    "Eleicao 544: id=" +
      election1.id +
      " | turno=" +
      election1.turno
  );

  console.log(
    "Eleicao 545: id=" +
      election2.id +
      " | turno=" +
      election2.turno
  );

  const cargo =
    await buscarOuCriarCargo();

  console.log(
    "Cargo: id=" +
      cargo.id +
      " | " +
      cargo.nome
  );

  const coleta =
    await criarOuReutilizarColeta(
      ARQUIVO,
      sha256,
      election1
    );

  console.log(
    "Coleta: id=" +
      coleta.id
  );

  const localityCache =
    new Map();

  console.log(
    "\nCarregando localidades existentes..."
  );

  await carregarLocalidades(
    localityCache
  );

  const stream =
  fs.createReadStream(
    ARQUIVO,
    {
      encoding:
        "latin1",
    }
  );

  const reader =
    readline.createInterface({
      input:
        stream,

      crlfDelay:
        Infinity,
    });

  let header =
    null;

  let fileLine =
    0;

  let considered =
    0;

  let valid =
    0;

  let invalid =
    0;

  let sent =
    0;

  let batches =
    0;

  let discardedElection =
    0;

  let discardedFields =
    0;

  let discardedStructure =
    0;

  let stoppedByLimit =
    false;

  const candidateCache =
    new Map();

  let batch =
    [];

  async function flush() {
    if (
      batch.length ===
      0
    ) {
      return;
    }

    /*
     * Preparar candidatos por eleição.
     */
    const groups =
      new Map();

    for (
      const item of
        batch
    ) {
      const code =
        item.election.codigo_tse;

      if (
        !groups.has(code)
      ) {
        groups.set(
          code,
          []
        );
      }

      groups
        .get(code)
        .push(item);
    }

    for (
      const [
        code,
        items,
      ] of groups
    ) {
      const election =
        elections.get(code);

      if (
        !election
      ) {
        throw new Error(
          "Eleicao nao encontrada: " +
            code
        );
      }

      await prepararCandidatos(
        cargo.id,
        election,
        items,
        candidateCache
      );
    }

    /*
     * Preparar localidades.
     */
    const localidadesUnicas =
      new Map();

    for (
      const item of
        batch
    ) {
      const key =
        montarChaveLocalidade(
          item
        );

      if (
        !localidadesUnicas.has(
          key
        )
      ) {
        localidadesUnicas.set(
          key,
          item
        );
      }
    }

    await prepararLocalidades(
      Array.from(
        localidadesUnicas.values()
      ),
      localityCache
    );

    /*
     * Montar resultados.
     */
    const resultRows =
      [];

    for (
      const item of
        batch
    ) {
      const candidate =
        candidateCache.get(
          item.candidateKey
        );

      const locality =
        localityCache.get(
          item.localityKey
        );

      if (
        !candidate
      ) {
        throw new Error(
          "Candidato nao encontrado: " +
            item.candidateKey
        );
      }

      if (
        !locality
      ) {
        throw new Error(
          "Localidade nao encontrada: " +
            item.localityKey
        );
      }

      resultRows.push({
        eleicao_id:
          item.election.id,

        candidato_id:
          candidate.id,

        localidade_id:
          locality.id,

        votos:
          item.votos,

        percentual:
          null,

        coleta_id:
          coleta.id,

        tipo_votavel:
          item.tipoVotavel,
      });
    }

    await inserirResultadosEmLote(
      resultRows
    );

    sent +=
      resultRows.length;

    batches++;

    const lastBatchLine =
      batch[
        batch.length - 1
      ].fileLine;

    salvarCheckpoint(
      lastBatchLine,
      sha256
    );

    console.log(
      "Lote " +
        batches +
        ": " +
        resultRows.length +
        " registros | acumulado=" +
        sent.toLocaleString(
          "pt-BR"
        ) +
        " | linha confirmada=" +
        lastBatchLine.toLocaleString(
          "pt-BR"
        )
    );

    batch = [];

    await dormir(
      75
    );
  }

  for await (
    const line of
      reader
  ) {
    fileLine++;

    if (
      !header
    ) {
      header =
        parseCsvLine(
          line
        );

      continue;
    }

    if (
      fileLine <=
      linhaInicial
    ) {
      continue;
    }

    if (
      considered >=
      LIMITE
    ) {
      stoppedByLimit =
        true;

      break;
    }

    if (
      !line.trim()
    ) {
      continue;
    }

    considered++;

    const columns =
      parseCsvLine(
        line
      );

    if (
      columns.length <
      header.length
    ) {
      invalid++;

      discardedStructure++;

      continue;
    }

    const record =
      {};

    for (
      let i = 0;
      i < header.length;
      i++
    ) {
      record[
        header[i]
      ] =
        columns[i] || "";
    }

    const year =
      record.ANO_ELEICAO;

    const electionCode =
      record.CD_ELEICAO;

    const turn =
      record.NR_TURNO;

    const cargoCode =
      record.CD_CARGO;

    if (
      year !==
      "2022"
    ) {
      discardedElection++;

      continue;
    }

    if (
      electionCode !==
        "544" &&
      electionCode !==
        "545"
    ) {
      discardedElection++;

      continue;
    }

    if (
      electionCode ===
        "544" &&
      turn !==
        "1"
    ) {
      discardedElection++;

      continue;
    }

    if (
      electionCode ===
        "545" &&
      turn !==
        "2"
    ) {
      discardedElection++;

      continue;
    }

    if (
      cargoCode !==
      "1"
    ) {
      discardedElection++;

      continue;
    }

    const election =
      elections.get(
        electionCode
      );

    if (
      !election
    ) {
      throw new Error(
        "Eleicao ausente: " +
          electionCode
      );
    }

    const uf =
      record.SG_UF;

    const municipio =
      record.NM_MUNICIPIO;

    const codigoMunicipio =
      record.CD_MUNICIPIO;

    const zona =
      Number(
        record.NR_ZONA
      );

    const secao =
      Number(
        record.NR_SECAO
      );

    const numero =
      Number(
        record.NR_VOTAVEL
      );

    const votos =
      Number(
        record.QT_VOTOS
      );

    if (
      !uf ||
      !municipio ||
      !codigoMunicipio ||
      !Number.isFinite(
        zona
      ) ||
      !Number.isFinite(
        secao
      ) ||
      !Number.isFinite(
        numero
      ) ||
      !Number.isFinite(
        votos
      )
    ) {
      invalid++;

      discardedFields++;

      continue;
    }

    const tipoVotavel =
      detectarTipoVotavel(
        record.NR_VOTAVEL
      );

    /*
     * Agora guardamos nome e SQ_CANDIDATO
     * dentro do batch. Isso corrige o erro
     * que estava enviando nome = null.
     */
    const candidateKey =
      [
        election.id,
        cargo.id,
        numero,
      ].join("|");

    const localityData =
      {
        uf,

        municipio,

        codigoMunicipio,

        zona,

        secao,
      };

    const localKey =
      montarChaveLocalidade(
        localityData
      );

    batch.push({
      fileLine,

      election,

      candidateKey,

      localityKey:
        localKey,

      numero,

      nome:
        record.NM_VOTAVEL,

      sqCandidato:
        record.SQ_CANDIDATO,

      votos,

      tipoVotavel,

      ...localityData,
    });

    valid++;

    if (
      batch.length >=
      TAMANHO_LOTE
    ) {
      await flush();
    }

    if (
      fileLine % 5000 ===
      0
    ) {
      console.log(
        "Linha=" +
          fileLine.toLocaleString(
            "pt-BR"
          ) +
          " | validas=" +
          valid.toLocaleString(
            "pt-BR"
          ) +
          " | invalidas=" +
          invalid.toLocaleString(
            "pt-BR"
          )
      );
    }
  }

  await flush();

  console.log(
    "\n=== RESUMO ==="
  );

  console.log(
    "Ultima linha lida: " +
      fileLine.toLocaleString(
        "pt-BR"
      )
  );

  console.log(
    "Linhas consideradas: " +
      considered.toLocaleString(
        "pt-BR"
      )
  );

  console.log(
    "Linhas validas: " +
      valid.toLocaleString(
        "pt-BR"
      )
  );

  console.log(
    "Linhas invalidas: " +
      invalid.toLocaleString(
        "pt-BR"
      )
  );

  console.log(
    "Registros enviados: " +
      sent.toLocaleString(
        "pt-BR"
      )
  );

  console.log(
    "Lotes enviados: " +
      batches.toLocaleString(
        "pt-BR"
      )
  );

  console.log(
    "Descartes de eleicao/turno/cargo: " +
      discardedElection.toLocaleString(
        "pt-BR"
      )
  );

  console.log(
    "Descartes de campos: " +
      discardedFields.toLocaleString(
        "pt-BR"
      )
  );

  console.log(
    "Descartes de estrutura: " +
      discardedStructure.toLocaleString(
        "pt-BR"
      )
  );

  if (
    stoppedByLimit
  ) {
    await atualizarColeta(
      coleta.id,

      "recebido",

      "Execucao parcial. " +
        "Checkpoint preservado para retomada."
    );

    console.log(
      "\nExecucao parcial. Checkpoint preservado."
    );
  } else {
    await atualizarColeta(
      coleta.id,

      "processado",

      "Importacao completa TSE 2022 concluida. " +
        "1o e 2o turnos processados."
    );

    removerCheckpoint();

    console.log(
      "\nImportacao completa finalizada."
    );

    console.log(
      "Checkpoint removido."
    );
  }

  console.log(
    "\n=== FIM ===\n"
  );
}

main().catch(
  (error) => {
    console.error(
      "\nERRO:"
    );

    console.error(
      error
    );

    console.error(
      "\nO checkpoint foi preservado para retomada."
    );

    process.exit(
      1
    );
  }
);
