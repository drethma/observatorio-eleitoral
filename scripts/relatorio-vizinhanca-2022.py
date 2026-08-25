from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq


ARQUIVO = Path(
    "data/historico/tse-2022-completo.parquet"
)

DIRETORIO_SAIDA = Path(
    "data/analise"
)

ARQUIVO_SAIDA = (
    DIRETORIO_SAIDA /
    "relatorio-vizinhanca-2022-corrigido.csv"
)

RAIO = 10

CASOS = [
    {
        "id": "manoel_urbano",
        "uf": "AC",
        "municipio_codigo": "1554",
        "zona": 3,
        "secao": 100,
    },
    {
        "id": "seabra",
        "uf": "BA",
        "municipio_codigo": "38970",
        "zona": 88,
        "secao": 65,
    },
    {
        "id": "feijo",
        "uf": "AC",
        "municipio_codigo": "1139",
        "zona": 7,
        "secao": 67,
    },
]


COLUNAS = [
    "ano",
    "turno",
    "uf",
    "municipio",
    "codigo_municipio_tse",
    "zona",
    "secao",
    "numero_candidato",
    "candidato",
    "tipo_votavel",
    "votos",
]


# ============================================================
# GRUPOS DE VOTO
# ============================================================

def grupo_votacao(numero, tipo):
    try:
        numero = int(numero)
    except Exception:
        numero = 0

    tipo = str(
        tipo or ""
    ).strip().lower()

    if numero == 13:
        return "lula"

    if numero == 22:
        return "bolsonaro"

    if numero == 95 or tipo == "branco":
        return "branco"

    if numero == 96 or tipo == "nulo":
        return "nulo"

    if tipo == "candidato":
        return "outros_candidatos"

    return "outros"


# ============================================================
# MAIN
# ============================================================

def main():
    print(
        "\n=== RELATORIO DE VIZINHANCA 2022 - CORRIGIDO ===\n"
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
        "Lendo:",
        ARQUIVO
    )

    tabela = pq.read_table(
        ARQUIVO,
        columns=COLUNAS
    )

    df = tabela.to_pandas()

    print(
        "Registros carregados:",
        f"{len(df):,}".replace(",", ".")
    )

    # --------------------------------------------------------
    # Tipos
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

    df["ano"] = pd.to_numeric(
        df["ano"],
        errors="coerce"
    )

    # --------------------------------------------------------
    # Chave correta
    #
    # O nome do município NÃO participa da chave.
    # --------------------------------------------------------

    df["uf"] = (
        df["uf"]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    df["codigo_municipio_tse"] = (
        df["codigo_municipio_tse"]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    df["zona"] = (
        df["zona"]
        .fillna(0)
        .astype(int)
    )

    df["secao"] = (
        df["secao"]
        .fillna(0)
        .astype(int)
    )

    df = df[
        df["ano"] == 2022
    ].copy()

    # Apenas Brasil.
    # Exterior (ZZ) fica fora desta vizinhança.
    df = df[
        df["uf"] != "ZZ"
    ].copy()

    # --------------------------------------------------------
    # Grupo
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

    # ========================================================
    # AGREGAÇÃO POR SEÇÃO
    #
    # CHAVE:
    # UF + código município + zona + seção
    # ========================================================

    chave_secao = [
        "uf",
        "codigo_municipio_tse",
        "zona",
        "secao",
    ]

    resumo = (
        df.groupby(
            chave_secao
            + ["turno", "grupo"],
            as_index=False,
            dropna=False
        )["votos"]
        .sum()
    )

    largo = resumo.pivot_table(
        index=chave_secao + ["turno"],
        columns="grupo",
        values="votos",
        fill_value=0,
        aggfunc="sum"
    ).reset_index()

    largo.columns.name = None

    for coluna in [
        "lula",
        "bolsonaro",
        "branco",
        "nulo",
        "outros_candidatos",
        "outros",
    ]:
        if coluna not in largo.columns:
            largo[coluna] = 0

    largo["votos_validos"] = (
        largo[
            [
                "lula",
                "bolsonaro",
                "outros_candidatos",
                "outros",
            ]
        ]
        .sum(axis=1)
    )

    largo["votos_totais"] = (
        largo[
            [
                "votos_validos",
                "branco",
                "nulo",
            ]
        ]
        .sum(axis=1)
    )

    # --------------------------------------------------------
    # Nome do município somente para exibição
    #
    # Escolhemos uma única representação por código.
    # --------------------------------------------------------

    municipios = (
        df.groupby(
            [
                "uf",
                "codigo_municipio_tse",
            ],
            as_index=False
        )["municipio"]
        .agg(
            lambda s:
                sorted(
                    {
                        str(x)
                        for x in s.dropna()
                        if str(x).strip()
                    },
                    key=lambda x: (
                        x.count("�"),
                        len(x)
                    )
                )[0]
                if any(
                    str(x).strip()
                    for x in s.dropna()
                )
                else ""
        )
    )

    # ========================================================
    # GARANTIR UM REGISTRO POR SEÇÃO E TURNO
    # ========================================================

    t1 = largo[
        largo["turno"] == 1
    ].copy()

    t2 = largo[
        largo["turno"] == 2
    ].copy()

    t1 = t1.drop(
        columns=["turno"]
    )

    t2 = t2.drop(
        columns=["turno"]
    )

    colunas_chave = set(
        chave_secao
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

    comparacao = t1.merge(
        t2,
        on=chave_secao,
        how="outer"
    )

    comparacao = comparacao.merge(
        municipios,
        on=[
            "uf",
            "codigo_municipio_tse",
        ],
        how="left"
    )

    # Preenche somente os campos numéricos.
    colunas_numericas = [
        coluna
        for coluna in comparacao.columns
        if coluna.endswith("_t1")
        or coluna.endswith("_t2")
    ]

    for coluna in colunas_numericas:
        comparacao[coluna] = pd.to_numeric(
            comparacao[coluna],
            errors="coerce"
        ).fillna(0)

    # ========================================================
    # SEÇÕES DE VIZINHANÇA
    # ========================================================

    resultados = []

    for caso in CASOS:
        mascara = (
            (comparacao["uf"] == caso["uf"])
            &
            (
                comparacao[
                    "codigo_municipio_tse"
                ]
                == caso["municipio_codigo"]
            )
            &
            (
                comparacao["zona"]
                == caso["zona"]
            )
            &
            (
                comparacao["secao"].between(
                    caso["secao"] - RAIO,
                    caso["secao"] + RAIO
                )
            )
        )

        vizinhanca = comparacao[
            mascara
        ].copy()

        vizinhanca["caso"] = (
            caso["id"]
        )

        vizinhanca[
            "secao_analisada"
        ] = caso["secao"]

        vizinhanca[
            "distancia_secao"
        ] = (
            vizinhanca["secao"]
            - caso["secao"]
        )

        # ----------------------------------------------------
        # Variações absolutas
        # ----------------------------------------------------

        vizinhanca[
            "delta_total"
        ] = (
            vizinhanca["votos_totais_t2"]
            -
            vizinhanca["votos_totais_t1"]
        )

        vizinhanca[
            "delta_lula"
        ] = (
            vizinhanca["lula_t2"]
            -
            vizinhanca["lula_t1"]
        )

        vizinhanca[
            "delta_bolsonaro"
        ] = (
            vizinhanca["bolsonaro_t2"]
            -
            vizinhanca[
                "bolsonaro_t1"
            ]
        )

        vizinhanca[
            "delta_branco"
        ] = (
            vizinhanca["branco_t2"]
            -
            vizinhanca["branco_t1"]
        )

        vizinhanca[
            "delta_nulo"
        ] = (
            vizinhanca["nulo_t2"]
            -
            vizinhanca["nulo_t1"]
        )

        # ----------------------------------------------------
        # Participação / shares
        # ----------------------------------------------------

        vizinhanca[
            "lula_share_t1"
        ] = (
            vizinhanca["lula_t1"]
            /
            vizinhanca["votos_validos_t1"]
            * 100
        ).where(
            vizinhanca[
                "votos_validos_t1"
            ] > 0,
            0
        )

        vizinhanca[
            "lula_share_t2"
        ] = (
            vizinhanca["lula_t2"]
            /
            vizinhanca["votos_validos_t2"]
            * 100
        ).where(
            vizinhanca[
                "votos_validos_t2"
            ] > 0,
            0
        )

        vizinhanca[
            "bolsonaro_share_t1"
        ] = (
            vizinhanca[
                "bolsonaro_t1"
            ]
            /
            vizinhanca[
                "votos_validos_t1"
            ]
            * 100
        ).where(
            vizinhanca[
                "votos_validos_t1"
            ] > 0,
            0
        )

        vizinhanca[
            "bolsonaro_share_t2"
        ] = (
            vizinhanca[
                "bolsonaro_t2"
            ]
            /
            vizinhanca[
                "votos_validos_t2"
            ]
            * 100
        ).where(
            vizinhanca[
                "votos_validos_t2"
            ] > 0,
            0
        )

        vizinhanca[
            "branco_share_t1"
        ] = (
            vizinhanca["branco_t1"]
            /
            vizinhanca["votos_totais_t1"]
            * 100
        ).where(
            vizinhanca[
                "votos_totais_t1"
            ] > 0,
            0
        )

        vizinhanca[
            "branco_share_t2"
        ] = (
            vizinhanca["branco_t2"]
            /
            vizinhanca["votos_totais_t2"]
            * 100
        ).where(
            vizinhanca[
                "votos_totais_t2"
            ] > 0,
            0
        )

        vizinhanca[
            "nulo_share_t1"
        ] = (
            vizinhanca["nulo_t1"]
            /
            vizinhanca["votos_totais_t1"]
            * 100
        ).where(
            vizinhanca[
                "votos_totais_t1"
            ] > 0,
            0
        )

        vizinhanca[
            "nulo_share_t2"
        ] = (
            vizinhanca["nulo_t2"]
            /
            vizinhanca["votos_totais_t2"]
            * 100
        ).where(
            vizinhanca[
                "votos_totais_t2"
            ] > 0,
            0
        )

        vizinhanca[
            "delta_lula_pp"
        ] = (
            vizinhanca["lula_share_t2"]
            -
            vizinhanca["lula_share_t1"]
        )

        vizinhanca[
            "delta_bolsonaro_pp"
        ] = (
            vizinhanca[
                "bolsonaro_share_t2"
            ]
            -
            vizinhanca[
                "bolsonaro_share_t1"
            ]
        )

        vizinhanca[
            "delta_branco_pp"
        ] = (
            vizinhanca[
                "branco_share_t2"
            ]
            -
            vizinhanca[
                "branco_share_t1"
            ]
        )

        vizinhanca[
            "delta_nulo_pp"
        ] = (
            vizinhanca[
                "nulo_share_t2"
            ]
            -
            vizinhanca[
                "nulo_share_t1"
            ]
        )

        resultados.append(
            vizinhanca
        )

    if not resultados:
        raise RuntimeError(
            "Nenhuma seção encontrada."
        )

    final = pd.concat(
        resultados,
        ignore_index=True
    )

    final = final.sort_values(
        [
            "caso",
            "distancia_secao",
        ]
    )

    # ========================================================
    # SAÍDA
    # ========================================================

    colunas_saida = [
        "caso",
        "uf",
        "municipio",
        "codigo_municipio_tse",
        "zona",
        "secao",
        "secao_analisada",
        "distancia_secao",

        "votos_totais_t1",
        "votos_totais_t2",
        "delta_total",

        "lula_t1",
        "lula_t2",
        "delta_lula",
        "lula_share_t1",
        "lula_share_t2",
        "delta_lula_pp",

        "bolsonaro_t1",
        "bolsonaro_t2",
        "delta_bolsonaro",
        "bolsonaro_share_t1",
        "bolsonaro_share_t2",
        "delta_bolsonaro_pp",

        "branco_t1",
        "branco_t2",
        "delta_branco",
        "branco_share_t1",
        "branco_share_t2",
        "delta_branco_pp",

        "nulo_t1",
        "nulo_t2",
        "delta_nulo",
        "nulo_share_t1",
        "nulo_share_t2",
        "delta_nulo_pp",
    ]

    final = final[
        colunas_saida
    ].copy()

    final.to_csv(
        ARQUIVO_SAIDA,
        index=False,
        encoding="utf-8-sig"
    )

    print(
        "\n=== ARQUIVO GERADO ==="
    )

    print(
        ARQUIVO_SAIDA
    )

    # ========================================================
    # RESUMO
    # ========================================================

    print(
        "\n=== RESUMO ===\n"
    )

    for caso in CASOS:
        trecho = final[
            final["caso"] == caso["id"]
        ].copy()

        print(
            f"\n{caso['id']} "
            f"— zona {caso['zona']} "
            f"— seção central {caso['secao']}"
        )

        print(
            trecho[
                [
                    "secao",
                    "distancia_secao",
                    "votos_totais_t1",
                    "votos_totais_t2",
                    "delta_total",
                    "lula_t1",
                    "lula_t2",
                    "delta_lula_pp",
                    "bolsonaro_t1",
                    "bolsonaro_t2",
                    "delta_bolsonaro_pp",
                    "nulo_t1",
                    "nulo_t2",
                    "delta_nulo_pp",
                ]
            ].to_string(
                index=False
            )
        )

    print(
        "\n=== FIM ===\n"
    )


if __name__ == "__main__":
    main()