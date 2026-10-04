-- აგრო AI chat log: one row per answered question.
-- Written only by the agro-chat edge function (service role); no public access.
create table if not exists public.chat_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  session_id  text,
  question    text not null,
  has_image   boolean not null default false,
  answer      text,
  model       text,
  stop_reason text,
  usage       jsonb
);

create index if not exists chat_logs_created_at_idx on public.chat_logs (created_at desc);
create index if not exists chat_logs_session_idx on public.chat_logs (session_id);

alter table public.chat_logs enable row level security;
-- No policies: anon/authenticated roles get nothing; the service role bypasses RLS.

-- Daily cost/quality view for the dashboard or an n8n report.
create or replace view public.chat_daily as
select
  date_trunc('day', created_at)                                as day,
  count(*)                                                     as questions,
  count(distinct session_id)                                   as sessions,
  count(*) filter (where has_image)                            as with_photo,
  count(*) filter (where stop_reason in ('refusal', 'error'))  as failed,
  sum((usage->>'input_tokens')::int)                           as input_tokens,
  sum((usage->>'cache_read_input_tokens')::int)                as cache_read_tokens,
  sum((usage->>'output_tokens')::int)                          as output_tokens
from public.chat_logs
group by 1
order by 1 desc;

revoke all on public.chat_daily from anon, authenticated;
