alter table users add column google_refresh_token text;
alter table users add column drive_backup_enabled boolean not null default false;
alter table users add column last_drive_backup_at timestamptz;
