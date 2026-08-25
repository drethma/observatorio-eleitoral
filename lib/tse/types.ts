export type TseHttpMeta = {
  etag: string | null;
  lastModified: string | null;
  status: number;
  url: string;
};

export type TseFetchResult<T> = {
  data: T | null;
  changed: boolean;
  notModified: boolean;
  meta: TseHttpMeta;
};

export type TseElectionConfig = {
  [key: string]: unknown;
};

export type TseConfigEntry = {
  [key: string]: unknown;
};

export type TseEnvironment = "oficial" | "simulado";

export type TseRuntimeConfig = {
  environment: TseEnvironment;
  baseUrl: string;
  electionConfigPath: string;
};

export type TseElection = {
  code?: string | number;
  id?: string | number;
  name?: string;
  description?: string;

  cycle?: string | number;
  pleito?: string | number;
  election?: string | number;

  [key: string]: unknown;
};