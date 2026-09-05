CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_user_id_name_idx` ON `agents` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `agents_user_id_updated_at_idx` ON `agents` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `crons` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`expression` text NOT NULL,
	`invalidate_at` text,
	`definition` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `crons_user_id_updated_at_idx` ON `crons` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`uid` text NOT NULL,
	`name` text NOT NULL,
	`definition` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhooks_uid_name_idx` ON `webhooks` (`uid`,`name`);--> statement-breakpoint
CREATE INDEX `webhooks_user_id_updated_at_idx` ON `webhooks` (`user_id`,`updated_at`);