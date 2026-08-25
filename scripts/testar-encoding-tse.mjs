import fs from "node:fs";
import readline from "node:readline";

const arquivo =
  "./votacao_secao_2022_BR.csv";

const stream =
  fs.createReadStream(
    arquivo,
    {
      encoding:
        "latin1",
    }
  );

const rl =
  readline.createInterface({
    input:
      stream,
    crlfDelay:
      Infinity,
  });

let cabecalho = null;

for await (
  const linha of rl
) {
  if (!cabecalho) {
    cabecalho =
      linha
        .split(";")
        .map(
          (x) =>
            x
              .replace(/^"|"$/g, "")
              .trim()
        );

    continue;
  }

  const colunas =
    linha
      .split(";")
      .map(
        (x) =>
          x
            .replace(/^"|"$/g, "")
            .trim()
      );

  const registro =
    Object.fromEntries(
      cabecalho.map(
        (coluna, index) => [
          coluna,
          colunas[index] ?? "",
        ]
      )
    );

  if (
    registro.NR_VOTAVEL === "13"
  ) {
    console.log(
      "Candidato:",
      registro.NM_VOTAVEL
    );

    break;
  }
}