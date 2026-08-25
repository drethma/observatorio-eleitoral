"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";

type Candidate = {
  numero: number;
  nome: string;
  nome_urna: string | null;
  partido: string | null;
  votos: number;
  percentual?: number;
};

type Localidade = {
  id: number;
  uf: string;
  municipio: string;
  zona: number;
  secao: number;
};

type ResultadosResponse = {
  sucesso: boolean;
  eleicao: number;
  totalVotos: number;
  totalSecoes: number;
  secoesProcessadas: number;
  percentualTotalizacao: number;
  candidatos: Candidate[];
  erro?: string;
};

type Divergencia = {
  numero: number;
  nome: string;
  bu: number;
  resultado: number;
  diferenca: number;
};

type Comparacao = {
  status: "ok" | "divergente" | "aguardando_bu";
  totalBu: number | null;
  totalResultado: number;
  divergencias: Divergencia[];
};

type IntegridadeHash = {
  status: "ok" | "divergente" | "aguardando_bu";
  calculado: string | null;
  armazenado: string | null;
};

type AuditoriaData = {
  sucesso: boolean;

  localidade: Localidade;

  resultado: {
    candidatos: Candidate[];
    totalVotos: number;
  };

  boletim: {
    id: number;
    arquivo: string | null;
    sha256: string | null;
    status: string;
    recebido_em: string;
    dados_json: unknown;
  } | null;

  auditoria: {
    arquivoRecebido: boolean;
    hashConferido: boolean;
    processado: boolean;
    divergencias: number;
  };

  comparacao: Comparacao;

  integridadeHash?: IntegridadeHash;

  historico?: {
    snapshotHash: string;
    novoRegistro: boolean;
  };

  erro?: string;
};

type HistoricoAuditoria = {
  id: number;
  boletim_id: number | null;

  status:
    | "ok"
    | "divergente"
    | "aguardando_bu"
    | "hash_divergente";

  total_bu: number | null;
  total_resultado: number | null;

  divergencias: Divergencia[];

  hash_calculado: string | null;
  hash_armazenado: string | null;

  criado_em: string;
};

type Anomalia = {
  tipo:
    | "divergencia_votos"
    | "hash_divergente"
    | "total_divergente"
    | "status_divergente";

  severidade: "media" | "alta";

  titulo: string;
  descricao: string;

  criado_em: string;

  historico_id: number;
};

type AnomaliasData = {
  sucesso: boolean;

  localidade: Localidade;

  resumo: {
    statusAtual:
      | "ok"
      | "anomalia"
      | "sem_dados";

    totalRegistros: number;
    totalAnomalias: number;
    ultimaAuditoria: string | null;
  };

  anomalias: Anomalia[];

  erro?: string;
};

type TseStatus = {
  sucesso: boolean;

  tse?: {
    ambiente: string;
    status: string;
    lastModified?: string | null;
  };

  eleicao2026?: {
    encontrada: boolean;
    status: string;
  };

  erro?: string;
};

const formatVotes = (value: number) =>
  new Intl.NumberFormat("pt-BR").format(value);

const formatPercent = (value: number) =>
  `${value.toFixed(2).replace(".", ",")}%`;

const formatTime = (date: Date | null) => {
  if (!date) {
    return "aguardando atualização";
  }

  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  return `${date.toLocaleDateString(
    "pt-BR"
  )} às ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
};

export default function Home() {
  // ======================================================
  // ESTADOS GERAIS
  // ======================================================

  const [aiOpen, setAiOpen] =
    useState(false);

  const [query, setQuery] =
    useState("");

  const [auditoriaOpen, setAuditoriaOpen] =
    useState(false);

  const [auditoriaLoading, setAuditoriaLoading] =
    useState(false);

  const [auditoriaData, setAuditoriaData] =
    useState<AuditoriaData | null>(null);

  const [historicoAuditoria, setHistoricoAuditoria] =
    useState<HistoricoAuditoria[]>([]);

  const [historicoLoading, setHistoricoLoading] =
    useState(false);

  const [anomaliasOpen, setAnomaliasOpen] =
    useState(false);

  const [anomaliasLoading, setAnomaliasLoading] =
    useState(false);

  const [anomaliasData, setAnomaliasData] =
    useState<AnomaliasData | null>(null);

  const [candidates, setCandidates] =
    useState<Candidate[]>([]);

  const [totalVotos, setTotalVotos] =
    useState(0);

  const [totalSecoes, setTotalSecoes] =
    useState(0);

  const [secoesProcessadas, setSecoesProcessadas] =
    useState(0);

  const [
    percentualTotalizacao,
    setPercentualTotalizacao,
  ] = useState(0);

  const [localidades, setLocalidades] =
    useState<Localidade[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [lastUpdate, setLastUpdate] =
    useState<Date | null>(null);

  // ======================================================
  // STATUS DO TSE
  // ======================================================

  const [tseStatus, setTseStatus] =
    useState<TseStatus | null>(null);

  const [tseLoading, setTseLoading] =
    useState(true);

  // ======================================================
  // FILTROS
  // ======================================================

  const [ufSelecionada, setUfSelecionada] =
    useState("Brasil");

  const [municipioSelecionado, setMunicipioSelecionado] =
    useState("");

  const [zonaSelecionada, setZonaSelecionada] =
    useState("");

  const [secaoSelecionada, setSecaoSelecionada] =
    useState("");

  // ======================================================
  // STATUS DO TSE
  // ======================================================

  async function carregarStatusTse() {
    try {
      setTseLoading(true);

      const response = await fetch(
        "/api/tse/status",
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Erro ao consultar TSE (${response.status}).`
        );
      }

      const data: TseStatus =
        await response.json();

      setTseStatus(data);
    } catch (error) {
      console.error(
        "Erro ao consultar status do TSE:",
        error
      );

      setTseStatus({
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Falha na comunicação com o TSE.",
      });
    } finally {
      setTseLoading(false);
    }
  }

  // ======================================================
  // LOCALIDADES
  // ======================================================

  async function carregarLocalidades() {
    try {
      const response = await fetch(
        "/api/localidades",
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Falha ao carregar localidades (${response.status}).`
        );
      }

      const data =
        await response.json();

      if (!data.sucesso) {
        throw new Error(
          data.erro ??
            "Erro ao carregar localidades."
        );
      }

      setLocalidades(
        data.localidades ?? []
      );
    } catch (err) {
      console.error(
        "Erro ao carregar localidades:",
        err
      );
    }
  }

  // ======================================================
  // RESULTADOS
  // ======================================================

  async function carregarResultados() {
    try {
      setError(null);

      const params =
        new URLSearchParams();

      if (
        ufSelecionada !==
        "Brasil"
      ) {
        params.set(
          "uf",
          ufSelecionada
        );
      }

      if (
        municipioSelecionado
      ) {
        params.set(
          "municipio",
          municipioSelecionado
        );
      }

      if (
        zonaSelecionada
      ) {
        params.set(
          "zona",
          zonaSelecionada
        );
      }

      if (
        secaoSelecionada
      ) {
        params.set(
          "secao",
          secaoSelecionada
        );
      }

      const queryString =
        params.toString();

      const url = queryString
        ? `/api/resultados?${queryString}`
        : "/api/resultados";

      const response =
        await fetch(url, {
          cache: "no-store",
        });

      if (!response.ok) {
        throw new Error(
          `Falha ao consultar resultados (${response.status}).`
        );
      }

      const data: ResultadosResponse =
        await response.json();

      if (!data.sucesso) {
        throw new Error(
          data.erro ??
            "Erro ao carregar resultados."
        );
      }

      setCandidates(
        data.candidatos ?? []
      );

      setTotalVotos(
        data.totalVotos ?? 0
      );

      setTotalSecoes(
        data.totalSecoes ?? 0
      );

      setSecoesProcessadas(
        data.secoesProcessadas ?? 0
      );

      setPercentualTotalizacao(
        data.percentualTotalizacao ??
          0
      );

      setLastUpdate(
        new Date()
      );
    } catch (err) {
      console.error(
        "Erro ao carregar resultados:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Erro desconhecido ao carregar resultados."
      );
    } finally {
      setLoading(false);
    }
  }

  // ======================================================
  // HISTÓRICO
  // ======================================================

  async function carregarHistorico(
    localidadeId: number
  ) {
    try {
      setHistoricoLoading(true);

      const response =
        await fetch(
          `/api/historico?localidade_id=${localidadeId}`,
          {
            cache:
              "no-store",
          }
        );

      if (!response.ok) {
        throw new Error(
          `Erro ao consultar histórico (${response.status}).`
        );
      }

      const data =
        await response.json();

      if (!data.sucesso) {
        throw new Error(
          data.erro ??
            "Erro ao carregar histórico."
        );
      }

      setHistoricoAuditoria(
        data.historico ?? []
      );
    } catch (error) {
      console.error(
        "Erro ao carregar histórico:",
        error
      );

      setHistoricoAuditoria([]);
    } finally {
      setHistoricoLoading(
        false
      );
    }
  }

  // ======================================================
  // ANOMALIAS
  // ======================================================

  async function carregarAnomalias(
    localidadeId: number
  ) {
    try {
      setAnomaliasLoading(
        true
      );

      const response =
        await fetch(
          `/api/anomalias?localidade_id=${localidadeId}`,
          {
            cache:
              "no-store",
          }
        );

      if (!response.ok) {
        throw new Error(
          `Erro ao consultar anomalias (${response.status}).`
        );
      }

      const data: AnomaliasData =
        await response.json();

      if (!data.sucesso) {
        throw new Error(
          data.erro ??
            "Erro ao carregar anomalias."
        );
      }

      setAnomaliasData(data);
    } catch (error) {
      console.error(
        "Erro ao carregar anomalias:",
        error
      );

      setAnomaliasData(null);
    } finally {
      setAnomaliasLoading(
        false
      );
    }
  }

  async function abrirAnomalias() {
    const localidade =
      localidades.find(
        (item) => {
          const ufValida =
            ufSelecionada ===
              "Brasil" ||
            item.uf ===
              ufSelecionada;

          const municipioValido =
            !municipioSelecionado ||
            item.municipio ===
              municipioSelecionado;

          const zonaValida =
            !zonaSelecionada ||
            String(
              item.zona
            ) === zonaSelecionada;

          const secaoValida =
            !secaoSelecionada ||
            String(
              item.secao
            ) === secaoSelecionada;

          return (
            ufValida &&
            municipioValido &&
            zonaValida &&
            secaoValida
          );
        }
      );

    if (!localidade) {
      setAnomaliasData(null);
      setAnomaliasOpen(true);
      return;
    }

    setAnomaliasOpen(true);

    await carregarAnomalias(
      localidade.id
    );
  }

  // ======================================================
  // AUDITORIA
  // ======================================================

  async function abrirAuditoria() {
    if (!secaoSelecionada) {
      return;
    }

    const localidade =
      localidades.find(
        (item) =>
          item.uf ===
            ufSelecionada &&
          item.municipio ===
            municipioSelecionado &&
          String(item.zona) ===
            zonaSelecionada &&
          String(item.secao) ===
            secaoSelecionada
      );

    if (!localidade) {
      setAuditoriaData(null);
      setHistoricoAuditoria([]);
      setAuditoriaOpen(true);
      return;
    }

    try {
      setAuditoriaLoading(true);
      setAuditoriaOpen(true);
      setAuditoriaData(null);
      setHistoricoAuditoria([]);

      const response =
        await fetch(
          `/api/auditoria?localidade_id=${localidade.id}`,
          {
            cache:
              "no-store",
          }
        );

      if (!response.ok) {
        throw new Error(
          `Erro ao consultar auditoria (${response.status}).`
        );
      }

      const data: AuditoriaData =
        await response.json();

      if (!data.sucesso) {
        throw new Error(
          data.erro ??
            "Erro ao carregar auditoria."
        );
      }

      setAuditoriaData(data);

      await carregarHistorico(
        localidade.id
      );
    } catch (error) {
      console.error(
        "Erro ao carregar auditoria:",
        error
      );

      setAuditoriaData({
        sucesso: false,

        localidade,

        resultado: {
          candidatos: [],
          totalVotos: 0,
        },

        boletim: null,

        auditoria: {
          arquivoRecebido: false,
          hashConferido: false,
          processado: false,
          divergencias: 0,
        },

        comparacao: {
          status:
            "aguardando_bu",
          totalBu: null,
          totalResultado: 0,
          divergencias: [],
        },

        integridadeHash: {
          status:
            "aguardando_bu",
          calculado: null,
          armazenado: null,
        },

        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido.",
      });

      setHistoricoAuditoria([]);
    } finally {
      setAuditoriaLoading(
        false
      );
    }
  }

  // ======================================================
  // FECHAR MODAIS
  // ======================================================

  function fecharAuditoria() {
    setAuditoriaOpen(false);
    setAuditoriaData(null);
    setHistoricoAuditoria([]);
  }

  function fecharAnomalias() {
    setAnomaliasOpen(false);
    setAnomaliasData(null);
  }

  // ======================================================
  // ABRIR IA
  // ======================================================

  function abrirAnalise(
    pergunta: string
  ) {
    setQuery(pergunta);
    setAiOpen(true);
  }

  // ======================================================
  // CARGA INICIAL
  // ======================================================

  useEffect(() => {
    carregarLocalidades();
  }, []);

  useEffect(() => {
    carregarStatusTse();
  }, []);

  useEffect(() => {
    carregarResultados();
  }, [
    ufSelecionada,
    municipioSelecionado,
    zonaSelecionada,
    secaoSelecionada,
  ]);

  // ======================================================
  // REALTIME
  // ======================================================

  useEffect(() => {
    const supabase =
      createClient();

    const channel =
      supabase
        .channel(
          "resultados-em-tempo-real"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "resultados",
          },
          async () => {
            await carregarResultados();

            if (auditoriaOpen) {
              await abrirAuditoria();
            }

            if (anomaliasOpen) {
              await abrirAnomalias();
            }
          }
        )
        .subscribe(
          (status) => {
            console.log(
              "Status Realtime:",
              status
            );
          }
        );

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    ufSelecionada,
    municipioSelecionado,
    zonaSelecionada,
    secaoSelecionada,
    auditoriaOpen,
    anomaliasOpen,
  ]);

  // ======================================================
  // FILTROS
  // ======================================================

  const ufs = useMemo(() => {
    return Array.from(
      new Set(
        localidades.map(
          (localidade) =>
            localidade.uf
        )
      )
    ).sort();
  }, [localidades]);

  const localidadesDoEstado =
    useMemo(() => {
      if (
        ufSelecionada ===
        "Brasil"
      ) {
        return localidades;
      }

      return localidades.filter(
        (localidade) =>
          localidade.uf ===
          ufSelecionada
      );
    }, [
      localidades,
      ufSelecionada,
    ]);

  const municipios =
    useMemo(() => {
      return Array.from(
        new Set(
          localidadesDoEstado.map(
            (localidade) =>
              localidade.municipio
          )
        )
      ).sort();
    }, [
      localidadesDoEstado,
    ]);

  const localidadesDoMunicipio =
    useMemo(() => {
      if (
        !municipioSelecionado
      ) {
        return localidadesDoEstado;
      }

      return localidadesDoEstado.filter(
        (localidade) =>
          localidade.municipio ===
          municipioSelecionado
      );
    }, [
      localidadesDoEstado,
      municipioSelecionado,
    ]);

  const zonas = useMemo(() => {
    return Array.from(
      new Set(
        localidadesDoMunicipio.map(
          (localidade) =>
            localidade.zona
        )
      )
    ).sort(
      (a, b) => a - b
    );
  }, [
    localidadesDoMunicipio,
  ]);

  const localidadesDaZona =
    useMemo(() => {
      if (!zonaSelecionada) {
        return localidadesDoMunicipio;
      }

      return localidadesDoMunicipio.filter(
        (localidade) =>
          String(
            localidade.zona
          ) === zonaSelecionada
      );
    }, [
      localidadesDoMunicipio,
      zonaSelecionada,
    ]);

  const secoes = useMemo(() => {
    return Array.from(
      new Set(
        localidadesDaZona.map(
          (localidade) =>
            localidade.secao
        )
      )
    ).sort(
      (a, b) => a - b
    );
  }, [
    localidadesDaZona,
  ]);

  // ======================================================
  // EVENTOS DOS FILTROS
  // ======================================================

  function handleUfChange(
    value: string
  ) {
    setUfSelecionada(value);
    setMunicipioSelecionado("");
    setZonaSelecionada("");
    setSecaoSelecionada("");
  }

  function handleMunicipioChange(
    value: string
  ) {
    setMunicipioSelecionado(value);
    setZonaSelecionada("");
    setSecaoSelecionada("");
  }

  function handleZonaChange(
    value: string
  ) {
    setZonaSelecionada(value);
    setSecaoSelecionada("");
  }

  // ======================================================
  // DADOS AUXILIARES
  // ======================================================

  const topCandidate =
    useMemo(
      () =>
        candidates[0] ??
        null,
      [candidates]
    );

  const descricaoLocalizacao =
    useMemo(() => {
      const partes: string[] =
        [];

      if (
        ufSelecionada !==
        "Brasil"
      ) {
        partes.push(
          ufSelecionada
        );
      }

      if (
        municipioSelecionado
      ) {
        partes.push(
          municipioSelecionado
        );
      }

      if (
        zonaSelecionada
      ) {
        partes.push(
          `Zona ${zonaSelecionada}`
        );
      }

      if (
        secaoSelecionada
      ) {
        partes.push(
          `Seção ${secaoSelecionada}`
        );
      }

      return partes.length > 0
        ? partes.join(" · ")
        : "Brasil";
    }, [
      ufSelecionada,
      municipioSelecionado,
      zonaSelecionada,
      secaoSelecionada,
    ]);

  const comparacao =
    auditoriaData?.comparacao;

  const auditoriaStatus =
    comparacao?.status ===
    "ok"
      ? "ok"
      : comparacao?.status ===
          "divergente"
        ? "divergente"
        : "pendente";

  // ======================================================
  // RENDER
  // ======================================================

  return (
    <main className="shell">

      {/* ==================================================
          HEADER
      ================================================== */}

      <header className="topbar">

        <div className="brand">

          <div className="brand-mark">
            OE
          </div>

          <div>

            <strong>
              Observatório Eleitoral
            </strong>

            <span>
              Monitoramento público e análise
              de dados
            </span>

          </div>

        </div>

        <div className="live">

          <i />

          AO VIVO

        </div>

      </header>

      {/* ==================================================
          STATUS DA FONTE TSE
      ================================================== */}

      <section
        className={
          tseLoading
            ? "source-banner source-banner-loading"
            : tseStatus?.eleicao2026
                ?.encontrada
              ? "source-banner source-banner-official"
              : "source-banner source-banner-demo"
        }
      >

        <div className="source-banner-icon">

          {tseLoading
            ? "..."
            : tseStatus
                ?.eleicao2026
                ?.encontrada
              ? "✓"
              : "i"}

        </div>

        <div className="source-banner-content">

          <div className="source-banner-title">

            <strong>

              {tseLoading
                ? "Verificando fonte dos dados..."
                : tseStatus
                    ?.eleicao2026
                    ?.encontrada
                  ? "FONTE OFICIAL TSE"
                  : "AMBIENTE DE DEMONSTRAÇÃO"}

            </strong>

            {!tseLoading && (
              <span
                className={
                  tseStatus
                    ?.eleicao2026
                    ?.encontrada
                    ? "source-badge source-badge-official"
                    : "source-badge source-badge-demo"
                }
              >

                {tseStatus
                  ?.eleicao2026
                  ?.encontrada
                  ? "TSE OFICIAL"
                  : "DEMO"}

              </span>
            )}

          </div>

          <p>

            {tseLoading
              ? "Consultando a infraestrutura oficial do Tribunal Superior Eleitoral."
              : tseStatus
                    ?.eleicao2026
                    ?.encontrada
                ? "A configuração das Eleições Gerais 2026 foi localizada. O sistema está preparado para iniciar a sincronização oficial."
                : "A configuração das Eleições Gerais 2026 ainda não está disponível no arquivo oficial consultado. Os dados exibidos atualmente são de demonstração."}

          </p>

        </div>

        <div className="source-banner-status">

          <span
            className={
              tseStatus?.sucesso
                ? "source-connection source-connection-ok"
                : "source-connection source-connection-error"
            }
          >

            <i />

            {tseLoading
              ? "VERIFICANDO"
              : tseStatus?.sucesso
                ? "TSE CONECTADO"
                : "TSE INDISPONÍVEL"}

          </span>

        </div>

      </section>

      {/* ==================================================
          HERO
      ================================================== */}

      <section className="hero">

        <div>

          <p className="eyebrow">
            ELEIÇÕES 2026 · PROTÓTIPO
          </p>

          <h1>
            Resultados em um só lugar.
          </h1>

          <p className="subtitle">
            Acompanhe a totalização,
            explore regiões e use a IA
            para interpretar os dados
            públicos.
          </p>

          <p className="location-current">

            Visualização atual:{" "}

            <strong>
              {descricaoLocalizacao}
            </strong>

          </p>

        </div>

        <div className="scope-box">

          <label>
            VISUALIZAÇÃO
          </label>

          <select
            value={
              ufSelecionada
            }
            onChange={(event) =>
              handleUfChange(
                event.target.value
              )
            }
          >

            <option value="Brasil">
              Brasil
            </option>

            {ufs.map((uf) => (

              <option
                key={uf}
                value={uf}
              >
                {uf}
              </option>

            ))}

          </select>

          <select
            value={
              municipioSelecionado
            }
            onChange={(event) =>
              handleMunicipioChange(
                event.target.value
              )
            }
            disabled={
              ufSelecionada ===
                "Brasil" ||
              municipios.length ===
                0
            }
          >

            <option value="">
              Todos os municípios
            </option>

            {municipios.map(
              (municipio) => (

                <option
                  key={municipio}
                  value={municipio}
                >
                  {municipio}
                </option>

              )
            )}

          </select>

          <select
            value={
              zonaSelecionada
            }
            onChange={(event) =>
              handleZonaChange(
                event.target.value
              )
            }
            disabled={
              localidadesDoMunicipio.length ===
              0
            }
          >

            <option value="">
              Todas as zonas
            </option>

            {zonas.map((zona) => (

              <option
                key={zona}
                value={String(
                  zona
                )}
              >
                Zona {zona}
              </option>

            ))}

          </select>

          <select
            value={
              secaoSelecionada
            }
            onChange={(event) =>
              setSecaoSelecionada(
                event.target.value
              )
            }
            disabled={
              localidadesDaZona.length ===
              0
            }
          >

            <option value="">
              Todas as seções
            </option>

            {secoes.map((secao) => (

              <option
                key={secao}
                value={String(
                  secao
                )}
              >
                Seção {secao}
              </option>

            ))}

          </select>

        </div>

      </section>

      {/* ==================================================
          INDICADORES
      ================================================== */}

      <section className="stats-grid">

        <article className="card stat">

          <span>
            Totalização
          </span>

          <strong>

            {loading
              ? "..."
              : formatPercent(
                  percentualTotalizacao
                )}

          </strong>

          <small>

            {secoesProcessadas} de{" "}
            {totalSecoes} seções

          </small>

        </article>

        <article className="card stat">

          <span>
            Votos válidos
          </span>

          <strong>

            {loading
              ? "..."
              : formatVotes(
                  totalVotos
                )}

          </strong>

          <small>
            Soma dos resultados
            disponíveis
          </small>

        </article>

        <article className="card stat">

          <span>
            Diferenças de auditoria
          </span>

          <strong className="success">
            0
          </strong>

          <small>
            Dados de demonstração
          </small>

        </article>

        <article className="card stat">

          <span>
            Confiança da coleta
          </span>

          <strong>
            100%
          </strong>

          <small>
            Fonte: ambiente de
            demonstração
          </small>

        </article>

      </section>

      {/* ==================================================
          RESULTADOS + IA
      ================================================== */}

      <section className="content-grid">

        <article className="card results-card">

          <div className="section-head">

            <div>

              <p className="eyebrow">
                PRESIDENTE
              </p>

              <h2>
                Resultado parcial
              </h2>

            </div>

            <span className="updated">
              ● atualizado{" "}
              {formatTime(
                lastUpdate
              )}
            </span>

          </div>

          {loading && (

            <div className="ai-response">
              Carregando resultados...
            </div>

          )}

          {error && (

            <div className="ai-response">

              <strong>
                Erro:
              </strong>{" "}

              {error}

            </div>

          )}

          {!loading &&
            !error &&
            candidates.length >
              0 && (

              <div className="candidate-list">

                {candidates.map(
                  (candidate) => (

                    <div
                      className="candidate"
                      key={
                        candidate.numero
                      }
                    >

                      <div className="candidate-info">

                        <b>
                          {
                            candidate.numero
                          }
                        </b>

                        <div>

                          <strong>
                            {
                              candidate.nome
                            }
                          </strong>

                          <span>
                            {formatVotes(
                              candidate.votos
                            )}{" "}
                            votos
                          </span>

                        </div>

                      </div>

                      <div className="candidate-value">

                        <strong>

                          {formatPercent(
                            candidate.percentual ??
                              0
                          )}

                        </strong>

                        <div className="bar">

                          <i
                            style={{
                              width: `${candidate.percentual ?? 0}%`,
                            }}
                          />

                        </div>

                      </div>

                    </div>

                  )
                )}

                {secaoSelecionada && (

                  <button
                    type="button"
                    className="audit-button"
                    onClick={
                      abrirAuditoria
                    }
                  >
                    🔎 Auditar seção
                  </button>

                )}

              </div>

            )}

          {!loading &&
            !error &&
            candidates.length ===
              0 && (

              <div className="ai-response">

                Nenhum resultado encontrado
                para esta localização.

              </div>

            )}

        </article>

        {/* ==================================================
            IA
        ================================================== */}

        <article className="card ai-card">

          <div className="section-head">

            <div>

              <p className="eyebrow">
                INTELIGÊNCIA ARTIFICIAL
              </p>

              <h2>
                Analista IA
              </h2>

            </div>

            <span className="ai-badge">
              BETA
            </span>

          </div>

          <p className="ai-text">

            {topCandidate ? (
              <>
                Neste ambiente de demonstração,
                o candidato{" "}
                <strong>
                  {topCandidate.numero}
                </strong>{" "}
                aparece na liderança com{" "}
                <strong>
                  {formatPercent(
                    topCandidate.percentual ??
                      0
                  )}
                </strong>{" "}
                dos votos disponíveis em{" "}
                <strong>
                  {descricaoLocalizacao}
                </strong>
                .
              </>
            ) : (
              "Aguardando dados para gerar a análise."
            )}

          </p>

          <div className="quick-actions">

            <button
              type="button"
              onClick={() =>
                abrirAnalise(
                  `Qual candidato aparece na liderança em ${descricaoLocalizacao}?`
                )
              }
            >
              📈 Liderança
            </button>

            <button
              type="button"
              onClick={() =>
                abrirAnalise(
                  `Como está a distribuição dos resultados em ${descricaoLocalizacao}?`
                )
              }
            >
              🗺️ Geografia
            </button>

            <button
              type="button"
              onClick={
                abrirAnomalias
              }
            >
              🔎 Anomalias
            </button>

          </div>

          <button
            type="button"
            className="primary"
            onClick={() => {
              setQuery("");
              setAiOpen(true);
            }}
          >
            Abrir análise IA
          </button>

        </article>

      </section>

      {/* ==================================================
          LOCALIZAÇÃO + AUDITORIA
      ================================================== */}

      <section className="content-grid lower">

        <article className="card">

          <div className="section-head">

            <div>

              <p className="eyebrow">
                DISTRIBUIÇÃO
              </p>

              <h2>
                Localização selecionada
              </h2>

            </div>

          </div>

          <div className="region-list">

            <div className="audit-row">

              <span>
                Estado
              </span>

              <b>
                {ufSelecionada}
              </b>

            </div>

            <div className="audit-row">

              <span>
                Município
              </span>

              <b>
                {municipioSelecionado ||
                  "Todos"}
              </b>

            </div>

            <div className="audit-row">

              <span>
                Zona
              </span>

              <b>
                {zonaSelecionada
                  ? `Zona ${zonaSelecionada}`
                  : "Todas"}
              </b>

            </div>

            <div className="audit-row">

              <span>
                Seção
              </span>

              <b>
                {secaoSelecionada
                  ? `Seção ${secaoSelecionada}`
                  : "Todas"}
              </b>

            </div>

          </div>

        </article>

        <article className="card">

          <div className="section-head">

            <div>

              <p className="eyebrow">
                AUDITORIA
              </p>

              <h2>
                Integridade dos dados
              </h2>

            </div>

            <span className="success-pill">
              OK
            </span>

          </div>

          <div className="audit-row">

            <span>
              Arquivos recebidos
            </span>

            <b>
              3.842
            </b>

          </div>

          <div className="audit-row">

            <span>
              Hashes conferidos
            </span>

            <b>
              3.842
            </b>

          </div>

          <div className="audit-row">

            <span>
              Seções processadas
            </span>

            <b>
              {secoesProcessadas}
            </b>

          </div>

          <div className="audit-row">

            <span>
              Divergências
            </span>

            <b className="success">
              0
            </b>

          </div>

        </article>

      </section>

      {/* ==================================================
          FOOTER
      ================================================== */}

      <footer>

        <span>
          Ambiente de demonstração ·
          nenhum dado oficial está sendo
          usado nesta primeira versão.
        </span>

        <span>
          Fonte planejada: dados públicos
          do TSE.
        </span>

      </footer>

      {/* ==================================================
          MODAL IA
      ================================================== */}

      {aiOpen && (

        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="analista-ia-title"
          onClick={() =>
            setAiOpen(false)
          }
        >

          <section
            className="modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <p className="eyebrow">
                  ASSISTENTE
                </p>

                <h2 id="analista-ia-title">
                  Analista IA
                </h2>

              </div>

              <button
                type="button"
                className="ai-close"
                onClick={() =>
                  setAiOpen(false)
                }
                aria-label="Fechar análise IA"
              >
                <span aria-hidden="true">
                  ×
                </span>
              </button>

            </div>

            <textarea
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target.value
                )
              }
              placeholder="Pergunte sobre os dados..."
            />

            <div className="ai-response">

              <strong>
                Pergunta:
              </strong>

              <p>
                {query ||
                  "Digite uma pergunta sobre os dados eleitorais."}
              </p>

              <hr />

              <p>
                A camada de IA será conectada
                à API de análise. Nesta etapa,
                o campo já está preparado para
                receber perguntas e,
                posteriormente, consultar os
                dados estruturados antes de
                gerar a resposta.
              </p>

            </div>

            <button
              type="button"
              className="primary"
            >
              Consultar análise
            </button>

          </section>

        </div>

      )}

      {/* ==================================================
          MODAL DE AUDITORIA
      ================================================== */}

      {auditoriaOpen && (

        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auditoria-title"
          onClick={fecharAuditoria}
        >

          <section
            className="modal audit-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <p className="eyebrow">
                  AUDITORIA DA SEÇÃO
                </p>

                <h2 id="auditoria-title">

                  {auditoriaData?.localidade
                    ? `${auditoriaData.localidade.uf} · ${auditoriaData.localidade.municipio} · Zona ${auditoriaData.localidade.zona} · Seção ${auditoriaData.localidade.secao}`
                    : "Auditoria"}

                </h2>

              </div>

              <div className="modal-actions">

                <span
                  className={
                    auditoriaStatus ===
                    "ok"
                      ? "audit-header-status audit-header-ok"
                      : auditoriaStatus ===
                          "divergente"
                        ? "audit-header-status audit-header-danger"
                        : "audit-header-status audit-header-pending"
                  }
                >

                  {auditoriaStatus ===
                  "ok"
                    ? "✓ CONFERIDA"
                    : auditoriaStatus ===
                        "divergente"
                      ? "⚠ DIVERGÊNCIA"
                      : "• PENDENTE"}

                </span>

                <button
                  type="button"
                  className="ai-close"
                  onClick={
                    fecharAuditoria
                  }
                  aria-label="Fechar auditoria"
                >
                  <span aria-hidden="true">
                    ×
                  </span>
                </button>

              </div>

            </div>

            {auditoriaLoading && (

              <div className="ai-response">
                Consultando dados de
                auditoria...
              </div>

            )}

            {!auditoriaLoading &&
              auditoriaData?.erro && (

              <div className="ai-response">

                <strong>
                  Erro:
                </strong>{" "}

                {auditoriaData.erro}

              </div>

            )}

            {!auditoriaLoading &&
              !auditoriaData?.erro &&
              auditoriaData && (
                <>

                  {/* RESULTADO */}

                  <div className="audit-modal-section">

                    <p className="eyebrow">
                      RESULTADO
                    </p>

                    {auditoriaData.resultado.candidatos.map(
                      (candidate) => (

                        <div
                          className="audit-candidate"
                          key={
                            candidate.numero
                          }
                        >

                          <span>

                            <b>
                              {
                                candidate.numero
                              }
                            </b>

                            {
                              candidate.nome
                            }

                          </span>

                          <strong>

                            {formatVotes(
                              candidate.votos
                            )}{" "}
                            votos

                          </strong>

                        </div>

                      )
                    )}

                    <div className="audit-total">

                      <span>
                        Total
                      </span>

                      <strong>

                        {formatVotes(
                          auditoriaData
                            .resultado
                            .totalVotos
                        )}{" "}
                        votos

                      </strong>

                    </div>

                  </div>

                  {/* COMPARAÇÃO */}

                  {auditoriaData.boletim &&
                    comparacao && (

                    <div className="audit-modal-section">

                      <div className="audit-comparison-header">

                        <div>

                          <p className="eyebrow">
                            COMPARAÇÃO
                          </p>

                          <h3>
                            BU × resultado
                          </h3>

                        </div>

                        <span
                          className={
                            auditoriaStatus ===
                            "ok"
                              ? "comparison-pill comparison-ok"
                              : auditoriaStatus ===
                                  "divergente"
                                ? "comparison-pill comparison-danger"
                                : "comparison-pill comparison-pending"
                          }
                        >

                          {auditoriaStatus ===
                          "ok"
                            ? "CONFERIDO"
                            : auditoriaStatus ===
                                "divergente"
                              ? "DIVERGÊNCIA"
                              : "PENDENTE"}

                        </span>

                      </div>

                      <div className="comparison-head">

                        <span>
                          Candidato
                        </span>

                        <span>
                          BU
                        </span>

                        <span>
                          Resultado
                        </span>

                        <span>
                          Status
                        </span>

                      </div>

                      {auditoriaData.resultado.candidatos.map(
                        (candidate) => {

                          const divergencia =
                            comparacao
                              .divergencias
                              .find(
                                (item) =>
                                  item.numero ===
                                  candidate.numero
                              );

                          const valorBu =
                            divergencia
                              ? divergencia.bu
                              : candidate.votos;

                          const valorResultado =
                            divergencia
                              ? divergencia.resultado
                              : candidate.votos;

                          const ok =
                            valorBu ===
                            valorResultado;

                          return (

                            <div
                              className={`comparison-row ${
                                !ok
                                  ? "comparison-row-danger"
                                  : ""
                              }`}
                              key={
                                candidate.numero
                              }
                            >

                              <span className="comparison-candidate">

                                <b>
                                  {
                                    candidate.numero
                                  }
                                </b>

                                <span>
                                  {
                                    candidate.nome
                                  }
                                </span>

                              </span>

                              <strong>

                                {formatVotes(
                                  valorBu
                                )}

                              </strong>

                              <strong>

                                {formatVotes(
                                  valorResultado
                                )}

                              </strong>

                              <span
                                className={
                                  ok
                                    ? "comparison-status-ok"
                                    : "comparison-status-danger"
                                }
                              >
                                {ok
                                  ? "✓"
                                  : "⚠"}
                              </span>

                            </div>

                          );
                        }
                      )}

                      <div
                        className={`comparison-total ${
                          comparacao.totalBu !==
                          comparacao.totalResultado
                            ? "comparison-total-danger"
                            : ""
                        }`}
                      >

                        <span>
                          TOTAL
                        </span>

                        <strong>

                          {comparacao.totalBu ===
                          null
                            ? "—"
                            : formatVotes(
                                comparacao.totalBu
                              )}

                        </strong>

                        <strong>

                          {formatVotes(
                            comparacao.totalResultado
                          )}

                        </strong>

                        <span>

                          {comparacao.totalBu ===
                          comparacao.totalResultado
                            ? "✓"
                            : "⚠"}

                        </span>

                      </div>

                      {auditoriaStatus ===
                        "ok" && (

                        <div className="comparison-result comparison-result-ok">

                          <strong>
                            ✓ SEM DIVERGÊNCIAS
                          </strong>

                          <span>
                            Os votos do Boletim
                            de Urna correspondem
                            aos resultados
                            armazenados para
                            esta seção.
                          </span>

                        </div>

                      )}

                      {auditoriaStatus ===
                        "divergente" && (

                        <div className="comparison-result comparison-result-danger">

                          <strong>
                            ⚠ DIVERGÊNCIA DETECTADA
                          </strong>

                          <span>
                            Existem diferenças
                            entre os dados do
                            Boletim de Urna e
                            os resultados
                            armazenados.
                          </span>

                        </div>

                      )}

                    </div>

                  )}

                  {/* INTEGRIDADE */}

                  <div className="audit-modal-section">

                    <div className="section-head">

                      <div>

                        <p className="eyebrow">
                          INTEGRIDADE
                        </p>

                      </div>

                      <span
                        className={
                          auditoriaStatus ===
                          "ok"
                            ? "success-pill"
                            : auditoriaStatus ===
                                "divergente"
                              ? "danger-pill"
                              : "comparison-pill comparison-pending"
                        }
                      >

                        {auditoriaStatus ===
                        "ok"
                          ? "OK"
                          : auditoriaStatus ===
                              "divergente"
                            ? "ATENÇÃO"
                            : "PENDENTE"}

                      </span>

                    </div>

                    <div className="audit-status-row">

                      <span>
                        Arquivo recebido
                      </span>

                      <strong
                        className={
                          auditoriaData
                            .auditoria
                            .arquivoRecebido
                            ? "status-ok"
                            : "status-pending"
                        }
                      >

                        {auditoriaData
                          .auditoria
                          .arquivoRecebido
                          ? "Sim"
                          : "Não"}

                      </strong>

                    </div>

                    <div className="audit-status-row">

                      <span>
                        SHA-256 conferido
                      </span>

                      <strong
                        className={
                          auditoriaData
                            .auditoria
                            .hashConferido
                            ? "status-ok"
                            : "status-pending"
                        }
                      >

                        {auditoriaData
                          .auditoria
                          .hashConferido
                          ? "Sim"
                          : "Não"}

                      </strong>

                    </div>

                    <div className="audit-status-row">

                      <span>
                        Processamento
                      </span>

                      <strong
                        className={
                          auditoriaData.boletim
                            ? "status-ok"
                            : "status-pending"
                        }
                      >

                        {auditoriaData.boletim
                          ? "Concluído"
                          : "Aguardando BU"}

                      </strong>

                    </div>

                    <div className="audit-status-row">

                      <span>
                        Divergências
                      </span>

                      <strong
                        className={
                          auditoriaData
                            .auditoria
                            .divergencias ===
                          0
                            ? "status-ok"
                            : "status-pending"
                        }
                      >

                        {
                          auditoriaData
                            .auditoria
                            .divergencias
                        }

                      </strong>

                    </div>

                  </div>

                  {/* HASH */}

                  {auditoriaData.integridadeHash && (

                    <div className="audit-modal-section">

                      <div className="section-head">

                        <div>

                          <p className="eyebrow">
                            HASH SHA-256
                          </p>

                          <h3>
                            Integridade do conteúdo
                          </h3>

                        </div>

                        <span
                          className={
                            auditoriaData
                              .integridadeHash
                              .status ===
                            "ok"
                              ? "success-pill"
                              : auditoriaData
                                  .integridadeHash
                                  .status ===
                                  "divergente"
                                ? "danger-pill"
                                : "comparison-pill comparison-pending"
                          }
                        >

                          {auditoriaData
                            .integridadeHash
                            .status ===
                          "ok"
                            ? "CONFERIDO"
                            : auditoriaData
                                .integridadeHash
                                .status ===
                                "divergente"
                              ? "DIVERGENTE"
                              : "PENDENTE"}

                        </span>

                      </div>

                      <div className="audit-status-row">

                        <span>
                          Calculado
                        </span>

                        <strong className="hash-value">

                          {auditoriaData
                            .integridadeHash
                            .calculado ??
                            "—"}

                        </strong>

                      </div>

                      <div className="audit-status-row">

                        <span>
                          Armazenado
                        </span>

                        <strong className="hash-value">

                          {auditoriaData
                            .integridadeHash
                            .armazenado ??
                            "—"}

                        </strong>

                      </div>

                    </div>

                  )}

                  {/* BOLETIM */}

                  {auditoriaData.boletim && (

                    <div className="audit-modal-section">

                      <p className="eyebrow">
                        BOLETIM DE URNA
                      </p>

                      <div className="audit-status-row">

                        <span>
                          Arquivo
                        </span>

                        <strong>
                          {auditoriaData.boletim
                            .arquivo ??
                            "N/A"}
                        </strong>

                      </div>

                    </div>

                  )}

                  {/* HISTÓRICO */}

                  <div className="audit-modal-section">

                    <div className="section-head">

                      <div>

                        <p className="eyebrow">
                          HISTÓRICO
                        </p>

                        <h3>
                          Histórico da auditoria
                        </h3>

                      </div>

                      <span className="history-count">
                        {
                          historicoAuditoria.length
                        }
                      </span>

                    </div>

                    {historicoLoading && (

                      <div className="ai-response">
                        Carregando histórico...
                      </div>

                    )}

                    {!historicoLoading &&
                      historicoAuditoria.length ===
                        0 && (

                        <div className="ai-response">
                          Nenhum registro histórico
                          encontrado.
                        </div>

                    )}

                    {!historicoLoading &&
                      historicoAuditoria.length >
                        0 && (

                        <div className="history-list">

                          {historicoAuditoria.map(
                            (item) => {

                              const status =
                                item.status;

                              const statusLabel =
                                status ===
                                "ok"
                                  ? "OK"
                                  : status ===
                                      "divergente"
                                    ? "DIVERGÊNCIA"
                                    : status ===
                                        "hash_divergente"
                                      ? "HASH"
                                      : "PENDENTE";

                              const statusClass =
                                status ===
                                "ok"
                                  ? "history-ok"
                                  : status ===
                                        "divergente" ||
                                      status ===
                                        "hash_divergente"
                                    ? "history-danger"
                                    : "history-pending";

                              const dataHora =
                                new Date(
                                  item.criado_em
                                );

                              return (

                                <div
                                  className="history-item"
                                  key={
                                    item.id
                                  }
                                >

                                  <div
                                    className={`history-dot ${statusClass}`}
                                  >

                                    {status ===
                                    "ok"
                                      ? "✓"
                                      : status ===
                                            "divergente" ||
                                          status ===
                                            "hash_divergente"
                                        ? "!"
                                        : "•"}

                                  </div>

                                  <div className="history-content">

                                    <div className="history-main">

                                      <strong>
                                        {
                                          statusLabel
                                        }
                                      </strong>

                                      <span>
                                        {dataHora.toLocaleDateString(
                                          "pt-BR"
                                        )}{" "}
                                        às{" "}
                                        {dataHora.toLocaleTimeString(
                                          "pt-BR",
                                          {
                                            hour: "2-digit",
                                            minute:
                                              "2-digit",
                                            second:
                                              "2-digit",
                                          }
                                        )}
                                      </span>

                                    </div>

                                    <div className="history-values">

                                      <span>
                                        BU:{" "}
                                        <b>

                                          {item.total_bu ===
                                          null
                                            ? "—"
                                            : formatVotes(
                                                item.total_bu
                                              )}

                                        </b>
                                      </span>

                                      <span>
                                        Resultado:{" "}
                                        <b>

                                          {item.total_resultado ===
                                          null
                                            ? "—"
                                            : formatVotes(
                                                item.total_resultado
                                              )}

                                        </b>
                                      </span>

                                      <span>
                                        Divergências:{" "}
                                        <b>

                                          {
                                            item
                                              .divergencias
                                              .length
                                          }

                                        </b>
                                      </span>

                                    </div>

                                  </div>

                                </div>

                              );
                            }
                          )}

                        </div>

                    )}

                  </div>

                </>
              )}

          </section>

        </div>

      )}

      {/* ==================================================
          MODAL DE ANOMALIAS
      ================================================== */}

      {anomaliasOpen && (

        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="anomalias-title"
          onClick={
            fecharAnomalias
          }
        >

          <section
            className="modal anomaly-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <p className="eyebrow">
                  ANÁLISE DE ANOMALIAS
                </p>

                <h2 id="anomalias-title">

                  {anomaliasData?.localidade
                    ? `${anomaliasData.localidade.uf} · ${anomaliasData.localidade.municipio} · Zona ${anomaliasData.localidade.zona} · Seção ${anomaliasData.localidade.secao}`
                    : descricaoLocalizacao}

                </h2>

              </div>

              <button
                type="button"
                className="ai-close"
                onClick={
                  fecharAnomalias
                }
                aria-label="Fechar análise de anomalias"
              >
                <span aria-hidden="true">
                  ×
                </span>
              </button>

            </div>

            {anomaliasLoading && (

              <div className="ai-response">
                Analisando histórico da seção...
              </div>

            )}

            {!anomaliasLoading &&
              !anomaliasData && (

                <div className="anomaly-empty">

                  <div className="anomaly-empty-icon">
                    !
                  </div>

                  <strong>
                    Não foi possível carregar
                    a análise.
                  </strong>

                  <span>
                    Tente novamente em alguns
                    instantes.
                  </span>

                </div>

              )}

            {!anomaliasLoading &&
              anomaliasData && (
                <>

                  <div
                    className={
                      anomaliasData.resumo
                        .statusAtual ===
                      "ok"
                        ? "anomaly-summary anomaly-summary-ok"
                        : anomaliasData.resumo
                              .statusAtual ===
                            "anomalia"
                          ? "anomaly-summary anomaly-summary-danger"
                          : "anomaly-summary anomaly-summary-pending"
                    }
                  >

                    <div className="anomaly-summary-icon">

                      {anomaliasData.resumo
                        .statusAtual ===
                      "ok"
                        ? "✓"
                        : anomaliasData
                              .resumo
                              .statusAtual ===
                            "anomalia"
                          ? "!"
                          : "•"}

                    </div>

                    <div className="anomaly-summary-content">

                      <strong>

                        {anomaliasData.resumo
                          .statusAtual ===
                        "ok"
                          ? "NENHUMA ANOMALIA DETECTADA"
                          : anomaliasData.resumo
                                .statusAtual ===
                              "anomalia"
                            ? `${anomaliasData.resumo.totalAnomalias} ANOMALIA(S) DETECTADA(S)`
                            : "SEM DADOS SUFICIENTES"}

                      </strong>

                      <span>

                        {anomaliasData.resumo
                          .statusAtual ===
                        "ok"
                          ? "A última auditoria está íntegra e o histórico analisado não apresenta divergências."
                          : anomaliasData.resumo
                                .statusAtual ===
                              "anomalia"
                            ? "Foram encontrados eventos objetivos que precisam ser analisados."
                            : "Ainda não existem registros suficientes para realizar a análise."}

                      </span>

                    </div>

                  </div>

                  <div className="anomaly-stats">

                    <div className="anomaly-stat">

                      <span>
                        Histórico analisado
                      </span>

                      <strong>
                        {
                          anomaliasData.resumo
                            .totalRegistros
                        }
                      </strong>

                      <small>
                        registros
                      </small>

                    </div>

                    <div className="anomaly-stat">

                      <span>
                        Anomalias
                      </span>

                      <strong
                        className={
                          anomaliasData.resumo
                            .totalAnomalias >
                          0
                            ? "anomaly-number-danger"
                            : "anomaly-number-ok"
                        }
                      >

                        {
                          anomaliasData.resumo
                            .totalAnomalias
                        }

                      </strong>

                      <small>
                        detectadas
                      </small>

                    </div>

                    <div className="anomaly-stat">

                      <span>
                        Última auditoria
                      </span>

                      <strong className="anomaly-time">

                        {anomaliasData.resumo
                          .ultimaAuditoria
                          ? new Date(
                              anomaliasData.resumo
                                .ultimaAuditoria
                            ).toLocaleTimeString(
                              "pt-BR",
                              {
                                hour: "2-digit",
                                minute:
                                  "2-digit",
                                second:
                                  "2-digit",
                              }
                            )
                          : "—"}

                      </strong>

                      <small>
                        horário
                      </small>

                    </div>

                  </div>

                  <div className="audit-modal-section">

                    <div className="section-head">

                      <div>

                        <p className="eyebrow">
                          EVENTOS
                        </p>

                        <h3>
                          Eventos detectados
                        </h3>

                      </div>

                      <span className="history-count">
                        {
                          anomaliasData
                            .anomalias
                            .length
                        }
                      </span>

                    </div>

                    {anomaliasData.anomalias.length ===
                      0 && (

                      <div className="anomaly-clear">

                        <div className="anomaly-clear-icon">
                          ✓
                        </div>

                        <div>

                          <strong>
                            Histórico íntegro
                          </strong>

                          <span>
                            Não foram encontradas
                            diferenças entre
                            as verificações
                            disponíveis.
                          </span>

                        </div>

                      </div>

                    )}

                    {anomaliasData.anomalias.length >
                      0 && (

                      <div className="anomaly-list">

                        {anomaliasData.anomalias.map(
                          (
                            anomalia,
                            index
                          ) => (

                            <div
                              className={`anomaly-item ${
                                anomalia.severidade ===
                                "alta"
                                  ? "anomaly-item-danger"
                                  : "anomaly-item-warning"
                              }`}
                              key={`${anomalia.historico_id}-${anomalia.tipo}-${index}`}
                            >

                              <div className="anomaly-item-icon">
                                !
                              </div>

                              <div className="anomaly-item-content">

                                <div className="anomaly-item-top">

                                  <strong>
                                    {
                                      anomalia.titulo
                                    }
                                  </strong>

                                  <span>
                                    {formatDateTime(
                                      anomalia.criado_em
                                    )}
                                  </span>

                                </div>

                                <p>
                                  {
                                    anomalia.descricao
                                  }
                                </p>

                              </div>

                            </div>

                          )
                        )}

                      </div>

                    )}

                  </div>

                  <div className="anomaly-note">

                    <strong>
                      Observação
                    </strong>

                    <span>
                      Uma anomalia representa uma
                      diferença objetiva identificada
                      nos dados ou no histórico. Ela
                      não constitui, por si só, uma
                      conclusão sobre fraude ou
                      irregularidade eleitoral.
                    </span>

                  </div>

                </>
              )}

          </section>

        </div>

      )}

    </main>
  );
}