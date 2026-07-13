create table users (
    id                 uuid primary key,
    email              text not null,
    display_name       text,
    timezone           text not null default 'UTC',
    digest_enabled     boolean not null default false,
    digest_time        time not null default '09:00',
    last_digest_date   date,
    starter_offered_at timestamptz,
    focus_minutes      int not null default 25,
    break_minutes      int not null default 5,
    keep_screen_on     boolean not null default false,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create table categories (
    id         uuid primary key,
    user_id    uuid not null references users(id) on delete cascade,
    name       text not null,
    colour_hex text not null default '#2D9960',
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index idx_categories_user_updated on categories(user_id, updated_at);

create table sources (
    id         uuid primary key,
    user_id    uuid not null references users(id) on delete cascade,
    name       text not null,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index idx_sources_user_updated on sources(user_id, updated_at);

create table requestors (
    id         uuid primary key,
    user_id    uuid not null references users(id) on delete cascade,
    name       text not null,
    use_count  int not null default 0,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index idx_requestors_user_updated on requestors(user_id, updated_at);

create table tasks (
    id              uuid primary key,
    user_id         uuid not null references users(id) on delete cascade,
    title           text not null,
    category_id     uuid,
    source_id       uuid,
    requestor_id    uuid,
    due_date        date,
    recurrence      text,
    recurred_from   uuid,
    status          text not null default 'backlog',
    captured_at     timestamptz not null default now(),
    last_acted_at   timestamptz,
    completed_at    timestamptz,
    sort_order      int not null default 0,
    deleted_at      timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index idx_tasks_user_updated on tasks(user_id, updated_at);
create index idx_tasks_user_status on tasks(user_id, status) where deleted_at is null;

create table steps (
    id          uuid primary key,
    task_id     uuid not null references tasks(id) on delete cascade,
    user_id     uuid not null references users(id) on delete cascade,
    title       text not null,
    is_complete boolean not null default false,
    sort_order  int not null default 0,
    deleted_at  timestamptz,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index idx_steps_task on steps(task_id);
create index idx_steps_user_updated on steps(user_id, updated_at);

create table focus_sessions (
    id         uuid primary key,
    user_id    uuid not null references users(id) on delete cascade,
    task_id    uuid not null,
    started_at timestamptz not null,
    ended_at   timestamptz,
    completed  boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index idx_sessions_user_updated on focus_sessions(user_id, updated_at);

create table dopamine_menu_items (
    id               uuid primary key,
    user_id          uuid not null references users(id) on delete cascade,
    course           text not null,
    label            text not null,
    duration_minutes int,
    sort_order       int not null default 0,
    deleted_at       timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index idx_menu_user_updated on dopamine_menu_items(user_id, updated_at);

create table push_subscriptions (
    id         uuid primary key,
    user_id    uuid not null references users(id) on delete cascade,
    endpoint   text not null unique,
    p256dh     text not null,
    auth       text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index idx_push_user on push_subscriptions(user_id);

create table user_activity (
    user_id       uuid not null references users(id) on delete cascade,
    activity_date date not null,
    primary key (user_id, activity_date)
);
