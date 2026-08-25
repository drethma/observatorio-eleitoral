from pathlib import Path
import numpy as np
import pandas as pd
import pyarrow.parquet as pq


ARQUIVO = Path(
    "data/historico/tse-2022-completo.parquet"
)

SAIDA = Path(
    "data/analise"
)

ARQUIVO_TODAS = (
    SAIDA /
    "anomalias-2022-municipio-todas.csv"
)

ARQUIVO_TOP = (
    SAIDA /
    "anomalias-2022-municipio-top100.csv"
)


CHAVE_SECAO = [
    "uf",
    "codigo_municipio_tse",
    "codigo_zona_tse",
    "codigo_secao_tse",
]

CHAVE_MUNICIPIO = [
    "uf",
    "codigo_municipio_tse",
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
    "tipo_votavel",
    "votos",
]


def robust_center_scale(
    serie: pd.Series
):
    """
    Retorna mediana e escala robusta baseada em MAD.
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

    escala = 1.4826 * mad

    if (
        not np.isfinite(escala)
        or escala == 0
    ):
        escala = serie.std()

    if (
        not np.isfinite(escala)
        or escala == 0
    ):
        escala = 1.0

    return mediana, escala


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
        return "outros"

    return "outros"


def escolher_nome(
    serie
):
    valores = [
        str(x)
        for x in serie.dropna().unique()
        if str(x).strip()
    ]

    if not valores:
        return ""

    return sorted(
        valores,
        key=lambda x: (
            x.count(" "),
            len(x)
        )
    )[0]


def adicionar_medida_municipal(
    df,
    coluna_delta,
    n1,
    n2,
    prefixo,
):
    """
    Compara uma seção com a distribuição do próprio município
    e também considera o tamanho da seção.

    A incerteza aumenta quando a seção é pequena.
    """

    grupo = df.groupby(
        CHAVE_MUNICIPIO,
        dropna=False
    )

    mediana = grupo[
        coluna_delta
    ].transform("median")

    mad = (
        grupo[
            coluna_delta
        ]
        .transform(
            lambda s:
                np.median(
                    np.abs(
                        s -
                        s.median()
                    )
                )
        )
    )

    escala = (
        1.4826 * mad
    )

    escala_fallback = (
        grupo[
            coluna_delta
        ]
        .transform("std")
    )

    escala = np.where(
        np.isfinite(escala)
        & (escala > 0),
        escala,
        np.where(
            np.isfinite(
                escala_fallback
            )
            &
            (
                escala_fallback
                > 0
            ),
            escala_fallback,
            1.0
        )
    )

    # Aproximação de erro amostral para uma proporção.
    p1 = np.clip(
        n1 / np.maximum(
            df[f"votos_totais_t1"],
            1
        ),
        0,
        1
    )

    p2 = np.clip(
        n2 / np.maximum(
            df[f"votos_totais_t2"],
            1
        ),
        0,
        1
    )

    # Os deltas já estão em pontos percentuais.
    # Transformamos a escala proporcional para estimar
    # uma incerteza mínima relacionada ao tamanho da seção.
    se = np.sqrt(
        (
            p1 * (1 - p1)
            /
            np.maximum(
                df["votos_validos_t1"],
                1
            )
        )
        +
        (
            p2 * (1 - p2)
            /
            np.maximum(
                df["votos_validos_t2"],
                1
            )
        )
    ) * 100

    distancia = (
        df[coluna_delta] -
        mediana
    )

    denominador = np.sqrt(
        escala ** 2 +
        se ** 2
    )

    score = np.abs(
        distancia
    ) / np.maximum(
        denominador,
        0.25
    )

    df[
        f"{prefixo}_mediana_municipio"
    ] = mediana

    df[
        f"{prefixo}_desvio_municipio"
    ] = distancia

    df[
        f"{prefixo}_score_local"
    ] = score

    return df


def main():
    print(
        "\n=== ANALISE LOCAL POR MUNICIPIO - 2022 ===\n"
    )

    if not ARQUIVO.exists():
        raise FileNotFoundError(
            f"Arquivo nao encontrado: {ARQUIVO}"
        )

    SAIDA.mkdir(
        parents=True,
        exist_ok=True
    )

    print(
        "Lendo:",
        ARQUIVO
    )

    tabela = pq.read_table(
        ARQUIVO,
        columns=COLUNAS
    )

    df = tabela.to_pandas()

    print(
        "Registros:",
        f"{len(df):,}".replace(",", ".")
    )

    # --------------------------------------------------------
    # Tipagem
    # --------------------------------------------------------

    for coluna in [
        "turno",
        "zona",
        "secao",
        "numero_candidato",
        "votos",
    ]:
        df[coluna] = pd.to_numeric(
            df[coluna],
            errors="coerce"
        )

    df["votos"] = (
        df["votos"]
        .fillna(0)
        .astype("int64")
    )

    df = df[
        df["ano"] == 2022
    ].copy()

    # --------------------------------------------------------
    # Normalização de chaves
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # Separar exterior
    # --------------------------------------------------------

    df_brasil = df[
        df["uf"] != "ZZ"
    ].copy()

    print(
        "Registros Brasil:",
        f"{len(df_brasil):,}".replace(
            ",",
            "."
        )
    )

    print(
        "Registros exterior (ZZ):",
        f"{len(df) - len(df_brasil):,}".replace(
            ",",
            "."
        )
    )

    df = df_brasil

    # --------------------------------------------------------
    # Grupo de votação
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # Agregação por seção
    # --------------------------------------------------------

    votos = (
        df.groupby(
            CHAVE_SECAO +
            ["turno", "grupo"],
            dropna=False,
            as_index=False
        )["votos"]
        .sum()
    )

    larga = votos.pivot_table(
        index=CHAVE_SECAO +
        ["turno"],
        columns="grupo",
        values="votos",
        fill_value=0,
        aggfunc="sum"
    ).reset_index()

    larga.columns.name = None

    for coluna in [
        "lula",
        "bolsonaro",
        "branco",
        "nulo",
        "outros",
    ]:
        if coluna not in larga.columns:
            larga[coluna] = 0

    larga["votos_validos"] = (
        larga[
            [
                "lula",
                "bolsonaro",
                "outros",
            ]
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
            /
            larga["votos_validos"]
        ) * 100,
        0
    )

    larga["share_bolsonaro"] = np.where(
        larga["votos_validos"] > 0,
        (
            larga["bolsonaro"]
            /
            larga["votos_validos"]
        ) * 100,
        0
    )

    larga["share_branco"] = np.where(
        larga["votos_totais"] > 0,
        (
            larga["branco"]
            /
            larga["votos_totais"]
        ) * 100,
        0
    )

    larga["share_nulo"] = np.where(
        larga["votos_totais"] > 0,
        (
            larga["nulo"]
            /
            larga["votos_totais"]
        ) * 100,
        0
    )

    # --------------------------------------------------------
    # Separar turnos
    # --------------------------------------------------------

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

    def renomear_t1(
        coluna
    ):
        if coluna in CHAVE_SECAO:
            return coluna

        return f"{coluna}_t1"

    def renomear_t2(
        coluna
    ):
        if coluna in CHAVE_SECAO:
            return coluna

        return f"{coluna}_t2"

    t1 = t1.rename(
        columns={
            coluna:
                renomear_t1(
                    coluna
                )
            for coluna in t1.columns
        }
    )

    t2 = t2.rename(
        columns={
            coluna:
                renomear_t2(
                    coluna
                )
            for coluna in t2.columns
        }
    )

    comparacao = t1.merge(
        t2,
        on=CHAVE_SECAO,
        how="inner"
    )

    print(
        "Seções comparáveis:",
        f"{len(comparacao):,}".replace(
            ",",
            "."
        )
    )

    # --------------------------------------------------------
    # Nome municipal somente para apresentação
    # --------------------------------------------------------

    nomes = (
        df.groupby(
            CHAVE_MUNICIPIO,
            dropna=False
        )["municipio"]
        .agg(
            escolher_nome
        )
        .reset_index()
    )

    comparacao = comparacao.merge(
        nomes,
        on=CHAVE_MUNICIPIO,
        how="left"
    )

    # --------------------------------------------------------
    # Mínimo de votos
    # --------------------------------------------------------

    comparacao["elegivel"] = (
        (
            comparacao[
                "votos_totais_t1"
            ] >= 50
        )
        &
        (
            comparacao[
                "votos_totais_t2"
            ] >= 50
        )
    )

    comparacao = comparacao[
        comparacao["elegivel"]
    ].copy()

    print(
        "Seções com >= 50 votos:",
        f"{len(comparacao):,}".replace(
            ",",
            "."
        )
    )

    # --------------------------------------------------------
    # Deltas
    # --------------------------------------------------------

    comparacao["delta_lula_share_pp"] = (
        comparacao["share_lula_t2"]
        -
        comparacao["share_lula_t1"]
    )

    comparacao[
        "delta_bolsonaro_share_pp"
    ] = (
        comparacao[
            "share_bolsonaro_t2"
        ]
        -
        comparacao[
            "share_bolsonaro_t1"
        ]
    )

    comparacao["delta_branco_pp"] = (
        comparacao["share_branco_t2"]
        -
        comparacao["share_branco_t1"]
    )

    comparacao["delta_nulo_pp"] = (
        comparacao["share_nulo_t2"]
        -
        comparacao["share_nulo_t1"]
    )

    comparacao["delta_votos_totais"] = (
        comparacao["votos_totais_t2"]
        -
        comparacao["votos_totais_t1"]
    )

    comparacao["delta_votos_totais_pct"] = np.where(
        comparacao["votos_totais_t1"] > 0,
        (
            comparacao["delta_votos_totais"]
            /
            comparacao["votos_totais_t1"]
        ) * 100,
        0
    )

    # --------------------------------------------------------
    # Scores locais
    # --------------------------------------------------------

    comparacao = adicionar_medida_municipal(
        comparacao,
        "delta_lula_share_pp",
        comparacao["lula_t1"],
        comparacao["lula_t2"],
        "lula"
    )

    comparacao = adicionar_medida_municipal(
        comparacao,
        "delta_bolsonaro_share_pp",
        comparacao["bolsonaro_t1"],
        comparacao["bolsonaro_t2"],
        "bolsonaro"
    )

    comparacao = adicionar_medida_municipal(
        comparacao,
        "delta_branco_pp",
        comparacao["branco_t1"],
        comparacao["branco_t2"],
        "branco"
    )

    comparacao = adicionar_medida_municipal(
        comparacao,
        "delta_nulo_pp",
        comparacao["nulo_t1"],
        comparacao["nulo_t2"],
        "nulo"
    )

    # --------------------------------------------------------
    # Score final
    # --------------------------------------------------------

    comparacao["score_lula"] = (
        comparacao[
            "lula_score_local"
        ]
    )

    comparacao["score_bolsonaro"] = (
        comparacao[
            "bolsonaro_score_local"
        ]
    )

    comparacao["score_branco"] = (
        comparacao[
            "branco_score_local"
        ]
    )

    comparacao["score_nulo"] = (
        comparacao[
            "nulo_score_local"
        ]
    )

    comparacao["indice_local"] = (
        comparacao[
            [
                "score_lula",
                "score_bolsonaro",
                "score_branco",
                "score_nulo",
            ]
        ]
        .abs()
        .max(
            axis=1
        )
    )

    comparacao["classificacao"] = pd.cut(
        comparacao["indice_local"],
        bins=[
            -np.inf,
            2.5,
            3.5,
            5,
            7,
            np.inf,
        ],
        labels=[
            "normal",
            "atencao",
            "atipico",
            "muito_atipico",
            "extremamente_atipico",
        ]
    )

    comparacao = comparacao.sort_values(
        [
            "indice_local",
            "votos_totais_t1",
            "votos_totais_t2",
        ],
        ascending=[
            False,
            False,
            False,
        ]
    )

    # --------------------------------------------------------
    # Relatório
    # --------------------------------------------------------

    colunas = [
        "uf",
        "codigo_municipio_tse",
        "municipio",
        "codigo_zona_tse",
        "codigo_secao_tse",

        "votos_totais_t1",
        "votos_totais_t2",

        "lula_t1",
        "lula_t2",
        "bolsonaro_t1",
        "bolsonaro_t2",

        "branco_t1",
        "branco_t2",
        "nulo_t1",
        "nulo_t2",

        "delta_lula_share_pp",
        "delta_bolsonaro_share_pp",
        "delta_branco_pp",
        "delta_nulo_pp",

        "lula_mediana_municipio",
        "bolsonaro_mediana_municipio",
        "branco_mediana_municipio",
        "nulo_mediana_municipio",

        "lula_desvio_municipio",
        "bolsonaro_desvio_municipio",
        "branco_desvio_municipio",
        "nulo_desvio_municipio",

        "score_lula",
        "score_bolsonaro",
        "score_branco",
        "score_nulo",

        "indice_local",
        "classificacao",
    ]

    resultado = comparacao[
        colunas
    ].copy()

    # --------------------------------------------------------
    # Arredondamento
    # --------------------------------------------------------

    for coluna in [
        "delta_lula_share_pp",
        "delta_bolsonaro_share_pp",
        "delta_branco_pp",
        "delta_nulo_pp",

        "lula_mediana_municipio",
        "bolsonaro_mediana_municipio",
        "branco_mediana_municipio",
        "nulo_mediana_municipio",

        "lula_desvio_municipio",
        "bolsonaro_desvio_municipio",
        "branco_desvio_municipio",
        "nulo_desvio_municipio",

        "score_lula",
        "score_bolsonaro",
        "score_branco",
        "score_nulo",

        "indice_local",
    ]:
        resultado[coluna] = (
            pd.to_numeric(
                resultado[coluna],
                errors="coerce"
            )
            .round(4)
        )

    # --------------------------------------------------------
    # Salvar
    # --------------------------------------------------------

    resultado.to_csv(
        ARQUIVO_TODAS,
        index=False,
        encoding="utf-8-sig"
    )

    resultado.head(
        100
    ).to_csv(
        ARQUIVO_TOP,
        index=False,
        encoding="utf-8-sig"
    )

    # --------------------------------------------------------
    # Resumo
    # --------------------------------------------------------

    print(
        "\n=== RESUMO LOCAL ===\n"
    )

    distribuicao = (
        resultado[
            "classificacao"
        ]
        .astype(str)
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
            .replace(",", ".")
        )

    print(
        "\n=== TOP 20 DESVIOS LOCAIS ===\n"
    )

    for _, linha in (
        resultado.head(20)
        .iterrows()
    ):
        print(
            f"{linha['uf']} | "
            f"{linha['municipio']} | "
            f"Município {linha['codigo_municipio_tse']} | "
            f"Zona {linha['codigo_zona_tse']} | "
            f"Seção {linha['codigo_secao_tse']} | "
            f"1T={int(linha['votos_totais_t1'])} | "
            f"2T={int(linha['votos_totais_t2'])} | "
            f"score={linha['indice_local']:.2f} | "
            f"{linha['classificacao']}"
        )

    print(
        "\nArquivos:"
    )

    print(
        ARQUIVO_TODAS
    )

    print(
        ARQUIVO_TOP
    )

    print(
        "\n=== FIM ===\n"
    )


if __name__ == "__main__":
    main()