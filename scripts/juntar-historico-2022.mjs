import os
import pyarrow as pa
import pyarrow.parquet as pq


ARQUIVO_1 = r"data/historico/tse-2022-resultados.parquet"
ARQUIVO_2 = r"data/historico/tse-2022-restante.parquet"
ARQUIVO_SAIDA = r"data/historico/tse-2022-completo.parquet"


def schema_final():
    return pa.schema([
        pa.field("resultado_id", pa.int64(), nullable=True),
        pa.field("eleicao_id", pa.int64(), nullable=True),
        pa.field("ano", pa.int32()),
        pa.field("turno", pa.int32()),
        pa.field("codigo_eleicao_tse", pa.string()),
        pa.field("eleicao", pa.string()),
        pa.field("candidato_id", pa.int64(), nullable=True),
        pa.field("numero_candidato", pa.int32()),
        pa.field("candidato", pa.string()),
        pa.field("tipo_votavel", pa.string()),
        pa.field("cargo_id", pa.int64(), nullable=True),
        pa.field("cargo", pa.string()),
        pa.field("localidade_id", pa.int64(), nullable=True),
        pa.field("uf", pa.string()),
        pa.field("municipio", pa.string()),
        pa.field("codigo_municipio_tse", pa.string()),
        pa.field("zona", pa.int32()),
        pa.field("secao", pa.int32()),
        pa.field("codigo_zona_tse", pa.string()),
        pa.field("codigo_secao_tse", pa.string()),
        pa.field("votos", pa.int64()),
        pa.field(
            "atualizado_em",
            pa.timestamp("ms", tz="UTC"),
            nullable=True,
        ),
        pa.field("coleta_id", pa.int64(), nullable=True),
    ])


def converter_parte_1(table):
    colunas = {
        "resultado_id": table["resultado_id"],
        "eleicao_id": table["eleicao_id"],
        "ano": table["ano"],
        "turno": table["turno"],
        "codigo_eleicao_tse": table["codigo_eleicao_tse"],
        "eleicao": table["eleicao"],
        "candidato_id": table["candidato_id"],
        "numero_candidato": table["numero_candidato"],
        "candidato": table["candidato"],
        "tipo_votavel": table["tipo_votavel"],
        "cargo_id": table["cargo_id"],
        "cargo": table["cargo"],
        "localidade_id": table["localidade_id"],
        "uf": table["uf"],
        "municipio": table["municipio"],
        "codigo_municipio_tse": table["codigo_municipio_tse"],
        "zona": table["zona"],
        "secao": table["secao"],
        "codigo_zona_tse": table["codigo_zona_tse"],
        "codigo_secao_tse": table["codigo_secao_tse"],
        "votos": table["votos"],
        "atualizado_em": table["atualizado_em"],
        "coleta_id": table["coleta_id"],
    }

    return pa.table(
        colunas,
        schema=schema_final(),
    )


def converter_parte_2(table):
    rows = table.to_pylist()

    converted = []

    for row in rows:
        codigo = str(
            row.get(
                "codigo_eleicao_tse",
                "",
            )
        )

        eleicao_id = {
            "544": 3,
            "545": 4,
        }.get(
            codigo
        )

        converted.append(
            {
                "resultado_id": None,
                "eleicao_id": eleicao_id,
                "ano": int(
                    row.get(
                        "ano",
                        0,
                    )
                    or 0
                ),
                "turno": int(
                    row.get(
                        "turno",
                        0,
                    )
                    or 0
                ),
                "codigo_eleicao_tse": codigo,
                "eleicao": str(
                    row.get(
                        "eleicao",
                        "",
                    )
                    or ""
                ),
                "candidato_id": None,
                "numero_candidato": int(
                    row.get(
                        "numero_votavel",
                        0,
                    )
                    or 0
                ),
                "candidato": str(
                    row.get(
                        "nome_votavel",
                        "",
                    )
                    or ""
                ),
                "tipo_votavel": str(
                    row.get(
                        "tipo_votavel",
                        "",
                    )
                    or ""
                ),
                "cargo_id": 6,
                "cargo": str(
                    row.get(
                        "cargo",
                        "PRESIDENTE",
                    )
                    or "PRESIDENTE"
                ),
                "localidade_id": None,
                "uf": str(
                    row.get(
                        "uf",
                        "",
                    )
                    or ""
                ),
                "municipio": str(
                    row.get(
                        "municipio",
                        "",
                    )
                    or ""
                ),
                "codigo_municipio_tse": str(
                    row.get(
                        "codigo_municipio_tse",
                        "",
                    )
                    or ""
                ),
                "zona": int(
                    row.get(
                        "zona",
                        0,
                    )
                    or 0
                ),
                "secao": int(
                    row.get(
                        "secao",
                        0,
                    )
                    or 0
                ),
                "codigo_zona_tse": str(
                    row.get(
                        "zona",
                        "",
                    )
                    or ""
                ),
                "codigo_secao_tse": str(
                    row.get(
                        "secao",
                        "",
                    )
                    or ""
                ),
                "votos": int(
                    row.get(
                        "votos",
                        0,
                    )
                    or 0
                ),
                "atualizado_em": None,
                "coleta_id": None,
            }
        )

    return pa.Table.from_pylist(
        converted,
        schema=schema_final(),
    )


def copiar_parte_1(
    writer,
    stats,
):
    arquivo = pq.ParquetFile(
        ARQUIVO_1
    )

    for batch in arquivo.iter_batches(
        batch_size=100_000
    ):
        table = pa.Table.from_batches(
            [batch]
        )

        tabela_convertida =
        converter_parte_1(
            table
        )

        writer.write_table(
            tabela_convertida
        )

        stats["registros"] += (
            tabela_convertida.num_rows
        )

        stats["votos"] += sum(
            int(v or 0)
            for v in tabela_convertida[
                "votos"
            ].to_pylist()
        )

        print(
            "Parte 1 | registros=",
            f"{stats['registros']:,}".replace(
                ",",
                ".",
            ),
            "| votos=",
            f"{stats['votos']:,}".replace(
                ",",
                ".",
            ),
        )


def copiar_parte_2(
    writer,
    stats,
):
    arquivo = pq.ParquetFile(
        ARQUIVO_2
    )

    for batch in arquivo.iter_batches(
        batch_size=100_000
    ):
        table = pa.Table.from_batches(
            [batch]
        )

        tabela_convertida =
        converter_parte_2(
            table
        )

        writer.write_table(
            tabela_convertida
        )

        stats["registros"] += (
            tabela_convertida.num_rows
        )

        stats["votos"] += sum(
            int(v or 0)
            for v in tabela_convertida[
                "votos"
            ].to_pylist()
        )

        print(
            "Parte 2 | registros=",
            f"{stats['registros']:,}".replace(
                ",",
                ".",
            ),
            "| votos=",
            f"{stats['votos']:,}".replace(
                ",",
                ".",
            ),
        )


def main():
    print(
        "\n=== JUNTANDO HISTORICO TSE 2022 ===\n"
    )

    if not os.path.exists(
        ARQUIVO_1
    ):
        raise FileNotFoundError(
            ARQUIVO_1
        )

    if not os.path.exists(
        ARQUIVO_2
    ):
        raise FileNotFoundError(
            ARQUIVO_2
        )

    if os.path.exists(
        ARQUIVO_SAIDA
    ):
        os.remove(
            ARQUIVO_SAIDA
        )

    writer = pq.ParquetWriter(
        ARQUIVO_SAIDA,
        schema_final(),
        compression="snappy",
        use_dictionary=True,
    )

    stats = {
        "registros": 0,
        "votos": 0,
    }

    try:
        copiar_parte_1(
            writer,
            stats,
        )

        print(
            "\nParte 2..."
        )

        copiar_parte_2(
            writer,
            stats,
        )
    finally:
        writer.close()

    tamanho = os.path.getsize(
        ARQUIVO_SAIDA
    )

    print(
        "\n=== CONCLUIDO ==="
    )

    print(
        "Registros:",
        f"{stats['registros']:,}".replace(
            ",",
            ".",
        ),
    )

    print(
        "Votos:",
        f"{stats['votos']:,}".replace(
            ",",
            ".",
        ),
    )

    print(
        "Arquivo:",
        ARQUIVO_SAIDA,
    )

    print(
        "Tamanho:",
        f"{tamanho / 1024 / 1024:.2f} MB",
    )


if __name__ == "__main__":
    main()