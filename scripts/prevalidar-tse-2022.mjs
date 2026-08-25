import fs from "node:fs";
import readline from "node:readline";

const arquivo =
  process.argv[2] ||
  "./votacao_secao_2022_BR.csv";

const limite =
  Number(process.argv[3] || 50000);

const stream =
  fs.createReadStream(
    arquivo,
    {
      encoding: "utf8",
    }
  );

const rl =
  readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

let cabecalho = null;
let linhas = 0;
let linhasValidas = 0;
let linhasInvalidas = 0;
let votosTotal = 0;

const estados =
  new Set();

const municipios =
  new Set();

const cargos =
  new Set();

const candidatos =
  new Set();

const secoes =
  new Set();

const municipiosPorCodigo =
  new Set();

for await (
  const linha of rl
) {
  if (!cabecalho) {
    cabecalho =
      linha.split(";").map(
        (valor) =>
          valor
            .replace(/^"|"$/g, "")
            .trim()
      );

    continue;
  }

  if (
    linhas >= limite
  ) {
    break;
  }

  linhas++;

  if (!linha.trim()) {
    continue;
  }

  const colunas =
    linha
      .split(";")
      .map((valor) =>
        valor
          .replace(/^"|"$/g, "")
          .trim()
      );

  if (
    colunas.length <
    cabecalho.length
  ) {
    linhasInvalidas++;
    continue;
  }

  linhasValidas++;

  const registro =
    Object.fromEntries(
      cabecalho.map(
        (
          coluna,
          index
        ) => [
          coluna,
          colunas[index],
        ]
      )
    );

  estados.add(
    registro.SG_UF
  );

  municipios.add(
    `${registro.SG_UF}|${registro.CD_MUNICIPIO}|${registro.NM_MUNICIPIO}`
  );

  municipiosPorCodigo.add(
    registro.CD_MUNICIPIO
  );

  cargos.add(
    `${registro.CD_CARGO}|${registro.DS_CARGO}`
  );

  candidatos.add(
    `${registro.SQ_CANDIDATO}|${registro.NR_VOTAVEL}|${registro.NM_VOTAVEL}`
  );

  secoes.add(
    `${registro.SG_UF}|${registro.CD_MUNICIPIO}|${registro.NR_ZONA}|${registro.NR_SECAO}`
  );

  const votos =
    Number(
      registro.QT_VOTOS
    );

  if (
    Number.isFinite(votos)
  ) {
    votosTotal += votos;
  }
}

console.log(
  "\n=== PRÉ-VALIDAÇÃO TSE 2022 ===\n"
);

console.log(
  "Arquivo:",
  arquivo
);

console.log(
  "Linhas analisadas:",
  linhas.toLocaleString(
    "pt-BR"
  )
);

console.log(
  "Linhas válidas:",
  linhasValidas.toLocaleString(
    "pt-BR"
  )
);

console.log(
  "Linhas inválidas:",
  linhasInvalidas.toLocaleString(
    "pt-BR"
  )
);

console.log(
  "Estados:",
  estados.size
);

console.log(
  "Municípios distintos:",
  municipios.size
);

console.log(
  "Códigos de município:",
  municipiosPorCodigo.size
);

console.log(
  "Cargos:",
  cargos.size
);

console.log(
  "Candidatos/candidaturas:",
  candidatos.size
);

console.log(
  "Seções:",
  secoes.size
);

console.log(
  "Soma de votos:",
  votosTotal.toLocaleString(
    "pt-BR"
  )
);

console.log(
  "\nEstados encontrados:"
);

console.log(
  [...estados]
    .sort()
    .join(", ")
);

console.log(
  "\nCargos encontrados:"
);

console.log(
  [...cargos]
    .sort()
    .join("\n")
);

console.log(
  "\n=== FIM ===\n"
);