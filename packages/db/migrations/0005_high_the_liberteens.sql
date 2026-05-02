ALTER TABLE `agent_run_events` ADD `event_type` text;--> statement-breakpoint
ALTER TABLE `agent_run_events` ADD `item_id` text;--> statement-breakpoint
ALTER TABLE `agent_run_events` ADD `item_status` text;--> statement-breakpoint
ALTER TABLE `agent_run_events` ADD `item_type` text;--> statement-breakpoint
CREATE INDEX `agent_run_events_run_id_id_idx` ON `agent_run_events` (`run_id`,`id`);--> statement-breakpoint
CREATE INDEX `agent_run_events_run_id_event_type_idx` ON `agent_run_events` (`run_id`,`event_type`);--> statement-breakpoint
CREATE INDEX `agent_runs_user_id_created_at_idx` ON `agent_runs` (`user_id`,`created_at`);