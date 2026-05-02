CREATE TABLE IF NOT EXISTS `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`secret_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT OR IGNORE INTO `users` (
	`id`,
	`email`,
	`email_verified`,
	`first_name`,
	`last_name`,
	`profile_picture_url`,
	`created_at`,
	`updated_at`,
	`last_sign_in_at`
)
SELECT
	'user_migrated_agent_runs',
	'migrated-runs@mesh0.local',
	1,
	'Migrated',
	'Runs',
	NULL,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	NULL
WHERE EXISTS (SELECT 1 FROM `agent_runs`);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TABLE IF EXISTS `__new_agent_runs`;
--> statement-breakpoint
CREATE TABLE `__new_agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`input` text NOT NULL,
	`status` text NOT NULL,
	`artifacts` text NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`last_message` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent_runs` (
	`id`,
	`user_id`,
	`input`,
	`status`,
	`artifacts`,
	`created_at`,
	`started_at`,
	`finished_at`,
	`last_message`
)
SELECT
	`id`,
	'user_migrated_agent_runs',
	`input`,
	`status`,
	`artifacts`,
	`created_at`,
	`started_at`,
	`finished_at`,
	`last_message`
FROM `agent_runs`;
--> statement-breakpoint
DROP TABLE `agent_runs`;
--> statement-breakpoint
ALTER TABLE `__new_agent_runs` RENAME TO `agent_runs`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
