import type {
  TseEnvironment,
} from "./types";

export type TseUrlConfig = {
  ambiente: TseEnvironment | "oficial";

  ciclo: string;

  eleicao: string;

  pleito?: string | null;

  baseUrl?: string;
};

export type TseScope =
  | "brasil"
  | "uf"
  | "municipio"
  | "zona"
  | "secao";

export type TseArquivo =
  | "EA14"
  | "EA15"
  | "EA16"
  | "EA18"
  | "EA20";

export type TseUrlOptions = {
  /**
   * Código da UF utilizado pelos arquivos
   * de abrangência estadual.
   *
   * Exemplo futuro:
   * SP, MG, BA...
   */
  uf?: string;

  /**
   * Código interno TSE do município.
   *
   * Não deve ser confundido com código IBGE.
   */
  municipio?: string;

  /**
   * Zona eleitoral.
   */
  zona?: string | number;

  /**
   * Seção eleitoral.
   */
  secao?: string | number;

  /**
   * Identificador adicional do arquivo,
   * quando disponibilizado pelo EA16/EA18.
   */
  idg?: string | null;
};

/**
 * Normaliza a URL base.
 */
function normalizeBaseUrl(
  value: string
): string {
  return value.replace(
    /\/+$/,
    ""
  );
}

/**
 * Garante que um componente de caminho
 * não introduza "/" indevidos.
 */
function cleanPathPart(
  value: string
): string {
  return value
    .trim()
    .replace(
      /^\/+|\/+$/g,
      ""
    );
}

/**
 * Valida parâmetros fundamentais.
 *
 * Não permitimos construir URLs sem os
 * identificadores que devem ser obtidos
 * do arquivo de configuração oficial.
 */
function validateConfig(
  config: TseUrlConfig
) {
  if (!config.ciclo) {
    throw new Error(
      "Parâmetro 'ciclo' é obrigatório para construir uma URL do TSE."
    );
  }

  if (!config.eleicao) {
    throw new Error(
      "Parâmetro 'eleicao' é obrigatório para construir uma URL do TSE."
    );
  }

  if (
    !config.ambiente ||
    !["oficial", "simulado"].includes(
      config.ambiente
    )
  ) {
    throw new Error(
      "Ambiente TSE inválido."
    );
  }
}

/**
 * Retorna o início comum da estrutura
 * de divulgação.
 *
 * ATENÇÃO:
 *
 * O caminho final de cada arquivo deve ser
 * determinado conforme o leiaute/documentação
 * vigente e os parâmetros efetivamente
 * fornecidos pelo TSE.
 */
export function createTseUrlConfig(
  input: TseUrlConfig
): TseUrlConfig {
  validateConfig(input);

  return {
    ...input,

    baseUrl:
      normalizeBaseUrl(
        input.baseUrl ??
          process.env
            .TSE_BASE_URL ??
          (
            input.ambiente ===
            "simulado"
              ? "https://resultados-sim.tse.jus.br"
              : "https://resultados.tse.jus.br/oficial"
          )
      ),
  };
}

/**
 * Cria parâmetros comuns utilizados
 * pelos endpoints internos.
 *
 * Esta função NÃO faz requisição.
 *
 * Ela somente organiza os parâmetros.
 */
export function createTsePathContext(
  config: TseUrlConfig
) {
  validateConfig(config);

  return {
    ambiente:
      cleanPathPart(
        config.ambiente
      ),

    ciclo:
      cleanPathPart(
        config.ciclo
      ),

    eleicao:
      cleanPathPart(
        config.eleicao
      ),

    pleito:
      config.pleito
        ? cleanPathPart(
            config.pleito
          )
        : null,
  };
}

/**
 * Constrói uma URL base a partir dos
 * parâmetros oficialmente identificados.
 *
 * NÃO acrescenta um nome de arquivo
 * inventado.
 */
export function buildBaseTseUrl(
  config: TseUrlConfig
): string {
  validateConfig(config);

  const base =
    normalizeBaseUrl(
      config.baseUrl ??
        process.env
          .TSE_BASE_URL ??
        (
          config.ambiente ===
          "simulado"
            ? "https://resultados-sim.tse.jus.br"
            : "https://resultados.tse.jus.br/oficial"
        )
    );

  return [
    base,
    cleanPathPart(
      config.ciclo
    ),
    `e${cleanPathPart(
      config.eleicao
    )}`,
    config.pleito
      ? `p${cleanPathPart(
          config.pleito
        )}`
      : null,
  ]
    .filter(
      (
        item
      ): item is string =>
        Boolean(item)
    )
    .join("/");
}

/**
 * Descreve qual tipo de arquivo estamos
 * preparando para consumir.
 *
 * Por enquanto, esta função não cria
 * o caminho final do arquivo.
 *
 * Isso é intencional: a documentação
 * específica de cada EA define os componentes
 * adicionais da URL.
 */
export function describeTseArquivo(
  arquivo: TseArquivo,
  scope?: TseScope
) {
  const descricoes: Record<
    TseArquivo,
    string
  > = {
    EA14:
      "Acompanhamento Brasil",

    EA15:
      "Acompanhamento UF",

    EA16:
      "Configuração de seções eleitorais",

    EA18:
      "Arquivo auxiliar de seção",

    EA20:
      "Resultado unificado",
  };

  return {
    arquivo,

    scope:
      scope ?? null,

    descricao:
      descricoes[arquivo],
  };
}

/**
 * Valida se os parâmetros fornecidos
 * são suficientes para determinado arquivo.
 *
 * Isto é usado antes de montar uma URL,
 * justamente para evitar chamadas 404
 * acidentais.
 */
export function validateArquivoParameters(
  arquivo: TseArquivo,
  options: TseUrlOptions
) {
  switch (arquivo) {
    case "EA14":
      return {
        valido: true,
        faltantes: [],
      };

    case "EA15":
      if (!options.uf) {
        return {
          valido: false,

          faltantes: [
            "uf",
          ],
        };
      }

      return {
        valido: true,
        faltantes: [],
      };

    case "EA16":
      if (!options.uf) {
        return {
          valido: false,

          faltantes: [
            "uf",
          ],
        };
      }

      return {
        valido: true,
        faltantes: [],
      };

    case "EA18":
      if (!options.uf) {
        return {
          valido: false,

          faltantes: [
            "uf",
          ],
        };
      }

      if (
        options.secao ===
        undefined
      ) {
        return {
          valido: false,

          faltantes: [
            "secao",
          ],
        };
      }

      return {
        valido: true,
        faltantes: [],
      };

    case "EA20":
      /*
       * O EA20 pode aparecer em diferentes
       * abrangências. Não vamos assumir aqui
       * que toda combinação município/zona/seção
       * é válida.
       *
       * O próximo parser usará EA12/EA16/EA18
       * para obter os identificadores corretos.
       */
      return {
        valido: true,
        faltantes: [],
      };

    default:
      return {
        valido: false,

        faltantes: [
          "arquivo",
        ],
      };
  }
}

/**
 * Monta um "plano" de consulta.
 *
 * Esta é a função que o futuro sincronizador
 * utilizará antes de chamar o TSE.
 *
 * Ela ainda NÃO realiza HTTP.
 */
export function createTseDownloadPlan(
  config: TseUrlConfig,
  arquivo: TseArquivo,
  options: TseUrlOptions = {}
) {
  validateConfig(config);

  const validation =
    validateArquivoParameters(
      arquivo,
      options
    );

  if (!validation.valido) {
    throw new Error(
      `Parâmetros insuficientes para ${arquivo}: ${validation.faltantes.join(
        ", "
      )}`
    );
  }

  const baseUrl =
    buildBaseTseUrl(
      config
    );

  return {
    arquivo,

    baseUrl,

    contexto:
      createTsePathContext(
        config
      ),

    parametros: {
      ...options,
    },

    prontoParaMontagem:
      true,

    urlFinal:
      null as string | null,
  };
}