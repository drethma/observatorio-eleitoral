import { createHash } from "node:crypto";

export type TseRawJson =
  | Record<string, unknown>
  | unknown[];

export type TseSourceMetadata = {
  arquivo: string;
  url: string | null;
  etag: string | null;
  lastModified: string | null;
  sha256: string;
  coletadoEm: string;
};

export type TseNormalizedDocument = {
  tipo: string;

  metadata: TseSourceMetadata;

  dados: TseRawJson;
};

export type TseSectionReference = {
  uf: string | null;
  municipio: string | null;
  zona: number | null;
  secao: number | null;

  dataArquivo: string | null;
  horaArquivo: string | null;
};

export type TseResultCandidate = {
  numero: string;
  nome: string | null;
  votos: number | null;

  percentual: number | null;

  raw: Record<string, unknown>;
};

export type TseNormalizedResult = {
  tipo: "EA20";

  abrangencia:
    | "BR"
    | "UF"
    | "MUNICIPIO"
    | "ZONA"
    | "SECAO"
    | "DESCONHECIDA";

  uf: string | null;

  municipio: string | null;

  zona: number | null;

  secao: number | null;

  candidatos:
    TseResultCandidate[];

  totalVotos: number | null;

  raw: Record<string, unknown>;
};

/**
 * Converte qualquer valor para texto
 * sem gerar "undefined" ou "null".
 */
export function asString(
  value: unknown
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const texto =
    String(value).trim();

  return texto.length > 0
    ? texto
    : null;
}

/**
 * Converte valores numéricos do JSON.
 */
export function asNumber(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numero =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(numero)
    ? numero
    : null;
}

/**
 * Extrai um objeto quando possível.
 */
export function asRecord(
  value: unknown
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<
    string,
    unknown
  >;
}

/**
 * SHA-256 do conteúdo JSON normalizado.
 *
 * Mantemos a função aqui para que todo arquivo
 * ingerido tenha uma impressão digital própria.
 */
export function sha256Json(
  value: unknown
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(value),
      "utf8"
    )
    .digest("hex");
}

/**
 * Normaliza um documento recebido da CDN.
 *
 * Não altera o conteúdo original.
 */
export function normalizeDocument(
  input: {
    arquivo: string;
    dados: TseRawJson;
    url?: string | null;
    etag?: string | null;
    lastModified?: string | null;
  }
): TseNormalizedDocument {
  return {
    tipo:
      input.arquivo,

    metadata: {
      arquivo:
        input.arquivo,

      url:
        input.url ?? null,

      etag:
        input.etag ?? null,

      lastModified:
        input.lastModified ??
        null,

      sha256:
        sha256Json(
          input.dados
        ),

      coletadoEm:
        new Date().toISOString(),
    },

    dados:
      input.dados,
  };
}

/**
 * Procura recursivamente valores associados
 * a uma chave.
 *
 * É útil porque não vamos pressupor ainda
 * uma única posição dos campos nos JSON.
 */
export function findAllByKey(
  value: unknown,
  keys: string[]
): unknown[] {
  const encontrados: unknown[] =
    [];

  const alvo = new Set(keys);

  function visitar(
    atual: unknown
  ) {
    if (
      atual === null ||
      atual === undefined
    ) {
      return;
    }

    if (
      Array.isArray(atual)
    ) {
      for (const item of atual) {
        visitar(item);
      }

      return;
    }

    if (
      typeof atual !==
      "object"
    ) {
      return;
    }

    const objeto =
      atual as Record<
        string,
        unknown
      >;

    for (const [
      chave,
      filho,
    ] of Object.entries(
      objeto
    )) {
      if (alvo.has(chave)) {
        encontrados.push(
          filho
        );
      }

      visitar(filho);
    }
  }

  visitar(value);

  return encontrados;
}

/**
 * Extrai UF de um objeto quando encontrada
 * em nomes usuais de propriedades.
 */
export function extractUf(
  value: Record<string, unknown>
): string | null {
  const chaves = [
    "uf",
    "sg_uf",
    "sigla",
    "cd_uf",
  ];

  for (const chave of chaves) {
    const texto = asString(
      value[chave]
    );

    if (
      texto &&
      texto.length <= 3
    ) {
      return texto.toUpperCase();
    }
  }

  return null;
}

/**
 * Extrai município.
 */
export function extractMunicipio(
  value: Record<string, unknown>
): string | null {
  const chaves = [
    "municipio",
    "nm_municipio",
    "nome_municipio",
    "nm_mun",
  ];

  for (const chave of chaves) {
    const texto = asString(
      value[chave]
    );

    if (texto) {
      return texto;
    }
  }

  return null;
}

/**
 * Extrai zona.
 */
export function extractZona(
  value: Record<string, unknown>
): number | null {
  const chaves = [
    "zona",
    "nr_zona",
    "cd_zona",
  ];

  for (const chave of chaves) {
    const numero = asNumber(
      value[chave]
    );

    if (numero !== null) {
      return numero;
    }
  }

  return null;
}

/**
 * Extrai seção.
 */
export function extractSecao(
  value: Record<string, unknown>
): number | null {
  const chaves = [
    "secao",
    "seção",
    "nr_secao",
    "nr_secao",
    "cd_secao",
  ];

  for (const chave of chaves) {
    const numero = asNumber(
      value[chave]
    );

    if (numero !== null) {
      return numero;
    }
  }

  return null;
}

/**
 * Extrai referência de seção.
 *
 * Não considera isso como prova de que
 * o objeto é EA16. Apenas normaliza os
 * campos quando existirem.
 */
export function extractSectionReference(
  value: unknown
): TseSectionReference | null {
  const objeto =
    asRecord(value);

  if (!objeto) {
    return null;
  }

  const uf =
    extractUf(objeto);

  const municipio =
    extractMunicipio(
      objeto
    );

  const zona =
    extractZona(objeto);

  const secao =
    extractSecao(objeto);

  const dataArquivo =
    asString(
      objeto["da"]
    );

  const horaArquivo =
    asString(
      objeto["ha"]
    );

  const existeAlgumDado =
    Boolean(
      uf ||
        municipio ||
        zona !== null ||
        secao !== null ||
        dataArquivo ||
        horaArquivo
    );

  if (!existeAlgumDado) {
    return null;
  }

  return {
    uf,
    municipio,
    zona,
    secao,
    dataArquivo,
    horaArquivo,
  };
}

/**
 * Tenta identificar uma lista de candidatos
 * em estruturas comuns do EA20.
 *
 * Esta função é deliberadamente conservadora:
 * se não conseguirmos identificar a estrutura,
 * ela não inventa candidatos.
 */
export function extractCandidates(
  value: unknown
): TseResultCandidate[] {
  const resultado: TseResultCandidate[] =
    [];

  const candidatosPossiveis =
    findAllByKey(
      value,
      [
        "candidato",
        "candidatos",
        "cand",
      ]
    );

  for (const item of candidatosPossiveis) {
    if (Array.isArray(item)) {
      for (const candidato of item) {
        const normalizado =
          normalizeCandidate(
            candidato
          );

        if (normalizado) {
          resultado.push(
            normalizado
          );
        }
      }
    } else {
      const normalizado =
        normalizeCandidate(
          item
        );

      if (normalizado) {
        resultado.push(
          normalizado
        );
      }
    }
  }

  /*
   * Remove duplicações estruturais.
   */
  const mapa = new Map<
    string,
    TseResultCandidate
  >();

  for (const candidato of resultado) {
    const chave =
      `${candidato.numero}:${candidato.nome ?? ""}`;

    mapa.set(
      chave,
      candidato
    );
  }

  return Array.from(
    mapa.values()
  );
}

/**
 * Normaliza um candidato individual
 * somente quando conseguimos identificar
 * seu número.
 */
function normalizeCandidate(
  value: unknown
): TseResultCandidate | null {
  const objeto =
    asRecord(value);

  if (!objeto) {
    return null;
  }

  const numero =
    asString(
      objeto["numero"] ??
        objeto["nr"] ??
        objeto["num"] ??
        objeto["sq_candidato"] ??
        objeto["cd_candidato"]
    );

  if (!numero) {
    return null;
  }

  const nome =
    asString(
      objeto["nome"] ??
        objeto["nm"] ??
        objeto["nome_candidato"] ??
        objeto["nm_candidato"]
    );

  const votos =
    asNumber(
      objeto["votos"] ??
        objeto["qt_votos"] ??
        objeto["qtd_votos"] ??
        objeto["voto"]
    );

  const percentual =
    asNumber(
      objeto["percentual"] ??
        objeto["pct"] ??
        objeto["pv"]
    );

  return {
    numero,
    nome,
    votos,
    percentual,
    raw: objeto,
  };
}

/**
 * Tenta determinar a abrangência.
 */
export function detectAbrangencia(
  value: Record<string, unknown>
):
  | TseNormalizedResult["abrangencia"] {
  const abrangencia =
    asString(
      value["abrangencia"] ??
        value["abr"] ??
        value["tp_abrangencia"]
    );

  if (!abrangencia) {
    if (
      extractUf(value)
    ) {
      return "UF";
    }

    return "DESCONHECIDA";
  }

  const texto =
    abrangencia.toUpperCase();

  if (
    texto === "BR" ||
    texto === "BRASIL" ||
    texto === "FEDERAL"
  ) {
    return "BRASIL";
  }

  if (
    texto === "UF" ||
    texto === "ESTADUAL"
  ) {
    return "UF";
  }

  if (
    texto === "MUNICIPIO" ||
    texto === "MUNICÍPIO"
  ) {
    return "MUNICIPIO";
  }

  if (
    texto === "ZONA"
  ) {
    return "ZONA";
  }

  if (
    texto === "SECAO" ||
    texto === "SEÇÃO"
  ) {
    return "SECAO";
  }

  return "DESCONHECIDA";
}

/**
 * Normaliza um documento EA20.
 *
 * Não fazemos mapeamento definitivo do TSE
 * para Supabase aqui ainda.
 *
 * Primeiro preservamos o conteúdo original.
 */
export function normalizeEA20(
  dados: Record<string, unknown>
): TseNormalizedResult {
  const candidatos =
    extractCandidates(
      dados
    );

  const totalVotos =
    asNumber(
      dados["totalVotos"] ??
        dados["total_votos"] ??
        dados["vl_votos"] ??
        dados["votos"]
    );

  return {
    tipo: "EA20",

    abrangencia:
      detectAbrangencia(
        dados
      ),

    uf:
      extractUf(dados),

    municipio:
      extractMunicipio(
        dados
      ),

    zona:
      extractZona(dados),

    secao:
      extractSecao(dados),

    candidatos,

    totalVotos,

    raw:
      dados,
  };
}