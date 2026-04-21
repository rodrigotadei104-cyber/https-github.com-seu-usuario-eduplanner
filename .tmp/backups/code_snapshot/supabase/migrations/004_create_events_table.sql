-- Create Events table
create table public.events (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid not null,
  name text not null,
  type text not null default 'outro', -- 'reuniao', 'treinamento', 'feedback', 'outro'
  date date not null,
  start_time time not null,
  end_time time not null,
  instructor_id uuid references public.instrutores(id),
  room text,
  status text not null default 'agendado', -- 'agendado', 'concluido', 'cancelado'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies
alter table public.events enable row level security;

create policy "Events are viewable by tenant users"
  on public.events for select
  using ( tenant_id = public.get_current_tenant_id() );

create policy "Events are insertable by tenant editors/admins"
  on public.events for insert
  with check (
    tenant_id = public.get_current_tenant_id()
    and exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('admin', 'editor')
    )
  );

create policy "Events are updateable by tenant editors/admins"
  on public.events for update
  using (
    tenant_id = public.get_current_tenant_id()
    and exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('admin', 'editor')
    )
  );

create policy "Events are deletable by tenant editors/admins"
  on public.events for delete
  using (
    tenant_id = public.get_current_tenant_id()
    and exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('admin', 'editor')
    )
  );
