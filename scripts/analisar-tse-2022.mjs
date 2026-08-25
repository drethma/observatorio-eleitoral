import fs from "node:fs";
import readline from "node:readline";

const arquivo =
  process.argv[2] ||
  "./votacao_secao_2022_BR.csv";

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
let linhasInvalidas = 0;
let votosTotal = 0;

const ufs = new Set();
const cargos = new Set();
const candidaturas = new Set();
const candidatos = new Set();
const tiposVotavel = new Set();

const municipios = new Set();
const secoes = new Set();

const votosPorCandidato =
  new Map();

const votosPorUf =
  new Map();

const votosPorCargo =
  new Map();

const valoresVotavelEspeciais =
  new Set();

for await (
  const linha of rl
) {
  if (!cabecalho) {
    cabecalho =
      linha
        .split(";")
        .map((valor) =>
          valor
            .replace(
              /^"|"$/g,
              ""
            )
            .trim()
        );

    continue;
  }

  if (!linha.trim()) {
    continue;
  }

  linhas++;

  const colunas =
    linha
      .split(";")
      .map((valor) =>
        valor
          .replace(
            /^"|"$/g,
            ""
          )
          .trim()
      );

  if (
    colunas.length <
    cabecalho.length
  ) {
    linhasInvalidas++;
    continue;
  }

  const r =
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

  const uf =
    r.SG_UF;

  const cargo =
    r.CD_CARGO;

  const cargoNome =
    r.DS_CARGO;

  const nrVotavel =
    r.NR_VOTAVEL;

  const nomeVotavel =
    r.NM_VOTAVEL;

  const sqCandidato =
    r.SQ_CANDIDATO;

  const votos =
    Number(
      r.QT_VOTOS
    );

  ufs.add(uf);

  cargos.add(
    `${cargo}|${cargoNome}`
  );

  municipios.add(
    `${uf}|${r.CD_MUNICIPIO}|${r.NM_MUNICIPIO}`
  );

  secoes.add(
    `${uf}|${r.CD_MUNICIPIO}|${r.NR_ZONA}|${r.NR_SECAO}`
  );

  candidaturas.add(
    `${sqCandidato}|${nrVotavel}|${nomeVotavel}`
  );

  candidatos.add(
    `${nrVotavel}|${nomeVotavel}`
  );

  tiposVotavel.add(
    nrVotavel
  );

  if (
    nrVotavel &&
    !/^\d+$/.test(
      nrVotavel
    )
  ) {
    valoresVotavelEspeciais.add(
      nrVotavel
    );
  }

  if (
    Number.isFinite(votos)
  ) {
    votosTotal += votos;

    votosPorCandidato.set(
      `${nrVotavel}|${nomeVotavel}`,
      (
        votosPorCandidato.get(
          `${nrVotavel}|${nomeVotavel}`
        ) ?? 0
      ) + votos
    );

    votosPorUf.set(
      uf,
      (
        votosPorUf.get(
          uf
        ) ?? 0
      ) + votos
    );

    votosPorCargo.set(
      `${cargo}|${cargoNome}`,
      (
        votosPorCargo.get(
          `${cargo}|${cargoNome}`
        ) ?? 0
      ) + votos
    );
  }
}

function ordenarMap(
  mapa,
  limite = 30
) {
  return [...mapa.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1]
    )
    .slice(
      0,
      limite
    );
}

console.log(
  "\n=== ANÁLISE COMPLETA TSE 2022 ===\n"
);

console.log(
  "Arquivo:",
  arquivo
);

console.log(
  "Linhas:",
  linhas.toLocaleString(
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
  "UFs:",
  ufs.size
);

console.log(
  "Municípios:",
  municipios.size
);

console.log(
  "Seções:",
  secoes.size
);

console.log(
  "Candidaturas:",
  candidaturas.size
);

console.log(
  "Candidatos:",
  candidatos.size
);

console.log(
  "Valores NR_VOTAVEL:",
  tiposVotavel.size
);

console.log(
  "Votos totais:",
  votosTotal.toLocaleString(
    "pt-BR"
  )
);

console.log(
  "\nValores especiais de NR_VOTAVEL:"
);

console.log(
  [...valoresVotavelEspeciais]
    .sort()
    .join(", ") ||
    "(nenhum)"
);

console.log(
  "\nVotos por candidato:"
);

for (
  const [
    chave,
    votos,
  ] of ordenarMap(
    votosPorCandidato,
    30
  )
) {
  console.log(
    `${chave} => ${votos.toLocaleString(
      "pt-BR"
    )}`
  );
}

console.log(
  "\nVotos por UF:"
);

for (
  const [
    uf,
    votos,
  ] of ordenarMap(
    votosPorUf,
    40
  )
) {
  console.log(
    `${uf} => ${votos.toLocaleString(
      "pt-BR"
    )}`
  );
}

console.log(
  "\nVotos por cargo:"
);

for (
  const [
    cargo,
    votos,
  ] of ordenarMap(
    votosPorCargo,
    20
  )
) {
  console.log(
    `${cargo} => ${votos.toLocaleString(
      "pt-BR"
    )}`
  );
}

console.log(
  "\n=== FIM ===\n"
);