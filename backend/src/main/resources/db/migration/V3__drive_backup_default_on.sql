-- Backup is a default-on feature; the Drive grant is taken during sign-in.
alter table users alter column drive_backup_enabled set default true;
update users set drive_backup_enabled = true where google_refresh_token is not null;
