-- SOLBRIEF schema. Run in the Supabase SQL editor (or `supabase db push`).
-- All access goes through the server with the service role key; RLS is
-- enabled with no policies so the anon key can read nothing.

create extension if not exists pgcrypto;

-- ── Users & auth ─────────────────────────────────────────────
create table if not exists users (
  wallet              text primary key,
  balance             numeric     not null default 0,
  tier                text        not null default 'FREE' check (tier in ('FREE','HOLDER','WHALE')),
  balance_checked_at  timestamptz,
  topics              jsonb       not null default '[]'::jsonb,
  telegram_chat_id    text,
  email               text,
  delivery_channel    text check (delivery_channel in ('telegram','email')),
  delivery_enabled    boolean     not null default false,
  created_at          timestamptz not null default now(),
  last_login_at       timestamptz
);
create index if not exists users_balance_checked_idx on users (balance_checked_at);

create table if not exists auth_nonces (
  nonce       text primary key,
  wallet      text        not null,
  message     text        not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists auth_nonces_expires_idx on auth_nonces (expires_at);

-- ── Usage counters (per wallet, per UTC day, per feature) ─────
create table if not exists usage_counters (
  wallet  text not null,
  day     date not null,
  kind    text not null,
  count   int  not null default 0,
  primary key (wallet, day, kind)
);

-- Atomically consume one unit of a daily quota. Returns allowed=false when the
-- limit is already reached (the counter is not incremented in that case).
create or replace function consume_usage(p_wallet text, p_kind text, p_limit int)
returns table (allowed boolean, used int)
language plpgsql
as $$
declare
  v_day   date := (now() at time zone 'utc')::date;
  v_count int;
begin
  insert into usage_counters (wallet, day, kind, count)
  values (p_wallet, v_day, p_kind, 0)
  on conflict (wallet, day, kind) do nothing;

  update usage_counters
     set count = count + 1
   where wallet = p_wallet and day = v_day and kind = p_kind and count < p_limit
  returning count into v_count;

  if v_count is null then
    select c.count into v_count from usage_counters c
     where c.wallet = p_wallet and c.day = v_day and c.kind = p_kind;
    return query select false, coalesce(v_count, 0);
  else
    return query select true, v_count;
  end if;
end;
$$;

-- Give a unit back when the work it paid for failed on our side.
create or replace function refund_usage(p_wallet text, p_kind text)
returns void
language sql
as $$
  update usage_counters
     set count = greatest(count - 1, 0)
   where wallet = p_wallet
     and day = (now() at time zone 'utc')::date
     and kind = p_kind;
$$;

-- ── Pipeline bookkeeping ─────────────────────────────────────
create table if not exists pipeline_runs (
  id           uuid primary key default gen_random_uuid(),
  kind         text        not null check (kind in ('daily','refresh','manual')),
  status       text        not null default 'running' check (status in ('running','success','partial','failed')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  stats        jsonb       not null default '{}'::jsonb,
  error        text
);
create index if not exists pipeline_runs_started_idx on pipeline_runs (started_at desc);

create table if not exists fetch_logs (
  id           bigint generated always as identity primary key,
  run_id       uuid references pipeline_runs (id) on delete cascade,
  source       text        not null,
  ok           boolean     not null,
  duration_ms  int         not null default 0,
  attempts     int         not null default 1,
  items        int         not null default 0,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists fetch_logs_created_idx on fetch_logs (created_at desc);

create table if not exists raw_snapshots (
  id          bigint generated always as identity primary key,
  run_id      uuid references pipeline_runs (id) on delete cascade,
  source      text        not null,
  fetched_at  timestamptz not null default now(),
  payload     jsonb       not null
);
create index if not exists raw_snapshots_source_idx on raw_snapshots (source, fetched_at desc);

-- One row per pair per run; drives 7-day volume averages and 24h liquidity deltas.
create table if not exists pair_snapshots (
  id                bigint generated always as identity primary key,
  run_id            uuid references pipeline_runs (id) on delete cascade,
  captured_at       timestamptz not null default now(),
  pair_address      text        not null,
  token_address     text        not null,
  symbol            text,
  name              text,
  dex_id            text,
  price_usd         double precision,
  volume_h24        double precision,
  liquidity_usd     double precision,
  fdv               double precision,
  market_cap        double precision,
  price_change_h24  double precision,
  pair_created_at   timestamptz
);
create index if not exists pair_snapshots_pair_idx on pair_snapshots (pair_address, captured_at desc);

-- Cached per-token on-chain risk data (mint/freeze authority, holders, LP lock).
create table if not exists token_risk (
  token_address  text primary key,
  data           jsonb       not null,
  checked_at     timestamptz not null default now()
);

-- ── Content ──────────────────────────────────────────────────
create table if not exists rss_feeds (
  id          text primary key,
  name        text        not null,
  url         text        not null,
  category    text        not null default 'news',
  keywords    text[]      not null default '{}',
  enabled     boolean     not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists news_items (
  id            bigint generated always as identity primary key,
  guid          text        not null unique,
  feed_id       text        not null,
  source_name   text        not null,
  title         text        not null,
  link          text        not null,
  summary       text,
  published_at  timestamptz,
  fetched_at    timestamptz not null default now()
);
create index if not exists news_items_published_idx on news_items (published_at desc);

create table if not exists briefs (
  id                uuid primary key default gen_random_uuid(),
  brief_date        date        not null unique,
  status            text        not null default 'published' check (status in ('published','failed')),
  published_at      timestamptz not null default now(),
  content           jsonb       not null,
  facts             jsonb       not null,
  model             text,
  omitted_sections  text[]      not null default '{}',
  run_id            uuid references pipeline_runs (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists briefs_published_idx on briefs (published_at desc);

-- Personalized sections are cached per topic per day (not per user), so cost
-- scales with distinct topics rather than with holders.
create table if not exists topic_sections (
  brief_date  date        not null,
  topic_key   text        not null,
  content     jsonb       not null,
  created_at  timestamptz not null default now(),
  primary key (brief_date, topic_key)
);

create table if not exists research_reports (
  id            uuid primary key default gen_random_uuid(),
  wallet        text        not null,
  query         text        not null,
  status        text        not null default 'pending' check (status in ('pending','complete','failed')),
  content       jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists research_reports_wallet_idx on research_reports (wallet, created_at desc);

create table if not exists ask_log (
  id          bigint generated always as identity primary key,
  wallet      text        not null,
  brief_date  date,
  question    text        not null,
  answer      jsonb       not null,
  created_at  timestamptz not null default now()
);
create index if not exists ask_log_wallet_idx on ask_log (wallet, created_at desc);

create table if not exists delivery_log (
  id          bigint generated always as identity primary key,
  wallet      text        not null,
  brief_date  date        not null,
  channel     text        not null,
  ok          boolean     not null,
  error       text,
  created_at  timestamptz not null default now(),
  unique (wallet, brief_date, channel)
);

-- ── Lock everything down: server-only access via service role ─
alter table users             enable row level security;
alter table auth_nonces       enable row level security;
alter table usage_counters    enable row level security;
alter table pipeline_runs     enable row level security;
alter table fetch_logs        enable row level security;
alter table raw_snapshots     enable row level security;
alter table pair_snapshots    enable row level security;
alter table token_risk        enable row level security;
alter table rss_feeds         enable row level security;
alter table news_items        enable row level security;
alter table briefs            enable row level security;
alter table topic_sections    enable row level security;
alter table research_reports  enable row level security;
alter table ask_log           enable row level security;
alter table delivery_log      enable row level security;

revoke execute on function consume_usage(text, text, int) from public, anon, authenticated;
revoke execute on function refund_usage(text, text) from public, anon, authenticated;
