-- Bigoud Trade : achat unique (niveaux 5 à 10)
-- À coller dans Supabase > SQL Editor > Run. Sans danger si relancé.

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','refunded')),
  stripe_session_id text,
  stripe_payment_intent text,
  amount integer,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

-- L'utilisateur peut LIRE sa propre ligne. Aucune règle d'écriture :
-- seules les fonctions serveur (clé de service) peuvent créer ou modifier.
drop policy if exists "lire son achat" on public.entitlements;
create policy "lire son achat" on public.entitlements
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on public.entitlements from anon, authenticated;

-- Droits explicites (nécessaires sur les projets récents) :
-- le serveur (service_role) écrit, l'utilisateur connecté lit sa propre ligne.
grant all on table public.entitlements to service_role;
grant select on table public.entitlements to authenticated;
