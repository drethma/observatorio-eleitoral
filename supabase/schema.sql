-- Estrutura inicial. Os dados oficiais serão adicionados pelos coletores.
create extension if not exists pgcrypto;

create table if not exists elections (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  round integer not null default 1,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references elections(id) on delete cascade,
  number integer not null,
  name text not null,
  office text not null,
  party text,
  unique (election_id, number, office)
);

create table if not exists result_snapshots (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references elections(id) on delete cascade,
  captured_at timestamptz not null,
  state_code char(2),
  municipality_code text,
  office text not null,
  candidate_id uuid references candidates(id) on delete set null,
  votes bigint not null default 0,
  source_file text,
  source_hash text,
  created_at timestamptz not null default now()
);

create table if not exists ballot_bulletins (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references elections(id) on delete cascade,
  state_code char(2),
  municipality_code text,
  zone integer,
  section integer,
  file_name text not null,
  sha256 text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received'
);

create index if not exists idx_results_election_time on result_snapshots(election_id, captured_at desc);
create index if not exists idx_results_scope on result_snapshots(state_code, municipality_code, office);
create index if not exists idx_bu_scope on ballot_bulletins(state_code, municipality_code, zone, section);

alter table elections enable row level security;
alter table candidates enable row level security;
alter table result_snapshots enable row level security;
alter table ballot_bulletins enable row level security;

-- Leitura pública apenas para dados publicados. Escrita será feita pelo backend/coletor com chave segura.
create policy "public read elections" on elections for select using (true);
create policy "public read candidates" on candidates for select using (true);
create policy "public read result snapshots" on result_snapshots for select using (true);
create policy "public read ballot bulletins" on ballot_bulletins for select using (true);
