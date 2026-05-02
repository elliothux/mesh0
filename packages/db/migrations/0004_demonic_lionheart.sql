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
	`runner_token_hash` text NOT NULL,
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
	`runner_token_hash`,
	`created_at`,
	`started_at`,
	`finished_at`,
	`last_message`
)
SELECT
	`id`,
	`user_id`,
	`input`,
	`status`,
	`artifacts`,
	'legacy_runner_token_unavailable',
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
