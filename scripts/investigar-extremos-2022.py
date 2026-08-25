from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq


ARQUIVO = Path(
    "data/historico/tse-2022-completo.parquet"
)

# Três casos extremos encontrados na análise local
CASOS = [
    {
        "nome": "Manoel Urbano",
        "uf": "AC",
        "municipio_codigo": "1554",
        "zona_codigo": "3",
        "secao_codigo": "100",
    },
    {
        "nome": "Seabra",
        "uf": "BA",
        "municipio_codigo": "38970",
        "zona_codigo": "88",
        "secao_codigo": "65",
    },
    {
        "nome": "Feijó",
        "uf": "AC",
        "municipio_codigo": "1139",
        "zona_codigo": "7",
        "secao_codigo": "67",
    },
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


def grupo_votacao(numero, tipo):
    numero = int(numero or 0)
    tipo = str(tipo or "").lower()

    if numero == 13:
        return "LULA"

    if numero == 22:
        return "BOLSONARO"

    if numero == 95 or tipo == "branco":
        return "BRANCO"

    if numero == 96 or tipo == "nulo":
        return "NULO"

    if tipo == "candidato":
        return "OUTROS CANDIDATOS"

    return "OUTROS"


def imprimir_totais(df, titulo):
    print(f"\n{'=' * 80}")
    print(titulo)
    print(f"{'=' * 80}")

    if df.empty:
        print("Nenhum registro.")
        return

    agrupado = (
        df.groupby(
            ["turno", "grupo"],
            as_index=False
        )["votos"]
        .sum()
    )

    for turno in [1, 2]:
        print(f"\nTurno {turno}:")

        trecho = agrupado[
            agrupado["turno"] == turno
        ]

        if trecho.empty:
            print("  sem dados")
            continue

        for _, row in trecho.iterrows():
            print(
                f"  {row['grupo']:<22} "
                f"{int(row['votos']):>10,}".replace(",", ".")
            )

        total = int(
            trecho["votos"].sum()
        )

        print(
            f"  {'TOTAL':<22} "
            f"{total:>10,}".replace(",", ".")
        )


def imprimir_comparacao_secao(
    df_secao,
    df_municipio,
    caso
):
    print(
        f"\n\n{'#' * 90}\n"
        f"{caso['uf']} — {caso['nome']} — "
        f"Município {caso['municipio_codigo']} — "
        f"Zona {caso['zona_codigo']} — "
        f"Seção {caso['secao_codigo']}\n"
        f"{'#' * 90}"
    )

    # --------------------------------------------------------
    # Identificação da seção
    # --------------------------------------------------------

    print("\nIDENTIFICAÇÃO")

    identificacao = (
        df_secao[
            [
                "uf",
                "municipio",
                "codigo_municipio_tse",
                "codigo_zona_tse",
                "codigo_secao_tse",
                "zona",
                "secao",
            ]
        ]
        .drop_duplicates()
    )

    print(
        identificacao.to_string(
            index=False
        )
    )

    # --------------------------------------------------------
    # Números completos da seção
    # --------------------------------------------------------

    print("\nVOTOS DA SEÇÃO")

    secao = df_secao.copy()

    secao["grupo"] = [
        grupo_votacao(
            numero,
            tipo
        )
        for numero, tipo in zip(
            secao["numero_candidato"],
            secao["tipo_votavel"]
        )
    ]

    for turno in [1, 2]:
        print(
            f"\n--- {turno}º TURNO ---"
        )

        trecho = (
            secao[
                secao["turno"] == turno
            ]
            .groupby(
                [
                    "numero_candidato",
                    "candidato",
                    "tipo_votavel",
                    "grupo",
                ],
                as_index=False
            )["votos"]
            .sum()
            .sort_values(
                "votos",
                ascending=False
            )
        )

        if trecho.empty:
            print("Sem dados.")
            continue

        print(
            trecho.to_string(
                index=False
            )
        )

        total = int(
            trecho["votos"].sum()
        )

        print(
            f"\nTOTAL DA SEÇÃO: {total}"
        )

    # --------------------------------------------------------
    # Resumo da seção
    # --------------------------------------------------------

    resumo_secao = (
        secao.groupby(
            ["turno", "grupo"],
            as_index=False
        )["votos"]
        .sum()
        .pivot(
            index="grupo",
            columns="turno",
            values="votos"
        )
        .fillna(0)
    )

    for turno in [1, 2]:
        if turno not in resumo_secao.columns:
            resumo_secao[turno] = 0

    resumo_secao["variacao"] = (
        resumo_secao[2]
        -
        resumo_secao[1]
    )

    print(
        "\nRESUMO COMPARATIVO DA SEÇÃO"
    )

    print(
        resumo_secao[
            [1, 2, "variacao"]
        ]
        .rename(
            columns={
                1: "1o_turno",
                2: "2o_turno",
            }
        )
        .to_string()
    )

    # --------------------------------------------------------
    # Município inteiro
    # --------------------------------------------------------

    municipio = df_municipio.copy()

    municipio["grupo"] = [
        grupo_votacao(
            numero,
            tipo
        )
        for numero, tipo in zip(
            municipio["numero_candidato"],
            municipio["tipo_votavel"]
        )
    ]

    imprimir_totais(
        municipio,
        "TOTAL DO MUNICÍPIO"
    )

    # --------------------------------------------------------
    # Participação da seção no município
    # --------------------------------------------------------

    print(
        "\nPARTICIPAÇÃO DA SEÇÃO NO MUNICÍPIO"
    )

    for turno in [1, 2]:
        secao_total = int(
            secao.loc[
                secao["turno"] == turno,
                "votos"
            ].sum()
        )

        municipio_total = int(
            municipio.loc[
                municipio["turno"] == turno,
                "votos"
            ].sum()
        )

        if municipio_total > 0:
            participacao = (
                secao_total /
                municipio_total *
                100
            )
        else:
            participacao = 0

        print(
            f"Turno {turno}: "
            f"seção={secao_total:,} | "
            f"município={municipio_total:,} | "
            f"participação={participacao:.4f}%"
            .replace(",", ".")
        )

    # --------------------------------------------------------
    # Distribuição Lula/Bolsonaro
    # --------------------------------------------------------

    print(
        "\nLULA x BOLSONARO"
    )

    for turno in [1, 2]:
        trecho_secao = (
            secao[
                secao["turno"] == turno
            ]
        )

        trecho_municipio = (
            municipio[
                municipio["turno"] == turno
            ]
        )

        lula_secao = int(
            trecho_secao.loc[
                trecho_secao[
                    "numero_candidato"
                ] == 13,
                "votos"
            ].sum()
        )

        bolsonaro_secao = int(
            trecho_secao.loc[
                trecho_secao[
                    "numero_candidato"
                ] == 22,
                "votos"
            ].sum()
        )

        lula_municipio = int(
            trecho_municipio.loc[
                trecho_municipio[
                    "numero_candidato"
                ] == 13,
                "votos"
            ].sum()
        )

        bolsonaro_municipio = int(
            trecho_municipio.loc[
                trecho_municipio[
                    "numero_candidato"
                ] == 22,
                "votos"
            ].sum()
        )

        validos_secao = int(
            trecho_secao[
                trecho_secao[
                    "tipo_votavel"
                ].astype(str).str.lower()
                == "candidato"
            ]["votos"].sum()
        )

        validos_municipio = int(
            trecho_municipio[
                trecho_municipio[
                    "tipo_votavel"
                ].astype(str).str.lower()
                == "candidato"
            ]["votos"].sum()
        )

        share_lula_secao = (
            lula_secao /
            validos_secao *
            100
            if validos_secao > 0
            else 0
        )

        share_bolsonaro_secao = (
            bolsonaro_secao /
            validos_secao *
            100
            if validos_secao > 0
            else 0
        )

        share_lula_municipio = (
            lula_municipio /
            validos_municipio *
            100
            if validos_municipio > 0
            else 0
        )

        share_bolsonaro_municipio = (
            bolsonaro_municipio /
            validos_municipio *
            100
            if validos_municipio > 0
            else 0
        )

        print(
            f"\nTurno {turno}:"
        )

        print(
            f"  Lula: "
            f"seção={lula_secao} "
            f"({share_lula_secao:.2f}%) | "
            f"município={lula_municipio} "
            f"({share_lula_municipio:.2f}%)"
        )

        print(
            f"  Bolsonaro: "
            f"seção={bolsonaro_secao} "
            f"({share_bolsonaro_secao:.2f}%) | "
            f"município={bolsonaro_municipio} "
            f"({share_bolsonaro_municipio:.2f}%)"
        )


def main():
    if not ARQUIVO.exists():
        raise FileNotFoundError(
            f"Arquivo não encontrado: {ARQUIVO}"
        )

    print(
        "\nLendo Parquet..."
    )

    tabela = pq.read_table(
        ARQUIVO,
        columns=COLUNAS
    )

    df = tabela.to_pandas()

    print(
        f"Registros carregados: "
        f"{len(df):,}".replace(",", ".")
    )

    # Tipagem
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

    # Chaves como string
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
    # Cada caso
    # --------------------------------------------------------

    for caso in CASOS:
        mascara_secao = (
            (df["uf"] == caso["uf"])
            &
            (
                df[
                    "codigo_municipio_tse"
                ]
                == caso["municipio_codigo"]
            )
            &
            (
                df[
                    "codigo_zona_tse"
                ]
                == caso["zona_codigo"]
            )
            &
            (
                df[
                    "codigo_secao_tse"
                ]
                == caso["secao_codigo"]
            )
        )

        df_secao = df[
            mascara_secao
        ].copy()

        mascara_municipio = (
            (df["uf"] == caso["uf"])
            &
            (
                df[
                    "codigo_municipio_tse"
                ]
                == caso["municipio_codigo"]
            )
        )

        df_municipio = df[
            mascara_municipio
        ].copy()

        imprimir_comparacao_secao(
            df_secao,
            df_municipio,
            caso
        )


if __name__ == "__main__":
    main()