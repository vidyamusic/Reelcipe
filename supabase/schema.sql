-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles Table (Optional but recommended for OAuth/Extending users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  updated_at timestamp with time zone,
  first_name text,
  last_name text,
  avatar_url text
);

-- Set up Row Level Security (RLS) for profiles
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);

-- 2. Zepto Sessions Table
create table if not exists public.zepto_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  phone_number text not null,
  cookies jsonb default '[]'::jsonb,
  status text default 'pending_otp', -- 'pending_otp', 'authenticated', 'expired', 'failed'
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (user_id) -- Since we only allow one active session per user, we can enforce uniqueness on user_id, overwriting on insert.
);

-- Trigger to update 'updated_at' automatically
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger handle_zepto_sessions_updated_at
  before update on public.zepto_sessions
  for each row execute procedure public.handle_updated_at();

-- RLS for zepto_sessions
alter table public.zepto_sessions enable row level security;
create policy "Users can view own zepto session." on zepto_sessions for select using (auth.uid() = user_id);
create policy "Users can insert own zepto session." on zepto_sessions for insert with check (auth.uid() = user_id);
create policy "Users can update own zepto session." on zepto_sessions for update using (auth.uid() = user_id);
create policy "Users can delete own zepto session." on zepto_sessions for delete using (auth.uid() = user_id);


-- 3. Saved Recipes Table
create table if not exists public.saved_recipes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  reel_url text not null,
  title text,
  raw_text text,
  parsed_ingredients jsonb default '[]'::jsonb,
  parsed_steps jsonb default '[]'::jsonb,
  thumbnail_url text,
  is_published boolean default false,
  user_comment text,
  has_made boolean default false,
  rating integer,
  status text default 'pending', -- 'pending', 'extracting', 'completed', 'failed'
  error_message text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger handle_saved_recipes_updated_at
  before update on public.saved_recipes
  for each row execute procedure public.handle_updated_at();

-- RLS for saved_recipes
alter table public.saved_recipes enable row level security;
create policy "Users can view own recipes." on saved_recipes for select using (auth.uid() = user_id);
create policy "Users can insert own recipes." on saved_recipes for insert with check (auth.uid() = user_id);
create policy "Users can update own recipes." on saved_recipes for update using (auth.uid() = user_id);
create policy "Users can delete own recipes." on saved_recipes for delete using (auth.uid() = user_id);


-- Function to automatically create a profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    '',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
