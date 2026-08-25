import type {
  TseFetchResult,
} from "./types";

type FetchOptions = {
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
};

export class TseClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      (
        baseUrl ??
        process.env.TSE_BASE_URL ??
        "https://resultados.tse.jus.br/oficial"
      ).replace(/\/+$/, "");
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  buildUrl(path: string) {
    if (
      /^https?:\/\//i.test(path)
    ) {
      return path;
    }

    const normalizedPath =
      path.startsWith("/")
        ? path
        : `/${path}`;

    return `${this.baseUrl}${normalizedPath}`;
  }

  async getJson<T>(
    path: string,
    options: FetchOptions = {}
  ): Promise<TseFetchResult<T>> {
    const url =
      this.buildUrl(path);

    const controller =
      new AbortController();

    const timeout =
      setTimeout(() => {
        controller.abort();
      }, options.timeoutMs ?? 15_000);

    const headers: Record<
      string,
      string
    > = {
      Accept:
        "application/json",
      "User-Agent":
        "Observatorio-Eleitoral/0.1",
    };

    if (options.etag) {
      headers["If-None-Match"] =
        options.etag;
    }

    if (options.lastModified) {
      headers["If-Modified-Since"] =
        options.lastModified;
    }

    try {
      const response =
        await fetch(url, {
          method: "GET",
          headers,
          cache: "no-store",
          redirect: "follow",
          signal:
            controller.signal,
        });

      const etag =
        response.headers.get(
          "etag"
        );

      const lastModified =
        response.headers.get(
          "last-modified"
        );

      // --------------------------------------------------
      // 304 - arquivo não mudou
      // --------------------------------------------------

      if (
        response.status === 304
      ) {
        return {
          data: null,
          changed: false,
          notModified: true,

          meta: {
            etag,
            lastModified,
            status:
              response.status,
            url,
          },
        };
      }

      // --------------------------------------------------
      // ERRO HTTP
      // --------------------------------------------------

      if (!response.ok) {
        const body =
          await response.text();

        throw new Error(
          `TSE HTTP ${response.status} em ${url}${
            body
              ? `: ${body.slice(
                  0,
                  300
                )}`
              : ""
          }`
        );
      }

      // --------------------------------------------------
      // JSON
      // --------------------------------------------------

      const data =
        (await response.json()) as T;

      return {
        data,
        changed: true,
        notModified: false,

        meta: {
          etag,
          lastModified,
          status:
            response.status,
          url,
        },
      };
    } catch (error) {
      if (
        error instanceof
          DOMException &&
        error.name ===
          "AbortError"
      ) {
        throw new Error(
          `Timeout ao consultar o TSE: ${url}`
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}