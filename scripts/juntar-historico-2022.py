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


def ler_parquet(path):
    return pq.ParquetFile(path)


def converter_parte_2(table):
    rows = table.to_pylist()

    converted = []

    for row in rows:
        numero = row.get("numero_votavel", 0)
        nome = row.get("nome_votavel", "")
        tipo = row.get("tipo_votavel", "")
        codigo = str(row.get("codigo_eleicao_tse", ""))
        turno = int(row.get("turno", 0) or 0)
        ano = int(row.get("ano", 0) or 0)

        eleicao_id = {
            "544": 3,
            "545": 4,
        }.get(codigo)

        descricao = row.get("eleicao", "")

        converted.append({
            "resultado_id": None,
            "eleicao_id": eleicao_id,
            "ano": ano,
            "turno": turno,
            "codigo_eleicao_tse": codigo,
            "eleicao": descricao,
            "candidato_id": None,
            "numero_candidato": int(numero or 0),
            "candidato": nome,
            "tipo_votavel": tipo,
            "cargo_id": 6,
            "cargo": row.get("cargo", "PRESIDENTE"),
            "localidade_id": None,
            "uf": row.get("uf", ""),
            "municipio": row.get("municipio", ""),
            "codigo_municipio_tse": row.get(
                "codigo_municipio_tse", ""
            ),
            "zona": int(row.get("zona", 0) or 0),
            "secao": int(row.get("secao", 0) or 0),
            "codigo_zona_tse": str(
                row.get("zona", "") or ""
            ),
            "codigo_secao_tse": str(
                row.get("secao", "") or ""
            ),
            "votos": int(row.get("votos", 0) or 0),
            "atualizado_em": None,
            "coleta_id": None,
        })

    return pa.Table.from_pylist(
        converted,
        schema=schema_final(),
    )


def converter_parte_1(table):
    return table.cast(
        schema_final(),
        safe=False,
    )


def main():
    print("\n=== JUNTANDO HISTORICO TSE 2022 ===\n")

    for arquivo in (
        ARQUIVO_1,
        ARQUIVO_2,
    ):
        if not os.path.exists(arquivo):
            raise FileNotFoundError(
                f"Arquivo nao encontrado: {arquivo}"
            )

    if os.path.exists(ARQUIVO_SAIDA):
        os.remove(ARQUIVO_SAIDA)

    schema = schema_final()

    writer = pq.ParquetWriter(
        ARQUIVO_SAIDA,
        schema,
        compression="snappy",
        use_dictionary=True,
    )

    total = 0
    votos = 0

    try:
        print("Parte 1...")

        p1 = ler_parquet(
            ARQUIVO_1
        )

        for batch in p1.iter_batches(
            batch_size=100_000
        ):
            table = pa.Table.from_batches(
                [batch]
            )

            table = converter_parte_1(
                table
            )

            writer.write_table(
                table
            )

            total += table.num_rows

            votos += sum(
                int(x or 0)
                for x in table["votos"].to_pylist()
            )

            print(
                f"Processados: {total:,} | votos: {votos:,}"
                .replace(",", ".")
            )

        print("\nParte 2...")

        p2 = ler_parquet(
            ARQUIVO_2
        )

        for batch in p2.iter_batches(
            batch_size=100_000
        ):
            table = pa.Table.from_batches(
                [batch]
            )

            table = converter_parte_2(
                table
            )

            writer.write_table(
                table
            )

            total += table.num_rows

            votos += sum(
                int(x or 0)
                for x in table["votos"].to_pylist()
            )

            print(
                f"Processados: {total:,} | votos: {votos:,}"
                .replace(",", ".")
            )

    finally:
        writer.close()

    tamanho = os.path.getsize(
            ARQUIVO_SAIDA
        )

    print("\n=== CONCLUIDO ===")
    print(
        "Registros:",
        f"{total:,}".replace(",", "."),
    )
    print(
        "Votos:",
        f"{votos:,}".replace(",", "."),
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

