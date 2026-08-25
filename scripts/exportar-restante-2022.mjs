import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import nextEnv from "@next/env";
import parquet from "parquetjs-lite";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const ARQUIVO =
  "./votacao_secao_2022_BR.csv";

const LINHA_INICIAL =
  4405001;

const DIRETORIO_SAIDA =
  "./data/historico";

const ARQUIVO_SAIDA =
  path.join(
    DIRETORIO_SAIDA,
    "tse-2022-restante.parquet"
  );

const schema =
  new parquet.ParquetSchema({
    linha_csv: {
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

    uf: {
      type: "UTF8",
    },

    codigo_municipio_tse: {
      type: "UTF8",
    },

    municipio: {
      type: "UTF8",
    },

    zona: {
      type: "INT32",
    },

    secao: {
      type: "INT32",
    },

    codigo_cargo_tse: {
      type: "UTF8",
    },

    cargo: {
      type: "UTF8",
    },

    numero_votavel: {
      type: "INT32",
    },

    nome_votavel: {
      type: "UTF8",
    },

    tipo_votavel: {
      type: "UTF8",
    },

    sq_candidato_tse: {
      type: "UTF8",
      optional: true,
    },

    votos: {
      type: "INT64",
    },

    numero_local_votacao: {
      type: "UTF8",
      optional: true,
    },

    codigo_local_votacao: {
      type: "UTF8",
      optional: true,
    },

    local_votacao: {
      type: "UTF8",
      optional: true,
    },

    endereco_local_votacao: {
      type: "UTF8",
      optional: true,
    },
  });

function limpar(
  valor
) {
  if (
    valor ===
      undefined ||
    valor === null
  ) {
    return "";
  }

  return String(valor)
    .replace(/^"|"$/g, "")
    .trim();
}

function inteiro(
  valor
) {
  const numero =
    Number(valor);

  return Number.isFinite(
    numero
  )
    ? Math.trunc(numero)
    : 0;
}

function tipoVotavel(
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

function parseCsvLine(
  linha
) {
  const values = [];

  let atual = "";

  let entreAspas =
    false;

  for (
    let i = 0;
    i < linha.length;
    i++
  ) {
    const char =
      linha[i];

    if (
      char === '"'
    ) {
      if (
        entreAspas &&
        linha[i + 1] === '"'
      ) {
        atual += '"';

        i++;

        continue;
      }

      entreAspas =
        !entreAspas;

      continue;
    }

    if (
      char === ";" &&
      !entreAspas
    ) {
      values.push(
        limpar(atual)
      );

      atual = "";

      continue;
    }

    atual += char;
  }

  values.push(
    limpar(atual)
  );

  return values;
}

function calcularHash(
  arquivo
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const hash =
        require("node:crypto")
          .createHash(
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

async function main() {
  console.log(
    "\n=== EXPORTANDO RESTANTE TSE 2022 ===\n"
  );

  console.log(
    "Arquivo:",
    ARQUIVO
  );

  console.log(
    "Começando na linha:",
    LINHA_INICIAL.toLocaleString(
      "pt-BR"
    )
  );

  console.log(
    "Saída:",
    ARQUIVO_SAIDA
  );

  fs.mkdirSync(
    DIRETORIO_SAIDA,
    {
      recursive: true,
    }
  );

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

  /*
   * utf8 nao sera usado aqui.
   * O teste anterior confirmou que o arquivo
   * precisa ser lido como latin1.
   */
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

  let cabecalho =
    null;

  let linha =
    0;

  let exportadas =
    0;

  let votosTotal =
    0;

  let descartadas =
    0;

  for await (
    const textoLinha of
      reader
  ) {
    linha++;

    if (
      !cabecalho
    ) {
      cabecalho =
        parseCsvLine(
          textoLinha
        );

      continue;
    }

    if (
      linha <=
      LINHA_INICIAL
    ) {
      continue;
    }

    if (
      !textoLinha.trim()
    ) {
      continue;
    }

    const colunas =
      parseCsvLine(
        textoLinha
      );

    if (
      colunas.length <
      cabecalho.length
    ) {
      descartadas++;

      continue;
    }

    const registro =
      {};

    for (
      let i = 0;
      i < cabecalho.length;
      i++
    ) {
      registro[
        cabecalho[i]
      ] =
        colunas[i] ??
        "";
    }

    /*
     * O arquivo inteiro já foi validado:
     * 544 = turno 1
     * 545 = turno 2
     */
    if (
      registro.ANO_ELEICAO !==
        "2022" ||
      (
        registro.CD_ELEICAO !==
          "544" &&
        registro.CD_ELEICAO !==
          "545"
      ) ||
      (
        registro.CD_ELEICAO ===
          "544" &&
        registro.NR_TURNO !==
          "1"
      ) ||
      (
        registro.CD_ELEICAO ===
          "545" &&
        registro.NR_TURNO !==
          "2"
      ) ||
      registro.CD_CARGO !==
        "1"
    ) {
      descartadas++;

      continue;
    }

    const votos =
      inteiro(
        registro.QT_VOTOS
      );

    const row = {
      linha_csv:
        linha,

      ano:
        inteiro(
          registro.ANO_ELEICAO
        ),

      turno:
        inteiro(
          registro.NR_TURNO
        ),

      codigo_eleicao_tse:
        limpar(
          registro.CD_ELEICAO
        ),

      eleicao:
        limpar(
          registro.DS_ELEICAO
        ),

      uf:
        limpar(
          registro.SG_UF
        ),

      codigo_municipio_tse:
        limpar(
          registro.CD_MUNICIPIO
        ),

      municipio:
        limpar(
          registro.NM_MUNICIPIO
        ),

      zona:
        inteiro(
          registro.NR_ZONA
        ),

      secao:
        inteiro(
          registro.NR_SECAO
        ),

      codigo_cargo_tse:
        limpar(
          registro.CD_CARGO
        ),

      cargo:
        limpar(
          registro.DS_CARGO
        ),

      numero_votavel:
        inteiro(
          registro.NR_VOTAVEL
        ),

      nome_votavel:
        limpar(
          registro.NM_VOTAVEL
        ),

      tipo_votavel:
        tipoVotavel(
          limpar(
            registro.NR_VOTAVEL
          )
        ),

      sq_candidato_tse:
        limpar(
          registro.SQ_CANDIDATO
        ) || null,

      votos,

      numero_local_votacao:
        limpar(
          registro.NR_LOCAL_VOTACAO
        ) || null,

      codigo_local_votacao:
        limpar(
          registro.SQ_CANDIDATO
        ) || null,

      local_votacao:
        limpar(
          registro.NM_LOCAL_VOTACAO
        ) || null,

      endereco_local_votacao:
        limpar(
          registro.DS_LOCAL_VOTACAO_ENDERECO
        ) || null,
    };

    await writer.appendRow(
      row
    );

    exportadas++;

    votosTotal +=
      votos;

    if (
      exportadas %
        50000 ===
      0
    ) {
      console.log(
        "Exportadas=" +
          exportadas.toLocaleString(
            "pt-BR"
          ) +
          " | linha=" +
          linha.toLocaleString(
            "pt-BR"
          ) +
          " | votos=" +
          votosTotal.toLocaleString(
            "pt-BR"
          )
      );
    }
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
    "Ultima linha lida:",
    linha.toLocaleString(
      "pt-BR"
    )
  );

  console.log(
    "Registros exportados:",
    exportadas.toLocaleString(
      "pt-BR"
    )
  );

  console.log(
    "Votos:",
    votosTotal.toLocaleString(
      "pt-BR"
    )
  );

  console.log(
    "Descartadas:",
    descartadas.toLocaleString(
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

    process.exit(1);
  }
);