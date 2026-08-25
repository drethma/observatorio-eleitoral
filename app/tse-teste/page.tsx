"use client";

import { ChangeEvent, useState } from "react";

type DiagnosticoResponse = {
  sucesso: boolean;

  diagnostico?: {
    arquivo: string;
    sha256: string;
    tamanhoAproximado: number;

    topLevelKeys: string[];
    totalTopLevelKeys: number;

    localizacao: {
      uf: string | null;
      municipio: string | null;
      zona: number | null;
      secao: number | null;
    };

    referenciasSecao: Array<{
      uf: string | null;
      municipio: string | null;
      zona: number | null;
      secao: number | null;
      dataArquivo: string | null;
      horaArquivo: string | null;
    }>;

    totalReferenciasSecao: number;

    totalizadoresEncontrados: number[];

    datasEA16: Array<string | null>;

    resultadoEA20: {
      abrangencia:
        | "BRASIL"
        | "UF"
        | "MUNICIPIO"
        | "ZONA"
        | "SECAO"
        | "DESCONHECIDA";

      uf: string | null;
      municipio: string | null;
      zona: number | null;
      secao: number | null;

      totalVotos: number | null;
      totalCandidatos: number;

      candidatos: Array<{
        numero: string;
        nome: string | null;
        votos: number | null;
        percentual: number | null;
        raw: Record<string, unknown>;
      }>;
    } | null;
  };

  metadata?: {
    arquivo: string;
    url: string | null;
    etag: string | null;
    lastModified: string | null;
    sha256: string;
    coletadoEm: string;
  };

  erro?: string;
};

export default function TseTestePage() {
  const [arquivo, setArquivo] =
    useState<File | null>(null);

  const [carregando, setCarregando] =
    useState(false);

  const [resultado, setResultado] =
    useState<DiagnosticoResponse | null>(
      null
    );

  const [erro, setErro] =
    useState<string | null>(null);

  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const selecionado =
      event.target.files?.[0] ??
      null;

    setArquivo(selecionado);
    setResultado(null);
    setErro(null);
  }

  async function analisarArquivo() {
    if (!arquivo) {
      setErro(
        "Selecione um arquivo JSON primeiro."
      );

      return;
    }

    try {
      setCarregando(true);
      setResultado(null);
      setErro(null);

      const texto =
        await arquivo.text();

      let json: unknown;

      try {
        json = JSON.parse(texto);
      } catch {
        throw new Error(
          "O arquivo selecionado não contém um JSON válido."
        );
      }

      const response =
        await fetch(
          "/api/tse/diagnostico",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              arquivo:
                arquivo.name,

              dados:
                json,
            }),
          }
        );

      const data: DiagnosticoResponse =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.erro ??
            `Erro HTTP ${response.status}.`
        );
      }

      if (!data.sucesso) {
        throw new Error(
          data.erro ??
            "O diagnóstico falhou."
        );
      }

      setResultado(data);
    } catch (error) {
      console.error(
        "Erro ao analisar arquivo:",
        error
      );

      setErro(
        error instanceof Error
          ? error.message
          : "Erro desconhecido."
      );
    } finally {
      setCarregando(false);
    }
  }

  function limpar() {
    setArquivo(null);
    setResultado(null);
    setErro(null);
  }

  const diagnostico =
    resultado?.diagnostico;

  const ea20 =
    diagnostico?.resultadoEA20;

  return (
    <main className="tse-test-page">
      <section className="tse-test-container">

        {/* ================================================
            CABEÇALHO
        ================================================= */}

        <div className="tse-test-header">

          <p className="eyebrow">
            DESENVOLVIMENTO
          </p>

          <h1>
            Teste do parser TSE
          </h1>

          <p>
            Selecione um arquivo JSON para
            verificar como o parser está
            interpretando os dados.
          </p>

          <div className="tse-test-warning">
            <strong>
              Ambiente de teste
            </strong>

            <span>
              Nenhum dado será gravado no
              Supabase.
            </span>
          </div>

        </div>

        {/* ================================================
            UPLOAD
        ================================================= */}

        <section className="tse-test-card">

          <div className="tse-upload-area">

            <label
              htmlFor="arquivo-tse"
              className="tse-file-label"
            >
              Selecionar arquivo JSON
            </label>

            <input
              id="arquivo-tse"
              type="file"
              accept=".json,application/json"
              onChange={
                handleFileChange
              }
            />

            {arquivo && (
              <div className="tse-file-selected">

                <div>

                  <span>
                    Arquivo selecionado
                  </span>

                  <strong>
                    {arquivo.name}
                  </strong>

                </div>

                <span>
                  {(
                    arquivo.size / 1024
                  ).toFixed(1)}{" "}
                  KB
                </span>

              </div>
            )}

          </div>

          <div className="tse-actions">

            <button
              type="button"
              className="tse-primary"
              onClick={
                analisarArquivo
              }
              disabled={
                !arquivo ||
                carregando
              }
            >
              {carregando
                ? "Analisando..."
                : "Analisar arquivo"}
            </button>

            <button
              type="button"
              className="tse-secondary"
              onClick={limpar}
              disabled={
                carregando
              }
            >
              Limpar
            </button>

          </div>

          {erro && (
            <div className="tse-error">

              <strong>
                Erro
              </strong>

              <span>
                {erro}
              </span>

            </div>
          )}

        </section>

        {/* ================================================
            RESULTADO
        ================================================= */}

        {diagnostico && (
          <>

            <section className="tse-test-card">

              <div className="tse-section-header">

                <div>

                  <p className="eyebrow">
                    DIAGNÓSTICO
                  </p>

                  <h2>
                    Estrutura identificada
                  </h2>

                </div>

                <span className="tse-ok-pill">
                  OK
                </span>

              </div>

              <div className="tse-grid">

                <div className="tse-info-box">

                  <span>
                    Arquivo
                  </span>

                  <strong>
                    {diagnostico.arquivo}
                  </strong>

                </div>

                <div className="tse-info-box">

                  <span>
                    SHA-256
                  </span>

                  <strong className="tse-mono">
                    {diagnostico.sha256}
                  </strong>

                </div>

                <div className="tse-info-box">

                  <span>
                    Tamanho aproximado
                  </span>

                  <strong>
                    {diagnostico.tamanhoAproximado.toLocaleString(
                      "pt-BR"
                    )}{" "}
                    bytes
                  </strong>

                </div>

                <div className="tse-info-box">

                  <span>
                    Campos no nível raiz
                  </span>

                  <strong>
                    {
                      diagnostico.totalTopLevelKeys
                    }
                  </strong>

                </div>

              </div>

            </section>

            {/* ==========================================
                LOCALIZAÇÃO
            =========================================== */}

            <section className="tse-test-card">

              <div className="tse-section-header">

                <div>

                  <p className="eyebrow">
                    LOCALIZAÇÃO
                  </p>

                  <h2>
                    Dados geográficos
                  </h2>

                </div>

              </div>

              <div className="tse-grid">

                <div className="tse-info-box">

                  <span>
                    UF
                  </span>

                  <strong>
                    {diagnostico.localizacao.uf ??
                      "—"}
                  </strong>

                </div>

                <div className="tse-info-box">

                  <span>
                    Município
                  </span>

                  <strong>
                    {diagnostico.localizacao
                      .municipio ??
                      "—"}
                  </strong>

                </div>

                <div className="tse-info-box">

                  <span>
                    Zona
                  </span>

                  <strong>
                    {diagnostico.localizacao.zona ??
                      "—"}
                  </strong>

                </div>

                <div className="tse-info-box">

                  <span>
                    Seção
                  </span>

                  <strong>
                    {diagnostico.localizacao.secao ??
                      "—"}
                  </strong>

                </div>

              </div>

            </section>

            {/* ==========================================
                EA20
            =========================================== */}

            <section className="tse-test-card">

              <div className="tse-section-header">

                <div>

                  <p className="eyebrow">
                    EA20
                  </p>

                  <h2>
                    Resultado unificado
                  </h2>

                </div>

                <span
                  className={
                    ea20
                      ? "tse-ok-pill"
                      : "tse-warning-pill"
                  }
                >
                  {ea20
                    ? "IDENTIFICADO"
                    : "NÃO IDENTIFICADO"}
                </span>

              </div>

              {!ea20 && (
                <div className="tse-empty">

                  <strong>
                    Estrutura EA20 não
                    identificada.
                  </strong>

                  <span>
                    O parser não encontrou
                    uma estrutura compatível
                    com EA20 neste arquivo.
                  </span>

                </div>
              )}

              {ea20 && (
                <>

                  <div className="tse-grid">

                    <div className="tse-info-box">

                      <span>
                        Abrangência
                      </span>

                      <strong>
                        {
                          ea20.abrangencia
                        }
                      </strong>

                    </div>

                    <div className="tse-info-box">

                      <span>
                        UF
                      </span>

                      <strong>
                        {ea20.uf ??
                          "—"}
                      </strong>

                    </div>

                    <div className="tse-info-box">

                      <span>
                        Município
                      </span>

                      <strong>
                        {ea20.municipio ??
                          "—"}
                      </strong>

                    </div>

                    <div className="tse-info-box">

                      <span>
                        Zona
                      </span>

                      <strong>
                        {ea20.zona ??
                          "—"}
                      </strong>

                    </div>

                    <div className="tse-info-box">

                      <span>
                        Seção
                      </span>

                      <strong>
                        {ea20.secao ??
                          "—"}
                      </strong>

                    </div>

                    <div className="tse-info-box">

                      <span>
                        Total de votos
                      </span>

                      <strong>
                        {ea20.totalVotos ===
                        null
                          ? "—"
                          : ea20.totalVotos.toLocaleString(
                              "pt-BR"
                            )}
                      </strong>

                    </div>

                    <div className="tse-info-box">

                      <span>
                        Candidatos
                      </span>

                      <strong>
                        {
                          ea20.totalCandidatos
                        }
                      </strong>

                    </div>

                  </div>

                  {/* CANDIDATOS */}

                  <div className="tse-candidates">

                    <div className="tse-subtitle">
                      Candidatos encontrados
                    </div>

                    {ea20.candidatos
                      .length ===
                      0 && (
                      <div className="tse-empty">
                        <strong>
                          Nenhum candidato
                          identificado.
                        </strong>

                        <span>
                          A estrutura de
                          candidatos ainda
                          precisa ser mapeada.
                        </span>
                      </div>
                    )}

                    {ea20.candidatos
                      .map(
                        (
                          candidato
                        ) => (
                          <div
                            className="tse-candidate-row"
                            key={`${candidato.numero}-${candidato.nome ?? ""}`}
                          >

                            <span className="tse-candidate-number">
                              {
                                candidato.numero
                              }
                            </span>

                            <div className="tse-candidate-name">

                              <strong>
                                {
                                  candidato.nome ??
                                  "Nome não identificado"
                                }
                              </strong>

                              <small>
                                Número{" "}
                                {
                                  candidato.numero
                                }
                              </small>

                            </div>

                            <strong className="tse-candidate-votes">

                              {candidato.votos ===
                              null
                                ? "—"
                                : candidato.votos.toLocaleString(
                                    "pt-BR"
                                  )}{" "}
                              votos

                            </strong>

                          </div>
                        )
                      )}

                  </div>

                </>
              )}

            </section>

            {/* ==========================================
                SEÇÕES
            =========================================== */}

            <section className="tse-test-card">

              <div className="tse-section-header">

                <div>

                  <p className="eyebrow">
                    SEÇÕES
                  </p>

                  <h2>
                    Referências encontradas
                  </h2>

                </div>

                <span className="tse-count-pill">

                  {
                    diagnostico
                      .totalReferenciasSecao
                  }

                </span>

              </div>

              {diagnostico
                .referenciasSecao
                .length ===
                0 ? (
                <div className="tse-empty">

                  <strong>
                    Nenhuma referência de
                    seção identificada.
                  </strong>

                  <span>
                    Este arquivo pode não
                    conter informações de
                    seção ou o formato ainda
                    não foi mapeado.
                  </span>

                </div>
              ) : (
                <div className="tse-reference-list">

                  {diagnostico.referenciasSecao.map(
                    (
                      referencia,
                      index
                    ) => (

                      <div
                        className="tse-reference-row"
                        key={index}
                      >

                        <span>
                          {referencia.uf ??
                            "—"}
                        </span>

                        <span>
                          {referencia.municipio ??
                            "—"}
                        </span>

                        <span>
                          Z{" "}
                          {referencia.zona ??
                            "—"}
                        </span>

                        <span>
                          S{" "}
                          {referencia.secao ??
                            "—"}
                        </span>

                        <span>
                          {referencia.dataArquivo ??
                            "—"}{" "}
                          {referencia.horaArquivo ??
                            ""}
                        </span>

                      </div>

                    )
                  )}

                </div>
              )}

            </section>

            {/* ==========================================
                RAW JSON
            =========================================== */}

            <section className="tse-test-card">

              <div className="tse-section-header">

                <div>

                  <p className="eyebrow">
                    DEBUG
                  </p>

                  <h2>
                    Resultado completo
                  </h2>

                </div>

              </div>

              <details>

                <summary>
                  Mostrar JSON do diagnóstico
                </summary>

                <pre className="tse-json">

                  {JSON.stringify(
                    resultado,
                    null,
                    2
                  )}

                </pre>

              </details>

            </section>

          </>
        )}

      </section>
    </main>
  );
}