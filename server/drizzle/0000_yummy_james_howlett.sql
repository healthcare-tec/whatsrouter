CREATE TABLE `auth_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_username_unique` ON `auth_users` (`username`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jid` text NOT NULL,
	`phone` text,
	`name` text,
	`is_group` integer DEFAULT false NOT NULL,
	`blocked` integer DEFAULT false NOT NULL,
	`last_notified_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_jid_unique` ON `contacts` (`jid`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`jid` text NOT NULL,
	`kind` text NOT NULL,
	`token` text NOT NULL,
	`title` text,
	`last_activity_at` integer,
	`consolidate_due_at` integer,
	`paused_until` integer,
	`pause_reason` text,
	`last_email_message_id` text,
	`notifications_sent` integer DEFAULT 0 NOT NULL,
	`last_flush_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_jid_unique` ON `conversations` (`jid`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_token_unique` ON `conversations` (`token`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`meta` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `inbound_emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email_message_id` text,
	`conversation_id` integer,
	`from_address` text,
	`to_address` text,
	`subject` text,
	`body_text` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer,
	`processed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_emails_email_message_id_unique` ON `inbound_emails` (`email_message_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`wa_message_id` text,
	`direction` text NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`sender_jid` text,
	`sender_name` text,
	`text` text,
	`transcript` text,
	`media_path` text,
	`media_mime` text,
	`media_name` text,
	`media_size` integer,
	`message_timestamp` integer,
	`outbox_id` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`status` text NOT NULL,
	`subject` text NOT NULL,
	`body_text` text,
	`message_count` integer DEFAULT 0 NOT NULL,
	`from_pause` integer DEFAULT false NOT NULL,
	`email_message_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer,
	`sent_at` integer
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer,
	`expires_at` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer
);
