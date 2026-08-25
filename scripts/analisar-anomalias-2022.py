from pathlib import Path
import numpy as np
import pandas as pd
import pyarrow.parquet as pq


ARQUIVO = Path(
    "data/historico/tse-2022-completo.parquet"
)

DIRETORIO_SAIDA = Path(
    "data/analise"
)

ARQUIVO_TODAS = (
    DIRETORIO_SAIDA
    / "anomalias-2022-todas-secoes-corrigido.csv"
)

ARQUIVO_TOP = (
    DIRETORIO_SAIDA
    / "anomalias-2022-top100-corrigido.csv"
)

ARQUIVO_INTEGRIDADE = (
    DIRETORIO_SAIDA
    / "integridade-secoes-2022.csv"
)


# ============================================================
# CHAVE CORRETA DA SEÇÃO
#
# O nome do município NÃO participa da identificação.
# Usamos os códigos oficiais.
# ============================================================

CHAVE_SECAO = [
    "uf",
    "codigo_municipio_tse",
    "codigo_zona_tse",
    "codigo_secao_tse",
]


COLUNAS = [
    "ano",
    "turno",
    "uf",
    "municipio",
    "codigo_municipio_tse",
    "codigo_zona_tse",
    "codigo_secao_tse",
    "zona",
    "secao",
    "numero_candidato",
    "candidato",
    "tipo_votavel",
    "votos",
]


# ============================================================
# FUNÇÕES
# ============================================================

def robust_zscore(serie: pd.Series) -> pd.Series:
    """
    Calcula z-score robusto usando mediana e MAD.

    Evita que poucos valores extremos dominem a escala.
    """
    serie = pd.to_numeric(
        serie,
        errors="coerce"
    ).astype(float)

    mediana = serie.median()

    mad = np.median(
        np.abs(
            serie - mediana
        )
    )

    if (
        not np.isfinite(mad)
        or mad == 0
    ):
        return pd.Series(
            0.0,
            index=serie.index
        )

    return (
        0.6745
        * (serie - mediana)
        / mad
    )


def arredondar(
    serie: pd.Series,
    casas: int = 4
) -> pd.Series:
    return pd.to_numeric(
        serie,
        errors="coerce"
    ).round(casas)


def grupo_votacao(
    numero,
    tipo
):
    try:
        numero = int(numero)
    except Exception:
        numero = 0

    tipo = str(
        tipo or ""
    ).lower()

    if numero == 13:
        return "lula"

    if numero == 22:
        return "bolsonaro"

    if (
        numero == 95
        or tipo == "branco"
    ):
        return "branco"

    if (
        numero == 96
        or tipo == "nulo"
    ):
        return "nulo"

    if tipo == "candidato":
        return "outros_candidatos"

    return "outros"


def escolher_nome(series):
    """
    Escolhe a melhor versão do nome textual
    quando a mesma chave tem variações de encoding.

    Prioriza a versão com menos caracteres '�'.
    """
    valores = [
        str(x)
        for x in series.dropna().unique()
        if str(x).strip()
    ]

    if not valores:
        return ""

    valores = sorted(
        valores,
        key=lambda x: (
            x.count("�"),
            len(x)
        )
    )

    return valores[0]


def classificar_indice(
    valor
):
    valor = abs(
        float(valor)
    )

    if valor >= 8:
        return "extremamente_atipico"

    if valor >= 6:
        return "muito_atipico"

    if valor >= 4:
        return "atipico"

    if valor >= 3:
        return "atencao"

    return "normal"


# ============================================================
# MAIN
# ============================================================

def main():
    print(
        "\n=== ANALISE CORRIGIDA DE ANOMALIAS ELEITORAIS 2022 ===\n"
    )

    if not ARQUIVO.exists():
        raise FileNotFoundError(
            f"Arquivo nao encontrado: {ARQUIVO}"
        )

    DIRETORIO_SAIDA.mkdir(
        parents=True,
        exist_ok=True
    )

    print(
        f"Lendo: {ARQUIVO}"
    )

    tabela = pq.read_table(
        ARQUIVO,
        columns=COLUNAS
    )

    df = tabela.to_pandas()

    print(
        "Registros lidos:",
        f"{len(df):,}".replace(
            ",",
            "."
        )
    )

    # ========================================================
    # TIPAGEM
    # ========================================================

    df["turno"] = pd.to_numeric(
        df["turno"],
        errors="coerce"
    )

    df["zona"] = pd.to_numeric(
        df["zona"],
        errors="coerce"
    )

    df["secao"] = pd.to_numeric(
        df["secao"],
        errors="coerce"
    )

    df["numero_candidato"] = pd.to_numeric(
        df["numero_candidato"],
        errors="coerce"
    )

    df["votos"] = pd.to_numeric(
        df["votos"],
        errors="coerce"
    ).fillna(0).astype(
        "int64"
    )

    df = df[
        df["ano"] == 2022
    ].copy()

    # ========================================================
    # NORMALIZAÇÃO DAS CHAVES
    # ========================================================

    for coluna in [
        "uf",
        "codigo_municipio_tse",
        "codigo_zona_tse",
        "codigo_secao_tse",
    ]:
        df[coluna] = (
            df[coluna]
            .fillna("")
            .astype(str)
            .str.strip()
        )

    # ========================================================
    # GRUPO DE VOTAÇÃO
    # ========================================================

    df["grupo"] = [
        grupo_votacao(
            numero,
            tipo
        )
        for numero, tipo in zip(
            df["numero_candidato"],
            df["tipo_votavel"]
        )
    ]

    # ========================================================
    # DIAGNÓSTICO DAS CHAVES
    # ========================================================

    chaves_turno = (
        df.groupby(
            CHAVE_SECAO + ["turno"],
            dropna=False
        )
        .size()
        .reset_index(
            name="registros"
        )
    )

    print(
        "\nSeções por turno usando a chave oficial:"
    )

    resumo_turno = (
        chaves_turno.groupby(
            "turno"
        )
        .size()
        .sort_index()
    )

    for turno, quantidade in (
        resumo_turno.items()
    ):
        print(
            f"  Turno {int(turno)}:",
            f"{int(quantidade):,}".replace(
                ",",
                "."
            )
        )

    # ========================================================
    # DIMENSÃO TEXTUAL DO MUNICÍPIO
    #
    # O nome é apenas informativo.
    # Não participa da chave.
    # ========================================================

    municipios = (
        df.groupby(
            CHAVE_SECAO,
            dropna=False
        )
        .agg(
            municipio=(
                "municipio",
                escolher_nome
            ),
            zona=(
                "zona",
                "first"
            ),
            secao=(
                "secao",
                "first"
            )
        )
        .reset_index()
    )

    # ========================================================
    # AGREGAÇÃO POR SEÇÃO / TURNO / GRUPO
    # ========================================================

    votos = (
        df.groupby(
            CHAVE_SECAO
            + ["turno", "grupo"],
            dropna=False,
            as_index=False
        )["votos"]
        .sum()
    )

    larga = votos.pivot_table(
        index=CHAVE_SECAO
        + ["turno"],
        columns="grupo",
        values="votos",
        aggfunc="sum",
        fill_value=0
    ).reset_index()

    larga.columns.name = None

    for coluna in [
        "lula",
        "bolsonaro",
        "branco",
        "nulo",
        "outros_candidatos",
        "outros",
    ]:
        if coluna not in larga.columns:
            larga[coluna] = 0

    # ========================================================
    # TOTAIS
    # ========================================================

    colunas_validas = [
        "lula",
        "bolsonaro",
        "outros_candidatos",
        "outros",
    ]

    larga["votos_validos"] = (
        larga[
            colunas_validas
        ].sum(axis=1)
    )

    larga["votos_totais"] = (
        larga[
            [
                "votos_validos",
                "branco",
                "nulo",
            ]
        ].sum(axis=1)
    )

    larga["share_lula"] = np.where(
        larga["votos_validos"] > 0,
        (
            larga["lula"]
            / larga["votos_validos"]
        ) * 100,
        0
    )

    larga["share_bolsonaro"] = np.where(
        larga["votos_validos"] > 0,
        (
            larga["bolsonaro"]
            / larga["votos_validos"]
        ) * 100,
        0
    )

    larga["taxa_branco"] = np.where(
        larga["votos_totais"] > 0,
        (
            larga["branco"]
            / larga["votos_totais"]
        ) * 100,
        0
    )

    larga["taxa_nulo"] = np.where(
        larga["votos_totais"] > 0,
        (
            larga["nulo"]
            / larga["votos_totais"]
        ) * 100,
        0
    )

    # ========================================================
    # SEPARAÇÃO DOS TURNOS
    # ========================================================

    t1 = larga[
        larga["turno"] == 1
    ].copy()

    t2 = larga[
        larga["turno"] == 2
    ].copy()

    t1 = t1.drop(
        columns=["turno"]
    )

    t2 = t2.drop(
        columns=["turno"]
    )

    colunas_chave = set(
        CHAVE_SECAO
    )

    t1 = t1.rename(
        columns={
            coluna:
                f"{coluna}_t1"
            for coluna in t1.columns
            if coluna not in colunas_chave
        }
    )

    t2 = t2.rename(
        columns={
            coluna:
                f"{coluna}_t2"
            for coluna in t2.columns
            if coluna not in colunas_chave
        }
    )

    # ========================================================
    # COMPARAÇÃO 1º x 2º TURNO
    # ========================================================

    comparacao = t1.merge(
        t2,
        on=CHAVE_SECAO,
        how="inner"
    )

    comparacao = comparacao.merge(
        municipios,
        on=CHAVE_SECAO,
        how="left"
    )

    print(
        "\nSeções comparáveis:",
        f"{len(comparacao):,}".replace(
            ",",
            "."
        )
    )

    # ========================================================
    # TAMANHO MÍNIMO
    #
    # Evita que seções com pouquíssimos votos dominem
    # o ranking estatístico.
    # ========================================================

    comparacao["selecao_minima"] = (
        (
            comparacao["votos_totais_t1"]
            >= 30
        )
        &
        (
            comparacao["votos_totais_t2"]
            >= 30
        )
    )

    elegiveis = comparacao[
        comparacao["selecao_minima"]
    ].copy()

    print(
        "Seções com >= 30 votos em ambos os turnos:",
        f"{len(elegiveis):,}".replace(
            ",",
            "."
        )
    )

    # ========================================================
    # VARIAÇÕES
    # ========================================================

    elegiveis["delta_lula_votos"] = (
        elegiveis["lula_t2"]
        - elegiveis["lula_t1"]
    )

    elegiveis["delta_bolsonaro_votos"] = (
        elegiveis["bolsonaro_t2"]
        - elegiveis["bolsonaro_t1"]
    )

    elegiveis["delta_lula_share_pp"] = (
        elegiveis["share_lula_t2"]
        - elegiveis["share_lula_t1"]
    )

    elegiveis["delta_bolsonaro_share_pp"] = (
        elegiveis["share_bolsonaro_t2"]
        - elegiveis["share_bolsonaro_t1"]
    )

    elegiveis["delta_branco_pp"] = (
        elegiveis["taxa_branco_t2"]
        - elegiveis["taxa_branco_t1"]
    )

    elegiveis["delta_nulo_pp"] = (
        elegiveis["taxa_nulo_t2"]
        - elegiveis["taxa_nulo_t1"]
    )

    elegiveis["delta_votos_totais"] = (
        elegiveis["votos_totais_t2"]
        - elegiveis["votos_totais_t1"]
    )

    elegiveis["delta_votos_totais_pct"] = np.where(
        elegiveis["votos_totais_t1"] > 0,
        (
            (
                elegiveis["votos_totais_t2"]
                - elegiveis["votos_totais_t1"]
            )
            /
            elegiveis["votos_totais_t1"]
        )
        * 100,
        0
    )

    # ========================================================
    # MUDANÇA PRINCIPAL
    #
    # Mede a distância conjunta das mudanças
    # de participação de Lula e Bolsonaro.
    # ========================================================

    elegiveis["mudanca_principal"] = np.sqrt(
        (
            elegiveis["delta_lula_share_pp"]
        ) ** 2
        +
        (
            elegiveis["delta_bolsonaro_share_pp"]
        ) ** 2
    )

    # ========================================================
    # Z-SCORES ROBUSTOS
    #
    # Não usamos o delta de votos totais.
    # ========================================================

    elegiveis["z_lula"] = robust_zscore(
        elegiveis[
            "delta_lula_share_pp"
        ]
    )

    elegiveis["z_bolsonaro"] = robust_zscore(
        elegiveis[
            "delta_bolsonaro_share_pp"
        ]
    )

    elegiveis["z_branco"] = robust_zscore(
        elegiveis[
            "delta_branco_pp"
        ]
    )

    elegiveis["z_nulo"] = robust_zscore(
        elegiveis[
            "delta_nulo_pp"
        ]
    )

    # ========================================================
    # ÍNDICE FINAL
    #
    # Usa apenas:
    # - mudança Lula
    # - mudança Bolsonaro
    # - mudança branco
    # - mudança nulo
    #
    # Não usa o nome do município nem a variação
    # percentual do total de votos.
    # ========================================================

    elegiveis["indice_anomalia"] = (
        elegiveis[
            [
                "z_lula",
                "z_bolsonaro",
                "z_branco",
                "z_nulo",
            ]
        ]
        .abs()
        .max(
            axis=1
        )
    )

    elegiveis["classificacao"] = (
        elegiveis[
            "indice_anomalia"
        ].apply(
            classificar_indice
        )
    )

    elegiveis = elegiveis.sort_values(
        [
            "indice_anomalia",
            "mudanca_principal",
        ],
        ascending=[
            False,
            False,
        ]
    )

    # ========================================================
    # CASO DE CONTROLE
    # São João de Meriti
    # Município 59013
    # Zona 187
    # Seção 307
    # ========================================================

    caso = elegiveis[
        (elegiveis["uf"] == "RJ")
        &
        (
            elegiveis[
                "codigo_municipio_tse"
            ] == "59013"
        )
        &
        (
            elegiveis[
                "codigo_zona_tse"
            ] == "187"
        )
        &
        (
            elegiveis[
                "codigo_secao_tse"
            ] == "307"
        )
    ]

    if not caso.empty:
        print(
            "\n=== CASO DE CONTROLE: "
            "RJ / 59013 / 187 / 307 ==="
        )

        colunas_caso = [
            "uf",
            "municipio",
            "codigo_municipio_tse",
            "codigo_zona_tse",
            "codigo_secao_tse",
            "votos_totais_t1",
            "votos_totais_t2",
            "delta_votos_totais",
            "delta_votos_totais_pct",
            "delta_lula_share_pp",
            "delta_bolsonaro_share_pp",
            "delta_branco_pp",
            "delta_nulo_pp",
            "indice_anomalia",
            "classificacao",
        ]

        print(
            caso[
                colunas_caso
            ].to_string(
                index=False
            )
        )

    # ========================================================
    # COLUNAS DE SAÍDA
    # ========================================================

    colunas_saida = [
        "uf",
        "codigo_municipio_tse",
        "municipio",
        "codigo_zona_tse",
        "codigo_secao_tse",
        "zona",
        "secao",

        "lula_t1",
        "lula_t2",

        "bolsonaro_t1",
        "bolsonaro_t2",

        "branco_t1",
        "branco_t2",

        "nulo_t1",
        "nulo_t2",

        "votos_validos_t1",
        "votos_validos_t2",

        "votos_totais_t1",
        "votos_totais_t2",

        "share_lula_t1",
        "share_lula_t2",

        "share_bolsonaro_t1",
        "share_bolsonaro_t2",

        "taxa_branco_t1",
        "taxa_branco_t2",

        "taxa_nulo_t1",
        "taxa_nulo_t2",

        "delta_lula_votos",
        "delta_bolsonaro_votos",

        "delta_lula_share_pp",
        "delta_bolsonaro_share_pp",

        "delta_branco_pp",
        "delta_nulo_pp",

        "delta_votos_totais",
        "delta_votos_totais_pct",

        "mudanca_principal",

        "z_lula",
        "z_bolsonaro",
        "z_branco",
        "z_nulo",

        "indice_anomalia",
        "classificacao",
    ]

    resultado = elegiveis[
        colunas_saida
    ].copy()

    # ========================================================
    # ARREDONDAMENTO
    # ========================================================

    colunas_decimal = [
        "share_lula_t1",
        "share_lula_t2",
        "share_bolsonaro_t1",
        "share_bolsonaro_t2",
        "taxa_branco_t1",
        "taxa_branco_t2",
        "taxa_nulo_t1",
        "taxa_nulo_t2",
        "delta_lula_share_pp",
        "delta_bolsonaro_share_pp",
        "delta_branco_pp",
        "delta_nulo_pp",
        "delta_votos_totais_pct",
        "mudanca_principal",
        "z_lula",
        "z_bolsonaro",
        "z_branco",
        "z_nulo",
        "indice_anomalia",
    ]

    for coluna in colunas_decimal:
        resultado[coluna] = arredondar(
            resultado[coluna]
        )

    # ========================================================
    # SALVAR RESULTADO COMPLETO
    # ========================================================

    resultado.to_csv(
        ARQUIVO_TODAS,
        index=False,
        encoding="utf-8-sig"
    )

    # ========================================================
    # TOP 100
    # ========================================================

    resultado.head(
        100
    ).to_csv(
        ARQUIVO_TOP,
        index=False,
        encoding="utf-8-sig"
    )

    # ========================================================
    # INTEGRIDADE DAS CHAVES
    # ========================================================

    integridade = (
        df.groupby(
            CHAVE_SECAO + ["turno"],
            dropna=False
        )
        .agg(
            linhas=(
                "votos",
                "size"
            ),
            votos=(
                "votos",
                "sum"
            )
        )
        .reset_index()
    )

    integridade.to_csv(
        ARQUIVO_INTEGRIDADE,
        index=False,
        encoding="utf-8-sig"
    )

    # ========================================================
    # RESUMO
    # ========================================================

    print(
        "\n=== RESUMO CORRIGIDO ===\n"
    )

    distribuicao = (
        resultado[
            "classificacao"
        ]
        .value_counts()
    )

    for classe in [
        "normal",
        "atencao",
        "atipico",
        "muito_atipico",
        "extremamente_atipico",
    ]:
        print(
            f"{classe}:",
            f"{int(distribuicao.get(classe, 0)):,}"
            .replace(
                ",",
                "."
            )
        )

    # ========================================================
    # TOP 20
    # ========================================================

    print(
        "\nTop 20 seções:\n"
    )

    top20 = resultado.head(
        20
    )

    for _, linha in top20.iterrows():
        print(
            f"{linha['uf']} | "
            f"{linha['municipio']} | "
            f"Município TSE "
            f"{linha['codigo_municipio_tse']} | "
            f"Zona "
            f"{linha['codigo_zona_tse']} | "
            f"Seção "
            f"{linha['codigo_secao_tse']} | "
            f"índice="
            f"{linha['indice_anomalia']:.2f} | "
            f"{linha['classificacao']}"
        )

    # ========================================================
    # ARQUIVOS GERADOS
    # ========================================================

    print(
        "\nArquivos gerados:"
    )

    print(
        ARQUIVO_TODAS
    )

    print(
        ARQUIVO_TOP
    )

    print(
        ARQUIVO_INTEGRIDADE
    )

    print(
        "\n=== FIM ===\n"
    )


if __name__ == "__main__":
    main()