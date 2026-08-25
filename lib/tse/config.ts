import { TseClient } from "./client";
import type {
  TseElectionConfig,
  TseFetchResult,
} from "./types";

const DEFAULT_CONFIG_PATH =
  "/comum/config/ele-c.json";

export type TseElectionEntry = {
  cd: string;
  cdpr?: string;
  dt?: string;
  dtlim?: string;
  nm?: string;
  e?: TsePleitoEntry[];
  [key: string]: unknown;
};

export type TsePleitoEntry = {
  cd: string;
  cdt2?: string;
  sqele?: string;
  nm?: string;
  t?: string;
  tp?: string;
  abr?: unknown[];
  [key: string]: unknown;
};

export type TseElection2026 = {
  ciclo: TseElectionEntry | null;
  turno1: TsePleitoEntry | null;
  turno2: TsePleitoEntry | null;
  encontrada: boolean;
};

export function getTseClient(): TseClient {
  return new TseClient();
}

export function getElectionConfigPath(): string {
  return (
    process.env.TSE_ELECTION_CONFIG_PATH ??
    DEFAULT_CONFIG_PATH
  );
}

export async function fetchElectionConfig(
  options: {
    etag?: string | null;
    lastModified?: string | null;
  } = {}
): Promise<
  TseFetchResult<TseElectionConfig>
> {
  const client = getTseClient();

  return client.getJson<TseElectionConfig>(
    getElectionConfigPath(),
    {
      etag: options.etag ?? null,
      lastModified:
        options.lastModified ?? null,
      timeoutMs: 15_000,
    }
  );
}

/**
 * Extrai os ciclos/eleições do ele-c.json.
 *
 * No arquivo atualmente recebido do TSE,
 * a lista está em "pl".
 */
export function extractElectionEntries(
  config: TseElectionConfig
): TseElectionEntry[] {
  const valor = config["pl"];

  if (!Array.isArray(valor)) {
    return [];
  }

  return valor.filter(
    (
      item
    ): item is TseElectionEntry => {
      if (
        !item ||
        typeof item !== "object"
      ) {
        return false;
      }

      const registro =
        item as Record<
          string,
          unknown
        >;

      return (
        typeof registro.cd ===
        "string"
      );
    }
  );
}

/**
 * Verifica abrangência nacional.
 */
function possuiAbrangenciaBrasil(
  pleito: TsePleitoEntry
): boolean {
  if (!Array.isArray(pleito.abr)) {
    return false;
  }

  return pleito.abr.some(
    (item) => {
      if (
        !item ||
        typeof item !== "object"
      ) {
        return false;
      }

      const abrangencia =
        item as Record<
          string,
          unknown
        >;

      return (
        String(
          abrangencia.cd ?? ""
        ).toLowerCase() ===
        "br"
      );
    }
  );
}

/**
 * Verifica se pelo menos um pleito
 * do ciclo possui abrangência nacional.
 */
function cicloPossuiAbrangenciaBrasil(
  ciclo: TseElectionEntry
): boolean {
  if (!Array.isArray(ciclo.e)) {
    return false;
  }

  return ciclo.e.some(
    (item) => {
      if (
        !item ||
        typeof item !== "object"
      ) {
        return false;
      }

      return possuiAbrangenciaBrasil(
        item as TsePleitoEntry
      );
    }
  );
}

/**
 * Normaliza texto para comparação.
 */
function normalizarTexto(
  valor: string
): string {
  return valor
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .trim();
}

/**
 * Identifica nomes que não devem ser
 * tratados como Eleição Geral.
 */
function nomeIndicaEleicaoNaoGeral(
  nome: string
): boolean {
  const normalizado =
    normalizarTexto(nome);

  const bloqueados = [
    "suplementar",
    "municipal",
    "consulta popular",
  ];

  return bloqueados.some(
    (termo) =>
      normalizado.includes(
        termo
      )
  );
}

/**
 * Detecta se o ciclo é de 2026.
 *
 * IMPORTANTE:
 * usamos somente "dt".
 *
 * "dtlim" NÃO determina o ano da eleição,
 * pois pode representar apenas o prazo
 * de validade/configuração do ciclo.
 */
function cicloEhDe2026(
  ciclo: TseElectionEntry
): boolean {
  const data =
    String(
      ciclo.dt ?? ""
    );

  const nome =
    normalizarTexto(
      String(
        ciclo.nm ?? ""
      )
    );

  return (
    data.includes("2026") ||
    nome.includes("2026")
  );
}

/**
 * Procura a Eleição Geral 2026.
 *
 * Critérios:
 *
 * 1. O ciclo precisa ser de 2026;
 * 2. não pode ser suplementar;
 * 3. não pode ser municipal;
 * 4. não pode ser consulta popular;
 * 5. precisa possuir abrangência nacional;
 * 6. precisa possuir um primeiro turno nacional.
 */
export function findElection2026(
  config: TseElectionConfig
): TseElection2026 {
  const entries =
    extractElectionEntries(
      config
    );

  const candidatos =
    entries.filter(
      (entry) => {
        if (!cicloEhDe2026(entry)) {
          return false;
        }

        const nome =
          String(
            entry.nm ?? ""
          );

        if (
          nomeIndicaEleicaoNaoGeral(
            nome
          )
        ) {
          return false;
        }

        if (
          !cicloPossuiAbrangenciaBrasil(
            entry
          )
        ) {
          return false;
        }

        return true;
      }
    );

  if (
    candidatos.length ===
    0
  ) {
    return {
      ciclo: null,
      turno1: null,
      turno2: null,
      encontrada: false,
    };
  }

  /*
   * Procuramos primeiro um candidato
   * que realmente possua turno nacional.
   */
  for (const ciclo of candidatos) {
    const pleitos: TsePleitoEntry[] =
      Array.isArray(ciclo.e)
        ? ciclo.e.filter(
            (
              item
            ): item is TsePleitoEntry => {
              if (
                !item ||
                typeof item !==
                  "object"
              ) {
                return false;
              }

              const pleito =
                item as Record<
                  string,
                  unknown
                >;

              return (
                typeof pleito.cd ===
                "string"
              );
            }
          )
        : [];

    const pleitosNacionais =
      pleitos.filter(
        possuiAbrangenciaBrasil
      );

    const turno1 =
      pleitosNacionais.find(
        (item) =>
          String(item.t) ===
          "1"
      ) ?? null;

    const turno2 =
      pleitosNacionais.find(
        (item) =>
          String(item.t) ===
          "2"
      ) ?? null;

    if (turno1) {
      return {
        ciclo,
        turno1,
        turno2,
        encontrada: true,
      };
    }
  }

  /*
   * Encontramos ciclos em 2026,
   * mas nenhum possui primeiro
   * turno nacional.
   */
  return {
    ciclo: null,
    turno1: null,
    turno2: null,
    encontrada: false,
  };
}

/**
 * Resumo compacto para a API.
 */
export function summarizeElection2026(
  config: TseElectionConfig
) {
  const result =
    findElection2026(
      config
    );

  return {
    encontrada:
      result.encontrada,

    ciclo: result.ciclo
      ? {
          cd:
            result.ciclo.cd,

          cdpr:
            result.ciclo.cdpr ??
            null,

          dt:
            result.ciclo.dt ??
            null,

          dtlim:
            result.ciclo.dtlim ??
            null,

          nome:
            result.ciclo.nm ??
            null,
        }
      : null,

    turno1:
      result.turno1
        ? {
            cd:
              result.turno1.cd,

            cdt2:
              result.turno1.cdt2 ??
              null,

            sqele:
              result.turno1.sqele ??
              null,

            nome:
              result.turno1.nm ??
              null,

            tipo:
              result.turno1.t ??
              null,

            tipoEleicao:
              result.turno1.tp ??
              null,
          }
        : null,

    turno2:
      result.turno2
        ? {
            cd:
              result.turno2.cd,

            cdt2:
              result.turno2.cdt2 ??
              null,

            sqele:
              result.turno2.sqele ??
              null,

            nome:
              result.turno2.nm ??
              null,

            tipo:
              result.turno2.t ??
              null,

            tipoEleicao:
              result.turno2.tp ??
              null,
          }
        : null,
  };
}